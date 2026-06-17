"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { HuuLogo } from "../../components/HuuLogo";
import { clerkAppearance } from "../../lib/clerkAppearance";

function SignUpForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const redirectUrl = next && next.startsWith("/") ? next : "/download";

  return (
    <SignUp
      appearance={clerkAppearance}
      forceRedirectUrl={redirectUrl}
      signInUrl={`/sign-in?next=${encodeURIComponent(redirectUrl)}`}
    />
  );
}

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12">
      <div className="mb-9 flex flex-col items-center text-center">
        <HuuLogo className="text-5xl" />
        <h1 className="mt-7 font-display text-3xl sm:text-4xl text-black">
          Get started
        </h1>
        <p className="mt-2.5 max-w-xs text-sm text-neutral-500 leading-6">
          Sound human in every app on your Mac.
        </p>
      </div>
      <Suspense>
        <SignUpForm />
      </Suspense>
    </div>
  );
}
