import { SignUp } from "@clerk/nextjs";
import { HuuLogo } from "../../components/HuuLogo";
import { clerkAppearance } from "../../lib/clerkAppearance";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <HuuLogo className="text-4xl" />
        <h1 className="mt-6 font-display text-3xl text-black">Get started</h1>
      </div>
      <SignUp appearance={clerkAppearance} fallbackRedirectUrl="/download" />
    </div>
  );
}
