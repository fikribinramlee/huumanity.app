"use client";

import { useEffect, useRef, useState } from "react";
import { isRephrashable } from "../lib/isRephrashable";

const TONES = ["Humanize", "Unpolished", "Controversial", "Direct"] as const;
const POPUP_MAX_WIDTH = 480;
const POPUP_MIN_WIDTH = 280;

/** Delay (ms) between mouseup and the button appearing */
const SHOW_DELAY_MS = 350;

type SelectionAnchor = {
  tabTop: number;
  popupTop: number;
  popupLeft: number;
  popupWidth: number;
} | null;

type PopupStage = "select" | "loading" | "result";

const SAMPLE = `Hey Dimitri,

I am reaching out to introduce myself and explore potential synergies between our organizations. Based on my research, I believe there is significant value in connecting, and I would love to schedule a brief call at your earliest convenience.

Would love to chat with you. I'm free this afternoon at 4pm if you're available, or let me know what time works best for your schedule.

Best regards,
Alex`;

interface ScratchpadEditorProps {
  /** Called when the user hits the usage limit — parent opens upgrade modal */
  onUpgradeRequired?: () => void;
  /** Whether the user is out of rewrites */
  limitReached?: boolean;
}

export function ScratchpadEditor({ onUpgradeRequired, limitReached = false }: ScratchpadEditorProps) {
  const [anchor, setAnchor] = useState<SelectionAnchor>(null);
  const [expanded, setExpanded] = useState(false);
  const [popupStage, setPopupStage] = useState<PopupStage>("select");
  const [selectedTones, setSelectedTones] = useState<string[]>([]);
  const [resultText, setResultText] = useState("");
  const [generatedSignature, setGeneratedSignature] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const editorRef  = useRef<HTMLDivElement>(null);
  const bodyRef    = useRef<HTMLDivElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  // Refs so event-listener closures always see the latest values
  const popupStageRef = useRef<PopupStage>("select");
  const expandedRef   = useRef(false);

  // Pending anchor: calculated on selectionchange, committed on mouseup
  const pendingAnchorRef = useRef<SelectionAnchor>(null);
  const showTimerRef     = useRef<number | null>(null);

  useEffect(() => { popupStageRef.current = popupStage; }, [popupStage]);
  useEffect(() => { expandedRef.current   = expanded;   }, [expanded]);

  // ── Main selection + mouseup logic ────────────────────────────────────────
  useEffect(() => {
    const clearShowTimer = () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    // Called on every selectionchange — just stores the position, shows nothing yet.
    const handleSelectionChange = () => {
      // Don't interfere while rewrite is in progress
      if (popupStageRef.current !== "select") return;

      const selection = window.getSelection();
      const editor = editorRef.current;
      const body   = bodyRef.current;

      if (!selection || !editor || !body || selection.rangeCount === 0) {
        clearShowTimer();
        pendingAnchorRef.current = null;
        setAnchor(null);
        return;
      }

      const range        = selection.getRangeAt(0);
      const selectedText = selection.toString();

      if (
        range.collapsed ||
        selectedText.trim().length === 0 ||
        !editor.contains(range.commonAncestorContainer)
      ) {
        clearShowTimer();
        pendingAnchorRef.current = null;
        setAnchor(null);
        return;
      }

      // Smart gate
      if (!isRephrashable(selectedText)) {
        clearShowTimer();
        pendingAnchorRef.current = null;
        setAnchor(null);
        return;
      }

      // Calculate anchor relative to bodyRef
      const bodyRect       = body.getBoundingClientRect();
      const containerWidth = body.offsetWidth;

      const rects = range.getClientRects();
      if (rects.length === 0) {
        pendingAnchorRef.current = null;
        return;
      }
      const firstRect  = rects[0];
      const rangeRect  = range.getBoundingClientRect();
      const relLeft    = rangeRect.left  - bodyRect.left;
      const relRight   = rangeRect.right - bodyRect.left;
      const relFirstTop = firstRect.top  - bodyRect.top;
      const tabTop     = relFirstTop + firstRect.height / 2 - 18;

      const popupWidth  = Math.max(POPUP_MIN_WIDTH, Math.min(POPUP_MAX_WIDTH, containerWidth - 16));
      const rangeCenter = (relLeft + relRight) / 2;
      const desiredLeft = rangeCenter - popupWidth / 2;
      const popupLeft   = Math.min(Math.max(8, desiredLeft), Math.max(8, containerWidth - popupWidth - 8));

      savedRangeRef.current     = range.cloneRange();
      pendingAnchorRef.current  = { tabTop, popupTop: relFirstTop, popupLeft, popupWidth };

      // Bug-fix #2: if the popup is open from a previous selection, dismiss it
      // so the user starts fresh. The button will re-appear on mouseup.
      if (expandedRef.current) {
        setExpanded(false);
        setAnchor(null);
        setPopupStage("select");
        setSelectedTones([]);
        setResultText("");
        setError("");
        clearShowTimer();
      }
    };

    // Called on mouseup — user finished selecting, now show the button.
    const handleMouseUp = () => {
      if (!pendingAnchorRef.current) return;
      if (expandedRef.current) return; // popup already open, leave it

      clearShowTimer();
      const snapshot = pendingAnchorRef.current;
      showTimerRef.current = window.setTimeout(() => {
        setAnchor(snapshot);
        showTimerRef.current = null;
      }, SHOW_DELAY_MS) as unknown as number;
    };

    // Keyboard selection (Shift+arrows, Ctrl+A, etc.) — trigger on keyup
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a")) {
        handleMouseUp();
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("mouseup",         handleMouseUp);
    document.addEventListener("keyup",           handleKeyUp);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mouseup",         handleMouseUp);
      document.removeEventListener("keyup",           handleKeyUp);
      clearShowTimer();
    };
  }, []);

  // ── Outside-click closes popup ────────────────────────────────────────────
  useEffect(() => {
    if (!expanded) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target))  return;
      if (editorRef.current?.contains(target)) return;
      closePopup();
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [expanded]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function closePopup() {
    setAnchor(null);
    setExpanded(false);
    setPopupStage("select");
    setSelectedTones([]);
    setResultText("");
    setGeneratedSignature("");
    setCopied(false);
    setError("");
    savedRangeRef.current    = null;
    pendingAnchorRef.current = null;
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }

  const openPopup = () => {
    setExpanded(true);
    setSelectedTones([]);
    setResultText("");
    setGeneratedSignature("");
    setCopied(false);
    setError("");
    setPopupStage("select");
  };

  const toggleTone = (tone: string) => {
    if (limitReached) {
      onUpgradeRequired?.();
      return;
    }
    setSelectedTones((prev) =>
      prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
    );
  };

  const handleGenerate = async () => {
    const range = savedRangeRef.current;
    if (!range || selectedTones.length === 0) return;
    const text = range.toString();
    if (!text.trim()) return;

    const signature = `${text}\n---huu-tones---\n${selectedTones.join("|")}`;
    if (resultText && generatedSignature === signature) { setPopupStage("result"); return; }

    setPopupStage("loading");
    setError("");
    try {
      const res  = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tones: selectedTones }),
      });
      const data = await res.json();
      // Usage limit hit — open upgrade modal instead of showing raw error
      if (data.error === "usage_limit_reached" || res.status === 429) {
        setPopupStage("select");
        closePopup();
        onUpgradeRequired?.();
        return;
      }
      if (!res.ok || !data.result) throw new Error(data.error ?? "Could not rewrite this text.");
      setResultText(data.result);
      setGeneratedSignature(signature);
      setPopupStage("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPopupStage("select");
    }
  };

  const handleAccept = () => {
    const range = savedRangeRef.current;
    if (!range || !resultText) { closePopup(); return; }
    range.deleteContents();
    range.insertNode(document.createTextNode(resultText));
    editorRef.current?.normalize();
    window.getSelection()?.removeAllRanges();
    closePopup();
  };

  const handleCopy = async () => {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleBack = () => {
    setCopied(false);
    setError("");
    setPopupStage("select");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-[520px] flex-col rounded-3xl border border-black/10 bg-white shadow-sm">
      <div className="border-b border-black/10 px-6 py-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
          Scratchpad
        </p>
        <h2 className="font-display text-3xl">Select text to rewrite.</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Highlight any part of the text below, click the yellow tab, pick a
          style, then accept the rewrite.
        </p>
      </div>

      <div ref={bodyRef} className="relative flex-1 p-6">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          className="min-h-[360px] rounded-3xl border-2 border-black bg-[#fbfaf8] p-6 text-[15px] leading-7 text-neutral-800 whitespace-pre-wrap focus:outline-none"
          style={{ caretColor: "#fff700" }}
        >
          {SAMPLE}
        </div>

        {/* Yellow huu button — far-left, fades in after mouseup */}
        {anchor && !expanded && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              openPopup();
            }}
            className="absolute z-20 flex h-9 w-9 items-center justify-center rounded-full border-2 border-black bg-[#fff700] text-black shadow-md"
            style={{
              top:  anchor.tabTop,
              left: 4,
              animation: "huu-btn-fadein 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards",
            }}
            aria-label="Open rewrite options"
          >
            ↑
          </button>
        )}

        {/* Tone / result popup */}
        {anchor && expanded && (
          <div
            ref={popupRef}
            className="absolute z-30"
            style={{
              top:       anchor.popupTop,
              left:      anchor.popupLeft,
              width:     anchor.popupWidth,
              transform: "translateY(calc(-100% - 12px))",
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="overflow-hidden rounded-2xl border-2 border-[#fff700] bg-white shadow-xl">
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
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#fff700] text-sm transition hover:bg-[#fff700] disabled:opacity-40"
                      aria-label="Generate"
                    >
                      →
                    </button>
                  </div>
                )}

                {popupStage === "loading" && (
                  <div className="space-y-2.5 py-1">
                    <div className="huu-shimmer h-2.5 w-full rounded-full" />
                    <div className="huu-shimmer h-2.5 w-11/12 rounded-full" />
                    <div className="huu-shimmer h-2.5 w-4/5 rounded-full" />
                    <p className="pt-2 text-center text-[11px] text-neutral-500">Rewriting…</p>
                  </div>
                )}

                {popupStage === "result" && (
                  <>
                    <p className="mb-4 whitespace-pre-wrap text-sm leading-6 text-neutral-800">
                      {resultText}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={handleBack} className="rounded-full border-2 border-[#fff700] px-3.5 py-1.5 text-xs font-bold">
                        Back
                      </button>
                      <div className="flex gap-2">
                        <button onClick={handleCopy} className="rounded-full bg-neutral-100 px-3.5 py-1.5 text-xs font-bold">
                          {copied ? "Copied" : "Copy"}
                        </button>
                        <button onClick={handleAccept} className="rounded-full border-2 border-black bg-[#fff700] px-3.5 py-1.5 text-xs font-black">
                          Accept
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {error && (
                  <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
