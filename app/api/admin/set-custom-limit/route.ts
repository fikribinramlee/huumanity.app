/**
 * POST /api/admin/set-custom-limit
 *
 * Sets (or clears) a per-user custom daily rewrite limit by email address.
 * Protected by ADMIN_SECRET header — only you can call it.
 *
 * Body: { email: string, limit: number | null }
 *   limit: number  → override (e.g. 20 rewrites/day instead of the default)
 *   limit: null    → remove the override and fall back to FREE_DAILY_LIMIT
 *
 * Example curl:
 *   curl -X POST https://huumanity.app/api/admin/set-custom-limit \
 *     -H "Content-Type: application/json" \
 *     -H "x-admin-secret: YOUR_ADMIN_SECRET" \
 *     -d '{"email":"user@example.com","limit":20}'
 */
import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getUserMeta, PrivateMeta } from "@/app/lib/subscription";

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

  let body: { email?: string; limit?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS });
  }

  const { email, limit } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400, headers: CORS });
  }
  if (limit !== null && limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0)) {
    return NextResponse.json(
      { error: "limit must be a non-negative integer or null to remove the override" },
      { status: 400, headers: CORS }
    );
  }

  try {
    const clerk = await clerkClient();
    const users = await clerk.users.getUserList({ emailAddress: [email] });

    if (users.totalCount === 0) {
      return NextResponse.json(
        { error: `No user found with email: ${email}` },
        { status: 404, headers: CORS }
      );
    }

    const user = users.data[0];
    const { privateMeta } = await getUserMeta(user.id);

    const updatedMeta: PrivateMeta = { ...privateMeta };
    if (limit === null || limit === undefined) {
      delete updatedMeta.customDailyLimit;
    } else {
      updatedMeta.customDailyLimit = limit;
    }

    await clerk.users.updateUserMetadata(user.id, {
      privateMetadata: updatedMeta,
    });

    return NextResponse.json(
      {
        success: true,
        userId: user.id,
        email,
        customDailyLimit: limit ?? null,
        message:
          limit != null
            ? `Custom limit set to ${limit} rewrites/day for ${email}`
            : `Custom limit removed for ${email} — will use default FREE_DAILY_LIMIT`,
      },
      { headers: CORS }
    );
  } catch (err) {
    console.error("[admin/set-custom-limit]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: CORS });
  }
}
