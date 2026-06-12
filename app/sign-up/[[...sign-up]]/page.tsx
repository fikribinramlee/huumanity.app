import { SignUp } from "@clerk/nextjs";
import { HuuLogo } from "../../components/HuuLogo";
import { clerkAppearance } from "../../lib/clerkAppearance";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // `next` lets the desktop flow route to /app-verified after sign-up; website
  // visitors fall through to /download. Only allow same-site relative paths.
  const { next } = await searchParams;
  const redirectUrl = next && next.startsWith("/") ? next : "/download";

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
      <SignUp
        appearance={clerkAppearance}
        forceRedirectUrl={redirectUrl}
        signInUrl={`/sign-in?next=${encodeURIComponent(redirectUrl)}`}
      />
    </div>
  );
}
