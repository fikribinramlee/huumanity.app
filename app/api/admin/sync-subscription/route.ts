/**
 * POST /api/admin/sync-subscription
 *
 * One-time helper: looks up the signed-in user's Stripe subscription
 * and syncs their plan status to Clerk.
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

    // Try to find a subscription via stored customer ID, or search by email
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

    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe customer found for this account. Are you sure this user paid?" },
        { status: 404, headers: CORS }
      );
    }

    // Get all active subscriptions for this customer
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 5,
    });

    if (subs.data.length === 0) {
      // No active sub — check if there's a cancelled/past_due one
      const allSubs = await stripe.subscriptions.list({ customer: customerId, limit: 5 });
      return NextResponse.json({
        message: "No active subscription found.",
        customerId,
        allSubscriptions: allSubs.data.map((s) => ({
          id: s.id,
          status: s.status,
          currentPeriodEnd: new Date((s as any).current_period_end * 1000).toISOString(),
        })),
      }, { headers: CORS });
    }

    const activeSub = subs.data[0];
    await upgradeUserToPro(userId, {
      stripeCustomerId: customerId,
      subscriptionId: activeSub.id,
      subscriptionStatus: activeSub.status,
    });

    return NextResponse.json({
      success: true,
      message: `Synced! User ${userId} is now Pro.`,
      subscriptionId: activeSub.id,
      status: activeSub.status,
      customerId,
    }, { headers: CORS });

  } catch (err) {
    console.error("[admin/sync-subscription]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: CORS });
  }
}
