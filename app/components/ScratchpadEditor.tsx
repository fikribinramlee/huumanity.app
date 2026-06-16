"use client";

import { useEffect, useRef, useState } from "react";
import { isRephrashable } from "../lib/isRephrashable";

const TONES = ["Humanize", "Unpolished", "Controversial", "Direct"] as const;
const POPUP_MAX_WIDTH = 480;
const POPUP_MIN_WIDTH = 280;

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

// Copy that survives focus loss. navigator.clipboard.writeText rejects with
// "Document is not focused" when another app (e.g. the desktop selector) grabs
// focus mid-rewrite — that's the intermittent "Copy didn't work". Fall back to
// the old execCommand path, which doesn't require document focus.
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    window.focus();
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

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

  useEffect(() => { popupStageRef.current = popupStage; }, [popupStage]);
  useEffect(() => { expandedRef.current   = expanded;   }, [expanded]);

  // ── Selection → show / hide the yellow tab ────────────────────────────────
  // Deterministic model: read the LIVE selection at the moment a gesture
  // finishes (mouseup / dblclick / keyboard select) and show immediately if
  // it's real rephrasable text inside the editor. Hide the instant the
  // selection collapses. The old version stored a "pending anchor" on
  // selectionchange and committed it 350ms later on mouseup — that cross-event
  // hand-off raced (double-click never fired a second mouseup, fast selects
  // beat the timer), which is exactly why the tab showed inconsistently.
  useEffect(() => {
    const computeAnchor = (): SelectionAnchor => {
      const selection = window.getSelection();
      const editor = editorRef.current;
      const body   = bodyRef.current;
      if (!selection || !editor || !body || selection.rangeCount === 0) return null;

      const range        = selection.getRangeAt(0);
      const selectedText = selection.toString();
      if (
        range.collapsed ||
        selectedText.trim().length === 0 ||
        !editor.contains(range.commonAncestorContainer) ||
        !isRephrashable(selectedText)
      ) {
        return null;
      }

      const bodyRect       = body.getBoundingClientRect();
      const containerWidth = body.offsetWidth;
      const rects          = range.getClientRects();
      if (rects.length === 0) return null;

      const firstRect   = rects[0];
      const rangeRect   = range.getBoundingClientRect();
      const relLeft     = rangeRect.left  - bodyRect.left;
      const relRight    = rangeRect.right - bodyRect.left;
      const relFirstTop = firstRect.top   - bodyRect.top;
      const tabTop      = relFirstTop + firstRect.height / 2 - 18;
      const popupWidth  = Math.max(POPUP_MIN_WIDTH, Math.min(POPUP_MAX_WIDTH, containerWidth - 16));
      const rangeCenter = (relLeft + relRight) / 2;
      const desiredLeft = rangeCenter - popupWidth / 2;
      const popupLeft   = Math.min(Math.max(8, desiredLeft), Math.max(8, containerWidth - popupWidth - 8));

      savedRangeRef.current = range.cloneRange();
      return { tabTop, popupTop: relFirstTop, popupLeft, popupWidth };
    };

    // A selection gesture finished — show the tab from the live selection.
    const tryShow = () => {
      if (popupStageRef.current !== "select") return; // mid-rewrite, leave it
      if (expandedRef.current) return;                // popup already open
      const next = computeAnchor();
      // Don't clobber an existing tab on a null read — the collapse handler
      // owns hiding. Only update when there's a real selection to show.
      if (next) setAnchor(next);
    };

    // Defer one tick so the browser has finalized the selection for the gesture
    // (mouseup boundary, double-click word expansion, etc.) before we read it.
    const settleThenShow = () => window.setTimeout(tryShow, 0);

    // Selection collapsed or cleared → hide the tab immediately. This is what
    // kills the "stuck tab" bug: the moment the highlight is gone, so is the tab.
    const handleSelectionChange = () => {
      if (popupStageRef.current !== "select") return;
      if (expandedRef.current) return; // popup keeps its own saved range
      const selection = window.getSelection();
      const editor    = editorRef.current;
      const collapsed =
        !selection ||
        selection.rangeCount === 0 ||
        selection.getRangeAt(0).collapsed ||
        selection.toString().trim().length === 0 ||
        !editor?.contains(selection.getRangeAt(0).commonAncestorContainer);
      if (collapsed) setAnchor(null);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a")) {
        settleThenShow();
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("mouseup",  settleThenShow);
    document.addEventListener("dblclick", settleThenShow);
    document.addEventListener("keyup",    handleKeyUp);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mouseup",  settleThenShow);
      document.removeEventListener("dblclick", settleThenShow);
      document.removeEventListener("keyup",    handleKeyUp);
    };
  }, []);

  // ── Click-away dismiss ────────────────────────────────────────────────────
  // A mousedown outside both the editor and the popup tears everything down.
  // Bound whenever the tab OR the popup is visible. This is the safety net for
  // the "stuck tab" case where clicking a non-editable region doesn't reliably
  // fire selectionchange, so the tab would otherwise linger.
  useEffect(() => {
    if (!anchor && !expanded) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target))  return;
      if (editorRef.current?.contains(target)) return;
      if (expanded) closePopup();
      else setAnchor(null);
    };
    // Defer binding so we don't catch the same click that opened the popup.
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [anchor, expanded]);

  // Escape always dismisses, whatever stage we're in.
  useEffect(() => {
    if (!anchor && !expanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closePopup(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [anchor, expanded]);

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
    savedRangeRef.current = null;
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
      const voiceInstructions =
        localStorage.getItem("huu-voice-instructions")?.trim() ?? "";
      const res  = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          tones: selectedTones,
          ...(voiceInstructions ? { voiceInstructions } : {}),
        }),
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
    try {
      // Re-focus the editor first. If another app (the desktop selector) grabbed
      // focus, the saved range can be detached from the live selection; bringing
      // focus back makes the DOM mutation below stick.
      editorRef.current?.focus();
      range.deleteContents();
      range.insertNode(document.createTextNode(resultText));
      editorRef.current?.normalize();
    } catch {
      // Range went stale (selection cleared by focus loss). Never lose the
      // rewrite — drop it on the clipboard so the user can paste it.
      void copyToClipboard(resultText);
    }
    window.getSelection()?.removeAllRanges();
    closePopup();
  };

  const handleCopy = async () => {
    if (!resultText) return;
    const ok = await copyToClipboard(resultText);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
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
          style={{ caretColor: "#000" }}
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
