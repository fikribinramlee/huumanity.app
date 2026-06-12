"use client";

import { useEffect, useState } from "react";

export default function AppVerifiedPage() {
  const [step, setStep] = useState<"circle" | "check" | "done">("circle");
  // Deep link that re-opens the desktop app. We append a one-time Clerk sign-in
  // token so the app can establish its own session (the browser cookie can't
  // cross into the app's webview). Falls back to a plain open if minting fails.
  const [deepLink, setDeepLink] = useState("huu://open");

  // Sequence: draw circle → draw check → show text/button
  useEffect(() => {
    const t1 = setTimeout(() => setStep("check"), 500);
    const t2 = setTimeout(() => setStep("done"), 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Mint the handoff token from the authenticated browser session.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/desktop/sign-in-token", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.token) {
          setDeepLink(`huu://open?ticket=${encodeURIComponent(data.token)}`);
        }
      })
      .catch(() => { /* keep plain huu://open fallback */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-[#f5f4ef] text-black">
      <div className="flex flex-col items-center text-center max-w-sm px-6">

        {/* Animated SVG checkmark */}
        <div className="mb-8">
          <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
            {/* Circle */}
            <circle
              cx="44"
              cy="44"
              r="38"
              stroke="#22c55e"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
              strokeDasharray="239"
              strokeDashoffset="239"
              style={{
                transition: "stroke-dashoffset 0.55s cubic-bezier(0.4,0,0.2,1)",
                strokeDashoffset: step !== "circle" ? 0 : 239,
              }}
            />
            {/* Check path */}
            <path
              d="M26 44 L39 57 L62 30"
              stroke="#22c55e"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray="58"
              strokeDashoffset="58"
              style={{
                transition: "stroke-dashoffset 0.45s cubic-bezier(0.4,0,0.2,1) 0.1s",
                strokeDashoffset: step === "done" || step === "check" ? 0 : 58,
              }}
            />
          </svg>
        </div>

        {/* Text + button — fade in after animation */}
        <div
          style={{
            opacity: step === "done" ? 1 : 0,
            transform: step === "done" ? "translateY(0)" : "translateY(6px)",
            transition: "opacity 0.4s ease, transform 0.4s ease",
          }}
        >
          <h1 className="font-display text-3xl text-black">
            You&apos;re now logged in!
          </h1>
          <p className="mt-2 text-sm text-neutral-500 leading-6">
            Your huumanity account is verified. You can close this window or
            click below to open the app.
          </p>

          <a
            href={deepLink}
            className="mt-8 inline-flex items-center gap-2 rounded-2xl border-2 border-black bg-[#fff700] px-12 py-5 text-xl font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
          >
            Open huumanity
          </a>

          <p className="mt-5 text-xs text-neutral-400 whitespace-nowrap">
            You can close this browser tab.
          </p>
        </div>

      </div>
    </main>
  );
}
