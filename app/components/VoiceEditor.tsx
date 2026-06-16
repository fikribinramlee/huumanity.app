"use client";

import { useEffect, useState } from "react";

// The single source of truth for the user's personal style. Every rewrite
// surface (scratchpad, desktop selector, external panel) reads this exact key
// from localStorage at call time and forwards it to /api/humanize as
// `voiceInstructions`, where it's layered on top of the selected tone.
const VOICE_KEY = "huu-voice-instructions";

export function VoiceEditor() {
  // `draft` is what's in the textarea; `saved` is what's committed to
  // localStorage (and therefore what the API actually uses). They diverge while
  // the user is typing, and re-converge when they hit Save.
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  // Load the committed voice on mount so the textarea is pre-filled.
  useEffect(() => {
    const stored = localStorage.getItem(VOICE_KEY) ?? "";
    setDraft(stored);
    setSaved(stored);
  }, []);

  const isDirty = draft !== saved;

  const handleSave = () => {
    const next = draft.trim();
    localStorage.setItem(VOICE_KEY, next);
    setDraft(next);
    setSaved(next);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
  };

  return (
    <div className="relative flex min-h-[520px] flex-col rounded-3xl border border-black/10 bg-white shadow-sm">
      {/* Header — mirrors the Scratchpad's header block */}
      <div className="border-b border-black/10 px-6 py-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
          My Voice
        </p>
        <h2 className="font-display text-3xl">Make it sound like you.</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">
          This is your space. Describe how you actually write — your words, your
          rhythm, the little quirks that make it yours — and huumanity remembers
          it. It layers on top of whatever tone you pick, so every rewrite comes
          out in your voice, not a generic one.
        </p>
      </div>

      {/* Body — rounded rectangle textbox, same treatment as the Scratchpad */}
      <div className="flex flex-1 flex-col p-6">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          placeholder="e.g. I write in lowercase, keep sentences short, never use exclamation marks, and lean a bit dry and deadpan. I say 'tbh' and 'honestly' a lot. No corporate words."
          className="min-h-[320px] flex-1 resize-none rounded-3xl border-2 border-black bg-[#fbfaf8] p-6 text-[15px] leading-7 text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
          style={{ caretColor: "#fff700" }}
        />

        {/* Save row — committing is what "activates" the voice for the API */}
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-xs text-neutral-400">
            {isDirty
              ? "Unsaved changes — hit Save to apply your voice."
              : saved
                ? "Your voice is active across every rewrite."
                : "Add your style above, then Save to turn it on."}
          </p>
          <button
            onClick={handleSave}
            disabled={!isDirty && !justSaved}
            className="shrink-0 rounded-full bg-black px-6 py-2.5 text-sm font-black text-[#fff700] transition hover:bg-neutral-900 disabled:opacity-40"
          >
            {justSaved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
