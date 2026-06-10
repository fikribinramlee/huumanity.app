import { SignIn } from "@clerk/nextjs";
import { HuuLogo } from "../../components/HuuLogo";
import { clerkAppearance } from "../../lib/clerkAppearance";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <HuuLogo className="text-4xl" />
        <h1 className="mt-6 font-display text-3xl text-black">Welcome back</h1>
      </div>
      <SignIn appearance={clerkAppearance} fallbackRedirectUrl="/download" />
    </div>
  );
}
