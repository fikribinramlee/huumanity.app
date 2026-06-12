import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Mints a one-time Clerk sign-in token for the *currently authenticated browser
// session*. The desktop app opens sign-in / Stripe in the system browser, where
// the Clerk cookie lives. That cookie can't reach the app's own webview, so the
// success pages call this endpoint, embed the returned token in the
// `huu://open?ticket=…` deep link, and the app redeems it via
// `signIn.create({ strategy: "ticket" })` to establish its own session.
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const clerk = await clerkClient();
    const signInToken = await clerk.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 600, // 10 minutes — plenty of time to click "Open huumanity"
    });

    return NextResponse.json({ token: signInToken.token });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to mint token" },
      { status: 500 }
    );
  }
}
