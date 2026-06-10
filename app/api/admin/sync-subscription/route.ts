/**
 * POST /api/admin/sync-subscription
 *
 * Looks up the signed-in user's real Stripe subscription status and syncs
 * their Clerk plan accordingly — upgrades to Pro if active, downgrades to
 * Free if cancelled/no subscription found.
 *
 * Protected by ADMIN_SECRET header so only you can call it.
 * Safe to leave deployed — without the secret it's a 401.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/app/lib/stripe";
import { upgradeUserToPro, downgradeUserToFree, getUserMeta } from "@/app/lib/subscription";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-secret",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  // Gate with admin secret
  const adminSecret = req.headers.get("x-admin-secret");
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: CORS });
    }

    const stripe = getStripe();
    const { privateMeta } = await getUserMeta(userId);

    // Find the Stripe customer — use stored ID or look up by email
    let customerId = privateMeta.stripeCustomerId;
    if (!customerId) {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(userId);
      const email = user.emailAddresses[0]?.emailAddress;
      if (email) {
        const customers = await stripe.customers.list({ email, limit: 5 });
        customerId = customers.data[0]?.id;
      }
    }

    // No Stripe customer at all → definitely free
    if (!customerId) {
      await downgradeUserToFree(userId, "", "no_customer");
      return NextResponse.json({
        success: true,
        result: "free",
        message: "No Stripe customer found — set to Free.",
      }, { headers: CORS });
    }

    // Check for an active subscription
    const activeSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 5,
    });

    if (activeSubs.data.length > 0) {
      const sub = activeSubs.data[0];
      await upgradeUserToPro(userId, {
        stripeCustomerId: customerId,
        subscriptionId: sub.id,
        subscriptionStatus: sub.status,
      });
      return NextResponse.json({
        success: true,
        result: "pro",
        message: `Synced to Pro. Subscription ${sub.id} is active.`,
      }, { headers: CORS });
    }

    // No active sub — check if there's a cancelled one so we can record its ID
    const allSubs = await stripe.subscriptions.list({ customer: customerId, limit: 5 });
    const lastSub = allSubs.data[0];

    await downgradeUserToFree(
      userId,
      lastSub?.id ?? "",
      lastSub?.status ?? "canceled"
    );

    return NextResponse.json({
      success: true,
      result: "free",
      message: `No active subscription found — set to Free. Last subscription status: ${lastSub?.status ?? "none"}.`,
    }, { headers: CORS });

  } catch (err) {
    console.error("[admin/sync-subscription]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: CORS });
  }
}
