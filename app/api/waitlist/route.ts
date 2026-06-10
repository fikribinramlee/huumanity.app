/**
 * POST /api/waitlist — add an email to Clerk's waitlist.
 *
 * Hits Clerk's Backend API directly (rather than the SDK's
 * `clerkClient.waitlistEntries.create`) so we stay version-agnostic and
 * surface the exact error code from Clerk.
 *
 * Treats "already on waitlist" as success — from the user's perspective
 * both outcomes mean "you're on the list."
 *
 * Public endpoint (no auth). Listed in proxy.ts as public.
 */
import { NextResponse } from "next/server";

const CLERK_API = "https://api.clerk.com/v1/waitlist_entries";

export async function POST(req: Request) {
  try {
    const { email } = (await req.json().catch(() => ({}))) as { email?: string };

    const trimmed = (email ?? "").trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      console.error("[/api/waitlist] CLERK_SECRET_KEY not configured");
      return NextResponse.json(
        { error: "Server not configured. Try again later." },
        { status: 500 }
      );
    }

    const clerkRes = await fetch(CLERK_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email_address: trimmed }),
    });

    if (clerkRes.ok) {
      return NextResponse.json({ ok: true });
    }

    // Parse Clerk's error envelope: { errors: [{ code, message, long_message }] }
    const data = (await clerkRes.json().catch(() => ({}))) as {
      errors?: { code?: string; message?: string; long_message?: string }[];
    };
    const first = data.errors?.[0];
    const code = first?.code ?? "";

    // "Already on waitlist" → treat as success.
    if (
      code === "form_identifier_exists" ||
      code === "waitlist_entry_exists" ||
      code === "duplicate_record"
    ) {
      return NextResponse.json({ ok: true, alreadyOnList: true });
    }

    // Waitlist mode not enabled in Clerk Dashboard.
    if (code === "waitlist_not_enabled" || code === "feature_requires_waitlist") {
      console.error(
        "[/api/waitlist] Waitlist mode is not enabled in the Clerk Dashboard."
      );
      return NextResponse.json(
        { error: "Waitlist is not active yet. Try again soon." },
        { status: 503 }
      );
    }

    console.error("[/api/waitlist] Clerk rejected entry", {
      status: clerkRes.status,
      code,
      message: first?.message,
    });
    return NextResponse.json(
      { error: first?.long_message || first?.message || "Could not add to waitlist." },
      { status: clerkRes.status >= 400 && clerkRes.status < 500 ? 400 : 502 }
    );
  } catch (err) {
    console.error("[/api/waitlist] Unexpected error", err);
    return NextResponse.json(
      { error: "Something went wrong. Try again." },
      { status: 500 }
    );
  }
}
