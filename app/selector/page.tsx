"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isRephrashable } from "../lib/isRephrashable";

const TONES = ["Humanize", "Unpolished", "Controversial", "Direct"] as const;
const PRODUCTION_API = "https://huumanity.app/api/humanize";

type PopupStage = "select" | "loading" | "result" | "limit";

type DesktopSelection = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sourcePid?: number | null;
  canReplace: boolean;
};

export default function SelectorPage() {
  const [selection, setSelection] = useState<DesktopSelection | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [popupStage, setPopupStage] = useState<PopupStage>("select");
  const [selectedTones, setSelectedTones] = useState<string[]>([]);
  const [resultText, setResultText] = useState("");
  const [generatedSignature, setGeneratedSignature] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // Bumped every time the native window re-shows the collapsed dot, so we can
  // re-key the dot element and replay its pop-in animation on each appearance
  // (the React tree stays mounted across window hide/show, so without this the
  // CSS animation would only ever run once).
  const [showNonce, setShowNonce] = useState(0);
  // The visible panel box — measured so the native window can sit exactly on top
  // of the selected text for whatever stage is showing.
  const panelRef = useRef<HTMLElement>(null);

  const refreshSelection = useCallback(async () => {
    try {
      const payload = await invoke<DesktopSelection | null>(
        "get_selector_payload"
      );
      setSelection(payload);
    } catch {
      setSelection(null);
    }
  }, []);

  const resetPopup = useCallback(() => {
    setExpanded(false);
    setPopupStage("select");
    setSelectedTones([]);
    setResultText("");
    setGeneratedSignature("");
    setError("");
    setCopied(false);
    setIsGenerating(false);
  }, []);

  const closeSelector = useCallback(async () => {
    resetPopup();
    try {
      await invoke("hide_selector_window");
    } catch {}
  }, [resetPopup]);

  useEffect(() => {
    const previousBackground = document.body.style.background;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    const reset = () => {
      resetPopup();
      // New appearance → replay the dot pop-in.
      setShowNonce((n) => n + 1);
    };
    window.addEventListener("huu-selector-collapse", reset);

    const id = window.setTimeout(() => {
      void refreshSelection();
    }, 0);

    return () => {
      window.removeEventListener("huu-selector-collapse", reset);
      window.clearTimeout(id);
      document.body.style.background = previousBackground;
    };
  }, [refreshSelection, resetPopup]);

  useEffect(() => {
    if (!expanded) return;

    const handleBlur = () => {
      void closeSelector();
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [closeSelector, expanded]);

  // Keep the native window sized to the panel's REAL height at all times, so it
  // sits exactly above the selection and is never clipped. A ResizeObserver
  // catches every height change — select bar → "Rewriting…" → result — including
  // mid-animation reflow, which discrete state-based measuring missed (that was
  // the "tone bar cut in half while rewriting" bug).
  useEffect(() => {
    if (!expanded) return;
    const el = panelRef.current;
    if (!el) return;
    const report = () => {
      const panelHeight = Math.ceil(el.getBoundingClientRect().height);
      if (panelHeight > 0) {
        void invoke("position_selector_panel", { panelHeight }).catch(() => {});
      }
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);

  const openOptions = async () => {
    // Single payload fetch — set the current selection and gate on
    // rephrasability in one pass (the old double-invoke added needless latency
    // to the very click we want to feel instant).
    let payload: DesktopSelection | null = null;
    try {
      payload = await invoke<DesktopSelection | null>("get_selector_payload");
    } catch {
      payload = null;
    }
    setSelection(payload);
    // Ground rule: only expand tone panel for rephrashable text
    if (payload?.text && !isRephrashable(payload.text)) return;
    setExpanded(true);
    setPopupStage("select");
    setSelectedTones([]);
    setResultText("");
    setGeneratedSignature("");
    setError("");
    setCopied(false);
    try {
      await invoke("expand_selector_window");
    } catch (err) {
      setError(
        typeof err === "string" ? err : "Could not open rewrite options."
      );
    }
  };

  const humanizeEndpoint = () => {
    if (process.env.NEXT_PUBLIC_HUMANIZE_API_URL) {
      return process.env.NEXT_PUBLIC_HUMANIZE_API_URL;
    }

    // Packaged Tauri app — always call the production API
    if (window.location.origin.includes("tauri")) {
      return PRODUCTION_API;
    }

    return "/api/humanize";
  };

  const toneSignature = () =>
    `${selection?.text ?? ""}\n---huu-tones---\n${selectedTones.join("|")}`;

  const toggleTone = (tone: string) => {
    setSelectedTones((prev) =>
      prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
    );
    setCopied(false);
    setError("");
  };

  const handleGenerate = async () => {
    if (!selection?.text || selectedTones.length === 0) return;

    const signature = toneSignature();
    if (resultText && generatedSignature === signature) {
      setPopupStage("result");
      return;
    }

    setIsGenerating(true);
    setPopupStage("loading");
    setError("");
    setCopied(false);

    try {
      // The selector runs on tauri://localhost and calls the rewrite API
      // cross-origin, so the Clerk cookie is never sent. Authenticate instead
      // with the short-lived session token the editor window pumps into Rust;
      // without it the API can't identify the user and the rewrite wouldn't
      // count against their daily limit. The X-Huu-Client marker lets the API
      // refuse uncounted anonymous rewrites from the desktop (see route.ts).
      let token: string | null = null;
      try {
        token = await invoke<string | null>("get_session_token");
      } catch {
        token = null;
      }

      const res = await fetch(humanizeEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Huu-Client": "desktop-selector",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: selection.text, tones: selectedTones }),
      });

      const data = await res.json();

      // Daily free limit hit — show the upgrade panel instead of a raw error.
      if (res.status === 429 || data.error === "usage_limit_reached") {
        setPopupStage("limit");
        return;
      }

      // No valid session token reached the API (editor signed out or token
      // expired). Don't silently hand out a free, uncounted rewrite — prompt
      // the user to open huumanity so a fresh token can be minted.
      if (res.status === 401 || data.error === "auth_required") {
        setError("Open huumanity and sign in to keep rewriting.");
        setPopupStage("select");
        return;
      }

      if (!res.ok || !data.result) {
        throw new Error(data.error ?? "Could not rewrite this text.");
      }

      setResultText(data.result);
      setGeneratedSignature(signature);
      setPopupStage("result");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(
        message === "Failed to fetch" || message === "Load failed"
          ? "Could not reach the rewrite API. Run the local web app or set NEXT_PUBLIC_HUMANIZE_API_URL for desktop builds."
          : message
      );
      setPopupStage("select");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!resultText) return;

    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const handleAccept = async () => {
    if (!resultText || !selection?.canReplace) return;

    try {
      await invoke("paste_text_into_source", {
        text: resultText,
        sourcePid: selection?.sourcePid ?? null,
      });
      resetPopup();
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : "Could not paste back. Enable Accessibility permission for huu."
      );
    }
  };

  const handleBack = () => {
    setPopupStage("select");
    setCopied(false);
    setError("");
  };

  // "Upgrade to Pro" from the limit panel — open the editor's Plans & Billing
  // screen (handled natively: brings the main window forward and navigates it to
  // /editor?settings=billing) and close the selector overlay.
  const handleUpgrade = async () => {
    try {
      await invoke("open_billing");
    } catch (err) {
      setError(
        typeof err === "string" ? err : "Could not open Plans & Billing."
      );
      return;
    }
    resetPopup();
  };

  const canReplaceSelection = selection?.canReplace ?? false;

  if (!expanded) {
    // Small floating dot — a clean 20px yellow circle, NO border, with a soft
    // shadow so it reads on light backgrounds, and a compact bold up-arrow.
    // Roughly the size of a line of text so it sits beside the selection without
    // distracting or causing cognitive overload.
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-transparent">
        <button
          key={showNonce}
          type="button"
          onClick={openOptions}
          className="huu-pop-in flex h-5 w-5 items-center justify-center rounded-full bg-[#fff700] text-black shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition hover:brightness-95 active:scale-90"
          aria-label="Open huu rewrite options"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="black"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </main>
    );
  }

  return (
    <main
      className="flex h-screen w-screen flex-col items-center justify-end bg-transparent p-3"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          void closeSelector();
        }
      }}
    >
      {/* Mirrors the website's tone bar EXACTLY: white box, bright yellow
          border, single row of tone pills + a round arrow button. No black
          header, no always-on close — the X appears only in the result stage,
          just like the site. Anchored to the bottom of the transparent window
          so it sits directly above the selected text. */}
      <section
        ref={panelRef}
        className="huu-pop-in-panel relative w-fit max-w-full rounded-2xl border-2 border-[#fff700] bg-white shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="p-2">
          {popupStage === "select" && (
            <div className="flex items-center gap-1.5">
              {TONES.map((tone) => {
                const isOn = selectedTones.includes(tone);
                return (
                  <button
                    key={tone}
                    onClick={() => toggleTone(tone)}
                    className={`whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                      isOn
                        ? "bg-[#fff700] text-black ring-2 ring-black"
                        : "bg-neutral-100 text-black hover:bg-neutral-200"
                    }`}
                  >
                    {tone}
                  </button>
                );
              })}
              <button
                onClick={handleGenerate}
                disabled={selectedTones.length === 0}
                aria-label="Generate"
                className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[#fff700] text-black transition hover:bg-[#fff700] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          )}

          {popupStage === "loading" || isGenerating ? (
            <div className="w-[360px] max-w-full space-y-2.5 px-1 py-1">
              <div className="huu-shimmer h-2.5 w-full rounded-full" />
              <div className="huu-shimmer h-2.5 w-11/12 rounded-full" />
              <div className="huu-shimmer h-2.5 w-4/5 rounded-full" />
              <p className="pt-1 text-center text-[11px] text-neutral-500">
                Rewriting…
              </p>
            </div>
          ) : popupStage === "result" && resultText ? (
            <div className="w-[360px] max-w-full px-1">
              {/* Close — result stage only, matching the website. */}
              <button
                onClick={closeSelector}
                aria-label="Close"
                className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-black"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <p className="mb-3 mt-1 max-h-40 overflow-auto whitespace-pre-wrap pr-6 text-[13px] leading-6 text-neutral-800">
                {resultText}
              </p>
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1 rounded-full border-2 border-[#fff700] px-3.5 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-[#fff700]/30"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                  Back
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    aria-label="Copy"
                    className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-neutral-200"
                  >
                    {copied ? (
                      <>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      "Copy"
                    )}
                  </button>
                  {canReplaceSelection ? (
                    <button
                      onClick={handleAccept}
                      className="rounded-full border border-black bg-[#fff700] px-4 py-1.5 text-[11px] font-bold text-black transition hover:brightness-95"
                    >
                      Accept
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : popupStage === "limit" ? (
            // Daily free limit reached — same box chrome as the loading/result
            // stages (white panel, yellow border), with an upsell + CTA. The
            // button opens the editor's Plans & Billing screen natively.
            <div className="w-[360px] max-w-full px-1">
              {/* Close — top-right, matching the result stage. */}
              <button
                onClick={closeSelector}
                aria-label="Close"
                className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-black"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <p className="mb-1.5 mt-1 pr-6 text-[15px] font-extrabold leading-tight text-black">
                Daily rewrite limit reached
              </p>
              <div className="flex items-end justify-between gap-3">
                <p className="text-[12px] leading-5 text-neutral-600">
                  Upgrade to huumanity Pro to have unlimited rewrites.
                </p>
                <button
                  onClick={handleUpgrade}
                  className="shrink-0 whitespace-nowrap rounded-full bg-black px-4 py-2 text-[11px] font-bold text-[#fff700] transition hover:brightness-110"
                >
                  Upgrade to Pro
                </button>
              </div>
            </div>
          ) : null}

          {error && (
            <p className="mt-2 max-w-[380px] text-[11px] font-semibold text-red-600">
              {error}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
