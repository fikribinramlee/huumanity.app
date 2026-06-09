"use client";

import { useEffect, useState } from "react";

export default function PaymentSuccessPage() {
  const [step, setStep] = useState<"circle" | "check" | "done">("circle");

  useEffect(() => {
    const t1 = setTimeout(() => setStep("check"), 500);
    const t2 = setTimeout(() => setStep("done"), 1100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-[#f5f4ef] text-black">
      <div className="flex flex-col items-center text-center max-w-sm px-6">

        {/* Animated checkmark */}
        <div className="mb-8">
          <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
            <circle
              cx="44" cy="44" r="38"
              stroke="#22c55e" strokeWidth="4" strokeLinecap="round" fill="none"
              strokeDasharray="239" strokeDashoffset="239"
              style={{
                transition: "stroke-dashoffset 0.55s cubic-bezier(0.4,0,0.2,1)",
                strokeDashoffset: step !== "circle" ? 0 : 239,
              }}
            />
            <path
              d="M26 44 L39 57 L62 30"
              stroke="#22c55e" strokeWidth="4.5"
              strokeLinecap="round" strokeLinejoin="round" fill="none"
              strokeDasharray="58" strokeDashoffset="58"
              style={{
                transition: "stroke-dashoffset 0.45s cubic-bezier(0.4,0,0.2,1) 0.1s",
                strokeDashoffset: step === "done" || step === "check" ? 0 : 58,
              }}
            />
          </svg>
        </div>

        <div
          style={{
            opacity: step === "done" ? 1 : 0,
            transform: step === "done" ? "translateY(0)" : "translateY(6px)",
            transition: "opacity 0.4s ease, transform 0.4s ease",
          }}
        >
          <h1 className="font-display text-3xl text-black">
            You&apos;re now Pro!
          </h1>
          <p className="mt-2 text-sm text-neutral-500 leading-6">
            Your huumanity account has been upgraded. Unlimited rewrites are
            now active across every app on your Mac.
          </p>

          <a
            href="huu://open"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl border-2 border-black bg-[#fff700] px-12 py-5 text-xl font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
          >
            Open huumanity
          </a>

          <p className="mt-5 text-xs text-neutral-400">
            You can close this browser tab.
          </p>
        </div>

      </div>
    </main>
  );
}
