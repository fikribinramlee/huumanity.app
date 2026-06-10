import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/app/lib/stripe";
import { upgradeUserToPro, downgradeUserToFree } from "@/app/lib/subscription";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

// Stripe requires the raw body for signature verification — do NOT use req.json()
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Payment completed ─────────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerkUserId;
        if (!clerkUserId || !session.subscription) break;

        const sub = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        await upgradeUserToPro(clerkUserId, {
          stripeCustomerId: session.customer as string,
          subscriptionId: sub.id,
          subscriptionStatus: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          currentPeriodEnd: new Date((sub as any).current_period_end * 1000).toISOString().slice(0, 10),
        });

        console.log(`[webhook] Upgraded ${clerkUserId} to Pro`);
        break;
      }

      // ── Subscription changed (renewal, payment failure, cancellation) ─────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const clerkUserId = sub.metadata?.clerkUserId;
        if (!clerkUserId) break;

        if (sub.status === "active") {
          await upgradeUserToPro(clerkUserId, {
            stripeCustomerId: sub.customer as string,
            subscriptionId: sub.id,
            subscriptionStatus: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodEnd: new Date((sub as any).current_period_end * 1000).toISOString().slice(0, 10),
          });
        } else {
          // past_due, paused, etc. — demote to free
          await downgradeUserToFree(clerkUserId, sub.id, sub.status);
        }

        console.log(`[webhook] Subscription updated for ${clerkUserId}: ${sub.status}, cancel_at_period_end: ${sub.cancel_at_period_end}`);
        break;
      }

      // ── Subscription cancelled / expired ─────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const clerkUserId = sub.metadata?.clerkUserId;
        if (!clerkUserId) break;

        await downgradeUserToFree(clerkUserId, sub.id, "canceled");
        console.log(`[webhook] Downgraded ${clerkUserId} to Free`);
        break;
      }

      default:
        // Unhandled event type — just acknowledge
        break;
    }
  } catch (err) {
    console.error("[webhook] Handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
