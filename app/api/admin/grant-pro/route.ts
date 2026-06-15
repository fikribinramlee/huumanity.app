/**
 * POST /api/admin/grant-pro
 *
 * Manually grants (or revokes) Pro access for a user by email.
 * No Stripe subscription required — writes directly to Clerk metadata.
 *
 * Body: { email: string, action?: "grant" | "revoke" }
 *   action defaults to "grant"
 *
 * Protected by ADMIN_SECRET header — without it this is a 401.
 */
import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const adminSecret = req.headers.get("x-admin-secret");
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  let body: { email?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS });
  }

  const { email, action = "grant" } = body;
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400, headers: CORS });
  }
  if (action !== "grant" && action !== "revoke") {
    return NextResponse.json({ error: "action must be 'grant' or 'revoke'" }, { status: 400, headers: CORS });
  }

  try {
    const clerk = await clerkClient();
    const results = await clerk.users.getUserList({ emailAddress: [email] });
    const user = results.data[0];

    if (!user) {
      return NextResponse.json(
        { error: `No user found with email: ${email}` },
        { status: 404, headers: CORS }
      );
    }

    const existing = (user.privateMetadata ?? {}) as Record<string, unknown>;

    if (action === "grant") {
      await clerk.users.updateUserMetadata(user.id, {
        privateMetadata: {
          ...existing,
          plan: "pro",
          subscriptionStatus: "active",
          grantedManually: true,
        },
        publicMetadata: { plan: "pro" },
      });
      return NextResponse.json(
        { success: true, userId: user.id, email, result: "pro" },
        { headers: CORS }
      );
    } else {
      await clerk.users.updateUserMetadata(user.id, {
        privateMetadata: {
          ...existing,
          plan: "free",
          subscriptionStatus: "revoked",
          grantedManually: false,
        },
        publicMetadata: { plan: "free" },
      });
      return NextResponse.json(
        { success: true, userId: user.id, email, result: "free" },
        { headers: CORS }
      );
    }
  } catch (err) {
    console.error("[admin/grant-pro]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: CORS });
  }
}
