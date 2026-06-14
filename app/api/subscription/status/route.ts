import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getUserMeta,
  FREE_DAILY_LIMIT,
  windowedUsage,
} from "@/app/lib/subscription";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS }
      );
    }

    const { privateMeta, publicMeta } = await getUserMeta(userId);

    const isPro =
      privateMeta.plan === "pro" && privateMeta.subscriptionStatus === "active";

    const { count: usageCount, resetsAt } = windowedUsage(publicMeta);

    return NextResponse.json(
      {
        plan: isPro ? "pro" : "free",
        usageCount,
        limit: FREE_DAILY_LIMIT,
        unlimited: isPro,
        remaining: isPro ? null : Math.max(0, FREE_DAILY_LIMIT - usageCount),
        // ISO timestamp when the current 24h window resets (null if no usage yet)
        resetsAt,
        cancelAtPeriodEnd: privateMeta.cancelAtPeriodEnd ?? false,
        currentPeriodEnd: privateMeta.currentPeriodEnd ?? null,
      },
      { headers: CORS }
    );
  } catch (err) {
    console.error("[subscription/status]", err);
    return NextResponse.json(
      { error: "Could not fetch subscription status." },
      { status: 500, headers: CORS }
    );
  }
}
