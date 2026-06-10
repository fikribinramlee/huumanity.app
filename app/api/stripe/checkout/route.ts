import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    // Init stripe inside try so any config error is caught and returned as JSON
    const stripe = getStripe();

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "You must be signed in to upgrade." },
        { status: 401, headers: CORS }
      );
    }

    const body = await req.json().catch(() => ({}));
    const priceId: string =
      body.priceId ??
      process.env.STRIPE_PRICE_MONTHLY ??
      "price_1TgPXi2ceurudS1gl7UZeNmZ";

    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const privateMeta = (user.privateMetadata ?? {}) as {
      stripeCustomerId?: string;
    };

    // Reuse existing Stripe customer, or create one
    let customerId = privateMeta.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.emailAddresses[0]?.emailAddress,
        name: user.fullName ?? undefined,
        metadata: { clerkUserId: userId },
      });
      customerId = customer.id;
      await clerk.users.updateUserMetadata(userId, {
        privateMetadata: {
          ...user.privateMetadata,
          stripeCustomerId: customerId,
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      success_url: `https://huumanity.app/editor?upgraded=true`,
      cancel_url: `https://huumanity.app/editor`,
      metadata: { clerkUserId: userId },
      subscription_data: {
        metadata: { clerkUserId: userId },
      },
    });

    return NextResponse.json({ url: session.url }, { headers: CORS });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Could not create checkout session: ${message}` },
      { status: 500, headers: CORS }
    );
  }
}
