"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Props = {
  macUrl: string;
  winUrl: string;
};

type DetectedOs = "mac" | "windows" | "other";

function detectOs(): DetectedOs {
  if (typeof navigator === "undefined") return "other";
  const ua = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  return "other";
}

export function DownloadPageClient({ macUrl, winUrl }: Props) {
  // Default to mac on the server render; correct it on mount once we can read
  // the real user agent. Avoids a hydration mismatch by only switching after
  // the first client effect.
  const [os, setOs] = useState<DetectedOs>("mac");

  useEffect(() => {
    setOs(detectOs());
  }, []);

  const isWindows = os === "windows";
  const downloadUrl = isWindows ? winUrl : macUrl;
  const downloadFileName = isWindows ? "huu-setup.exe" : "huu-mac.dmg";
  const hasUrl = Boolean(downloadUrl);

  const triggerDownload = useCallback(() => {
    if (!downloadUrl) return;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = downloadFileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [downloadFileName, downloadUrl]);

  // Auto-download once the OS is known and a URL exists.
  useEffect(() => {
    if (!hasUrl) return;
    const timer = window.setTimeout(triggerDownload, 600);
    return () => window.clearTimeout(timer);
  }, [hasUrl, triggerDownload]);

  const steps = isWindows
    ? [
        "Run the downloaded huu installer",
        "Windows may show a SmartScreen warning — click \"More info\" then \"Run anyway\" to continue",
        "Open the app and sign in",
        "Finish the quick setup and start rephrasing anywhere",
      ]
    : [
        "Open the downloaded huu file",
        "Open the app and sign up",
        "Finish the quick setup and start rephrasing anywhere",
      ];

  const comingSoonNote = isWindows
    ? "The Windows build is on its way. Check back soon."
    : "We're getting the latest build ready. Check back in a few minutes.";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left — instructions */}
      <div className="flex-1 bg-black text-white px-8 sm:px-12 lg:px-16 py-12 lg:py-16 flex flex-col">
        <Link href="/" className="font-display text-3xl text-[#fff700] leading-none">
          huu
        </Link>

        <div className="flex-1 flex flex-col justify-center max-w-lg mt-12 lg:mt-0">
          <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.25rem] leading-[1.08] mb-10">
            Open huu in 3 steps:
          </h1>

          <ol className="space-y-5 text-base sm:text-lg text-neutral-200">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="font-display text-[#fff700] shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {hasUrl ? (
            <>
              <div className="mt-9 rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-bold text-white">
                  Download not starting automatically?
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="text-sm text-neutral-400">Use this instead →</span>
                  <button
                    type="button"
                    onClick={triggerDownload}
                    className="rounded-full border-2 border-[#fff700] bg-[#fff700] px-5 py-2.5 text-sm font-black text-black transition hover:brightness-95"
                  >
                    Download Here
                  </button>
                </div>
              </div>
              <p className="mt-5 text-xs leading-5 text-neutral-500">
                {isWindows
                  ? "Windows may warn you the first time you run the installer. Click \"More info\" then \"Run anyway\"."
                  : "Your computer may ask you to confirm the download or grant huu permissions the first time you open it."}
              </p>
              <p className="mt-3 text-sm text-neutral-400">
                Need another copy?{" "}
                <button
                  type="button"
                  onClick={triggerDownload}
                  className="text-white underline underline-offset-4 hover:text-[#fff700] transition-colors"
                >
                  Download again
                </button>
              </p>
            </>
          ) : (
            <div className="mt-9 rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-bold text-white">Download coming soon</p>
              <p className="mt-2 text-sm text-neutral-400">{comingSoonNote}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right — visual guide */}
      <div className="flex-1 bg-[#fdfbe7] flex items-center justify-center px-8 py-16 lg:py-0 relative overflow-hidden">
        <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_30%_40%,#fff700_0%,transparent_55%)]" />

        <div className="relative w-full max-w-xl">
          <div className="rounded-2xl bg-white shadow-xl border border-black/10 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-neutral-100 border-b border-black/5">
              <span className="w-3 h-3 rounded-full bg-black/10" />
              <span className="w-3 h-3 rounded-full bg-black/10" />
              <span className="w-3 h-3 rounded-full bg-black/10" />
              <div className="flex-1 mx-4 h-7 rounded-lg bg-black/5" />
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-[#fff700] flex items-center justify-center shadow-lg shadow-[#fff700]/30">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="black"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </div>
                <svg
                  className="absolute -bottom-3 -right-4 drop-shadow-md"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="white"
                  stroke="black"
                  strokeWidth="1"
                >
                  <path d="M5 3l14 9-6 1-3 7z" />
                </svg>
              </div>
            </div>

            <div className="bg-white p-8 space-y-4">
              <div className="h-4 rounded-full bg-neutral-200 w-3/4" />
              <div className="h-3 rounded-full bg-neutral-100 w-full" />
              <div className="h-3 rounded-full bg-neutral-100 w-11/12" />
              <div className="h-3 rounded-full bg-neutral-100 w-4/5" />
              <div className="mt-6 h-20 rounded-xl bg-[#fff700]/20 border-2 border-[#fff700]/40" />
            </div>
          </div>

          <p className="text-center text-sm text-neutral-500 mt-6">
            Your download should start automatically
          </p>
        </div>
      </div>
    </div>
  );
}
