import { SignIn } from "@clerk/nextjs";
import { HuuLogo } from "../../components/HuuLogo";
import { clerkAppearance } from "../../lib/clerkAppearance";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // `next` carries the desktop handoff target (/app-verified). Default to
  // /download for website visitors. Only allow same-site relative paths.
  const { next } = await searchParams;
  const redirectUrl = next && next.startsWith("/") ? next : "/download";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12">
      <div className="mb-9 flex flex-col items-center text-center">
        <HuuLogo className="text-5xl" />
        <h1 className="mt-7 font-display text-3xl sm:text-4xl text-black">
          Welcome back
        </h1>
        <p className="mt-2.5 max-w-xs text-sm text-neutral-500 leading-6">
          Sign in to keep your writing human.
        </p>
      </div>
      <SignIn
        appearance={clerkAppearance}
        forceRedirectUrl={redirectUrl}
        signUpUrl={`/sign-up?next=${encodeURIComponent(redirectUrl)}`}
      />
    </div>
  );
}
