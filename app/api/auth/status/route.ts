import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ authenticated: false });
    }

    const user = await currentUser();
    return NextResponse.json({
      authenticated: true,
      userId,
      email: user?.emailAddresses?.[0]?.emailAddress ?? null,
      firstName: user?.firstName ?? null,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
