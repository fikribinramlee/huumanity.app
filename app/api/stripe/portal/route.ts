import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
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

export async function POST() {
  const stripe = getStripe();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS }
      );
    }

    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const customerId = (user.privateMetadata as { stripeCustomerId?: string })
      .stripeCustomerId;

    if (!customerId) {
      return NextResponse.json(
        { error: "No billing account found." },
        { status: 400, headers: CORS }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: "https://huumanity.app",
    });

    return NextResponse.json({ url: session.url }, { headers: CORS });
  } catch (err) {
    console.error("[stripe/portal]", err);
    return NextResponse.json(
      { error: "Could not open billing portal." },
      { status: 500, headers: CORS }
    );
  }
}
