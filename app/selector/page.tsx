"use client";

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isRephrashable } from "../lib/isRephrashable";

const TONES = ["Humanize", "Unpolished", "Controversial", "Direct"] as const;
const LOCAL_DESKTOP_API = "http://localhost:3000/api/humanize";

type PopupStage = "select" | "loading" | "result";

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

    const reset = () => resetPopup();
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

  const openOptions = async () => {
    await refreshSelection();
    // Ground rule: only expand tone panel for rephrashable text
    const payload = await (async () => {
      try { return await invoke<{ text: string } | null>("get_selector_payload"); } catch { return null; }
    })();
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

    // Packaged Tauri pages are served from an app-local origin, not the Next
    // server. Local desktop testing can still use the dev API when it is open.
    if (window.location.origin.includes("tauri")) {
      return LOCAL_DESKTOP_API;
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
      const res = await fetch(humanizeEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selection.text, tones: selectedTones }),
      });

      const data = await res.json();
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

  const canReplaceSelection = selection?.canReplace ?? false;

  if (!expanded) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-transparent">
        <button
          type="button"
          onClick={openOptions}
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-black bg-[#fff700] text-xl font-black text-black shadow-[0_4px_12px_rgba(0,0,0,0.18)] transition hover:brightness-95 active:scale-95"
          aria-label="Open huu rewrite options"
        >
          ✦
        </button>
      </main>
    );
  }

  return (
    <main
      className="h-screen w-screen bg-transparent p-2"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          void closeSelector();
        }
      }}
    >
      <section
        className="overflow-hidden rounded-2xl border-2 border-[#fff700] bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-black/10 bg-black px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#fff700]">
              huu
            </p>
            <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/60">
              {canReplaceSelection ? "replace" : "copy only"}
            </span>
          </div>
          <button
            onClick={closeSelector}
            className="rounded-full p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <svg
              width="16"
              height="16"
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
        </div>

        <div className="p-4">
          {popupStage === "select" && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {TONES.map((tone) => {
                  const isOn = selectedTones.includes(tone);
                  return (
                    <button
                      key={tone}
                      onClick={() => toggleTone(tone)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-black transition ${
                        isOn
                          ? "bg-[#fff700] text-black ring-2 ring-black"
                          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                      }`}
                    >
                      {tone}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={handleGenerate}
                disabled={selectedTones.length === 0}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#fff700] text-black transition hover:bg-[#fff700] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Generate"
              >
                <svg
                  width="14"
                  height="14"
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
            <div className="space-y-2.5 py-2">
              <div className="huu-shimmer h-2.5 w-full rounded-full" />
              <div className="huu-shimmer h-2.5 w-11/12 rounded-full" />
              <div className="huu-shimmer h-2.5 w-4/5 rounded-full" />
              <p className="pt-2 text-center text-[11px] text-neutral-500">
                Rewriting…
              </p>
            </div>
          ) : popupStage === "result" && resultText ? (
            <div className="mb-4 max-h-40 overflow-auto rounded-xl border border-black/[0.08] bg-[#fafaf8] px-3.5 py-3 whitespace-pre-wrap text-sm leading-6 text-neutral-800">
              {resultText}
            </div>
          ) : null}

          {error && (
            <p className="mb-3 text-xs font-semibold text-red-600">{error}</p>
          )}

          <div className="flex justify-between gap-2">
            {popupStage === "result" && resultText ? (
              <>
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1 rounded-full border-2 border-[#fff700] px-4 py-2 text-xs font-bold hover:bg-[#fff700]/30"
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
                    className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-2 text-xs font-bold hover:bg-neutral-200"
                    aria-label="Copy"
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
                      <>
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                  {canReplaceSelection ? (
                    <button
                      onClick={handleAccept}
                      className="rounded-full border-2 border-black bg-[#fff700] px-4 py-2 text-xs font-black hover:brightness-95"
                    >
                      Accept
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
