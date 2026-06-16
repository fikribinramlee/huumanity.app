"use client";

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const TONES = ["Humanize", "Unpolished", "Controversial", "Direct"] as const;

type Props = {
  text: string;
  onClose: () => void;
};

export function ExternalRewritePanel({ text, onClose }: Props) {
  const [selectedTones, setSelectedTones] = useState<string[]>(["Humanize"]);
  const [resultText, setResultText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const toggleTone = (tone: string) => {
    setSelectedTones((prev) =>
      prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
    );
  };

  const handleGenerate = async () => {
    if (selectedTones.length === 0) return;

    setIsGenerating(true);
    setError("");

    try {
      const voiceInstructions =
        localStorage.getItem("huu-voice-instructions")?.trim() ?? "";
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          tones: selectedTones,
          ...(voiceInstructions ? { voiceInstructions } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.result) {
        throw new Error(data.error ?? "Could not rewrite this text.");
      }

      setResultText(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    const output = resultText || text;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const handlePasteBack = async () => {
    if (!resultText) return;
    try {
      await invoke("paste_text", { text: resultText });
      onClose();
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : "Could not paste back. Enable Accessibility permission for huumanity."
      );
    }
  };

  return (
    // Click the dimmed backdrop to dismiss. py-6 keeps the panel off the screen
    // edges so the max-height below always leaves a margin.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Flex column capped at the viewport height: header + footer stay pinned,
          the middle scrolls. This keeps Close and the action buttons reachable
          no matter how long the selected text is. */}
      <div
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl border-2 border-[#fff700] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — pinned */}
        <div className="flex shrink-0 items-start justify-between gap-4 p-6 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
              Desktop selection
            </p>
            <h3 className="font-display text-3xl">Rewrite this text</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-black"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable middle — source text, tones, result */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          <div className="mb-4 rounded-2xl bg-[#f7f5ee] p-4">
            <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">
              {text}
            </p>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
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

          {isGenerating ? (
            <div className="space-y-2.5 py-2">
              <div className="huu-shimmer h-2.5 w-full rounded-full" />
              <div className="huu-shimmer h-2.5 w-11/12 rounded-full" />
              <div className="huu-shimmer h-2.5 w-4/5 rounded-full" />
              <p className="pt-2 text-center text-[11px] text-neutral-500">
                Rewriting…
              </p>
            </div>
          ) : resultText ? (
            <div className="mb-4 rounded-2xl border border-black/10 p-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-800">
                {resultText}
              </p>
            </div>
          ) : null}

          {error && (
            <p className="mb-4 text-sm font-semibold text-red-600">{error}</p>
          )}
        </div>

        {/* Footer — pinned actions */}
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-black/[0.06] p-6 pt-4">
          {!resultText ? (
            <button
              onClick={handleGenerate}
              disabled={selectedTones.length === 0 || isGenerating}
              className="rounded-full bg-black px-5 py-2.5 text-sm font-black text-[#fff700] disabled:opacity-40"
            >
              Humanize text
            </button>
          ) : (
            <>
              <button
                onClick={handleCopy}
                className="rounded-full bg-neutral-100 px-5 py-2.5 text-sm font-bold"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={handlePasteBack}
                className="rounded-full border-2 border-black bg-[#fff700] px-5 py-2.5 text-sm font-black"
              >
                Paste back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
