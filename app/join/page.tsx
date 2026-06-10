"use client";

/**
 * /join — custom waitlist signup page.
 *
 * Replaces Clerk's multi-step `<Waitlist />` widget with a single-step inline
 * email capture. The "Join the Waitlist" CTAs on /waitlist link here. Submits
 * to /api/waitlist which adds the email to Clerk's waitlist server-side.
 *
 * Design: yellow-to-white wave gradient background (same `.huu-hero-card`
 * class used by the landing hero), black text, yellow button. Per the brief,
 * the page renders ONLY the headline, subheadline, email input, and button.
 */

import { useState, type FormEvent } from "react";

export default function JoinWaitlistPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data?.error || "Something went wrong. Try again.");
        return;
      }

      setStatus("success");
    } catch (err) {
      console.error("Waitlist submit failed", err);
      setStatus("error");
      setErrorMessage("Network error. Try again.");
    }
  };

  return (
    <main className="huu-hero-card min-h-screen w-full flex flex-col items-center justify-center px-6 py-16 text-black">
      <div className="w-full max-w-2xl flex flex-col items-center text-center">
        {/* Headline — broken into two lines as requested */}
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-[1.05] tracking-tight">
          The amount of AI slop out there
          <br />
          rn is actually unbearable
        </h1>

        {/* Subheadline */}
        <p className="mt-6 max-w-xl text-base sm:text-lg leading-7 text-black/70">
          drop your email below to get early access to huumanity and be the
          first to sound human.
        </p>

        {/* Inline form — email input + yellow button.
            On success, the form is swapped for a confirmation message. */}
        {status === "success" ? (
          <div className="mt-10 w-full max-w-xl px-6 py-5 rounded-2xl border-2 border-black bg-white/70 backdrop-blur shadow-[0_3px_0_rgba(0,0,0,0.18)]">
            <p className="font-display text-2xl sm:text-3xl text-black">
              You&rsquo;re on the list.
            </p>
            <p className="mt-2 text-sm sm:text-base text-black/70 leading-6">
              We&rsquo;ll email you the moment huumanity is ready for you.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-10 w-full max-w-xl flex flex-col sm:flex-row items-stretch gap-3"
            noValidate
          >
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              disabled={status === "submitting"}
              className="flex-1 px-5 py-4 text-base font-semibold text-black bg-white/80 backdrop-blur border-2 border-black rounded-xl placeholder:text-black/35 focus:outline-none focus:bg-white shadow-[0_3px_0_rgba(0,0,0,0.18)] transition disabled:opacity-60"
              aria-label="Email address"
            />
            <button
              type="submit"
              disabled={status === "submitting"}
              className="px-7 py-4 text-base font-black text-black bg-[#fff700] border-2 border-black rounded-xl shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:brightness-95 active:translate-y-[1px] transition disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {status === "submitting" ? "Adding..." : "Get Notified"}
            </button>
          </form>
        )}

        {/* Error state — inline, under the form, no layout shift on success */}
        {status === "error" && errorMessage && (
          <p className="mt-4 text-sm text-red-700 font-semibold">{errorMessage}</p>
        )}
      </div>
    </main>
  );
}
