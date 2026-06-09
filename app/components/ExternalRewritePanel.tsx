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
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tones: selectedTones }),
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
          : "Could not paste back. Enable Accessibility permission for huu."
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl border-2 border-[#fff700] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
              Desktop selection
            </p>
            <h3 className="font-display text-3xl">Rewrite this text</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm font-bold text-neutral-500 hover:bg-neutral-100 hover:text-black"
          >
            Close
          </button>
        </div>

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

        <div className="flex flex-wrap gap-2">
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
