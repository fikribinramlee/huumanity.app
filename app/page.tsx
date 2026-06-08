"use client";

import { useEffect, useRef, useState } from "react";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import Link from "next/link";

// ---------- Constants ----------

const TABS = ["Email", "DMs", "Posts"] as const;
type Tab = (typeof TABS)[number];

const TONES = ["Humanize", "Unpolished", "Controversial", "Direct"] as const;

const SAMPLES: Record<Tab, string> = {
  Email: `Hey Dimitri,

I am reaching out to introduce myself and explore potential synergies between our organizations. Based on my research, I believe there is significant value in connecting, and I would love to schedule a brief call at your earliest convenience to discuss how we might collaborate moving forward.

Would love to chat with you. I'm free this afternoon at 4pm if you're available, or let me know what time works best for your schedule.

Best regards,
Alex`,

  DMs: `Yo Shawn, I came across your profile and was thoroughly impressed by your professional accomplishments and the value you continue to deliver in your industry. I would love to connect and explore opportunities for mutual collaboration.

Looking forward to engaging with your insightful content and hearing back from you at your earliest convenience.`,

  Posts: `After conducting extensive research and analysis over the past several months, I am thrilled to share that AI is fundamentally transforming the way we approach productivity and workflow optimization.

The implications of this technological revolution truly cannot be overstated.

I will be sharing more in-depth insights in the coming days. Stay tuned for what promises to be an exciting thread.`,
};

const NAV_LINKS = [
  { href: "#benefit", label: "How it Works" },
  { href: "#demo", label: "Demo" },
  { href: "#use-cases", label: "Use Cases" },
  { href: "#pricing", label: "Pricing" },
];

const BRAND_LOGOS = [
  "OpenAI", "YC", "a16z", "Stripe", "Notion", "Vercel", "Linear", "Figma", "Loom", "Superhuman", "Anthropic", "Mercury",
];

type UseCase = {
  id: "anywhere" | "outreach" | "posts" | "scripts";
  label: string;
  title: string;
  blurb: string;
};

const USE_CASES: UseCase[] = [
  {
    id: "anywhere",
    label: "Anywhere",
    title: "huu for Anywhere",
    blurb:
      "Highlight any text you see on your screen. Doesn't matter where it is — a webpage, a doc, a form. Pick a tone and huumanity rewrites it right there for you to clipboard it.",
  },
  {
    id: "outreach",
    label: "Outreach",
    title: "huu for Outreach",
    blurb:
      "Whether it be for cold emails, DMs, follow-ups — your prospects can smell a ChatGPT template from the subject line. huumanity rewrites your draft so it sounds like it was written by an actual human with emotions, and that you actually gave a damn before hitting send.",
  },
  {
    id: "posts",
    label: "Posts",
    title: "huu for Posts",
    blurb:
      "If your X and LinkedIn posts, Instagram captions, or newsletters sound obviously written by AI, no one will find that shit trustworthy. Nobody shares content that sounds like a robot wrote it. huumanity gives your posts the edge and the voice that makes people care about what you have to say.",
  },
  {
    id: "scripts",
    label: "Scripts",
    title: "huu for Scripts",
    blurb:
      "Audiences can still hear that your script is written by AI. Doesn't matter if it's for a whole YouTube video or short-form content — reading AI-written scripts out loud is painful for everyone in the room. huumanity rewrites them so the words actually sound like yours.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "huu literally saved my outbound. My reply rate went from 1.2% to 11% in two weeks. The emails finally sound like a person.",
    name: "Maya Patel",
    role: "Founder, Loomly",
  },
  {
    quote:
      "I draft with ChatGPT and finish with huu. It’s the only tool that strips the AI smell without changing what I’m trying to say.",
    name: "Daniel Cho",
    role: "Head of Content, Mercury",
  },
  {
    quote:
      "Best $12/mo I spend. My LinkedIn posts went from corporate slop to actually getting comments from real humans.",
    name: "Rina Suzuki",
    role: "Growth at Linear",
  },
  {
    quote:
      "I rewrite every cold email with huu before sending. My reps used to ignore my Loom requests. Now they reply same day.",
    name: "James O’Connor",
    role: "Sales Lead, Bracket",
  },
  {
    quote:
      "Every recruiter on my team uses huu. Candidates told us our outreach finally sounds like a human company, not a careers page.",
    name: "Priya Iyer",
    role: "Talent Partner, Northwind",
  },
  {
    quote:
      "I write 30+ DMs a day. huu makes them sound like me without me having to rewrite from scratch. Genuinely life-changing.",
    name: "Owen Bell",
    role: "Creator, 480k on X",
  },
];

const PRICING = [
  {
    name: "Free",
    monthlyPrice: "$0",
    annualPrice: "$0",
    cadence: "/forever",
    features: [
      "5 rewrites per day",
      "All 4 tones",
      "App that works everywhere — any app, any text field on your computer",
      "No credit card needed",
    ],
    cta: "Download free",
    accent: false,
  },
  {
    name: "Pro",
    monthlyPrice: "$10",
    annualPrice: "$8",
    cadence: "/mo",
    features: [
      "Everything in the free plan",
      "Unlimited rewrites",
    ],
    cta: "Get Pro",
    accent: true,
  },
];

const FOOTER_LINKS: { title: string; links: string[] }[] = [
  { title: "Product", links: ["Demo", "Pricing", "Changelog"] },
  { title: "Use Cases", links: ["Outreach", "Posts", "Scripts"] },
  { title: "Company", links: ["About", "Blog", "Contact"] },
  { title: "Legal", links: ["Terms", "Privacy"] },
];

type DownloadPlatform = "macos" | "windows" | "linux";

function detectDownloadPlatform(): DownloadPlatform {
  if (typeof navigator === "undefined") return "macos";

  const value = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (value.includes("win")) return "windows";
  if (value.includes("linux") || value.includes("x11")) return "linux";
  return "macos";
}

function downloadCtaLabel(platform: DownloadPlatform) {
  if (platform === "windows") return "Download for Windows";
  if (platform === "linux") return "Download for Linux";
  return "Download for macOS";
}

function PlatformIcon({ platform }: { platform: DownloadPlatform }) {
  if (platform === "windows") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 4.4 10.7 3v8.2H3V4.4Zm0 8.4h7.7V21L3 19.6v-6.8Zm9.3-10.1L21 1.2v10h-8.7V2.7Zm0 10.1H21v10l-8.7-1.5v-8.5Z" />
      </svg>
    );
  }

  if (platform === "linux") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2c2.1 0 3.8 1.8 3.8 4.1 0 1.2.4 2.3 1 3.4l2.3 4.2c.8 1.5.2 3.3-1.3 4l-1.5.7c-.8 2.1-2.4 3.6-4.3 3.6s-3.5-1.5-4.3-3.6l-1.5-.7c-1.5-.7-2.1-2.5-1.3-4l2.3-4.2c.6-1.1 1-2.2 1-3.4C8.2 3.8 9.9 2 12 2Zm-1.4 5.2c.5 0 .9-.4.9-.9s-.4-.9-.9-.9-.9.4-.9.9.4.9.9.9Zm2.8 0c.5 0 .9-.4.9-.9s-.4-.9-.9-.9-.9.4-.9.9.4.9.9.9Z" />
      </svg>
    );
  }

  return (
    <svg width="15" height="18" viewBox="0 0 18 22" fill="currentColor" aria-hidden="true">
      <path d="M14.7 11.6c0-2.7 2.2-4 2.3-4.1-1.3-1.8-3.2-2.1-3.8-2.1-1.6-.2-3.1.9-3.9.9s-2-.9-3.3-.9C4.3 5.4 2.7 6.4 1.8 8c-1.9 3.2-.5 8 1.3 10.6.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.8 3.4-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-3.1-1.2-3.1-4ZM12.1 3.7c.7-.9 1.2-2 1.1-3.2-1.1 0-2.3.7-3.1 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3.1-1.5Z" />
    </svg>
  );
}

function DownloadCtaContent({ platform }: { platform: DownloadPlatform }) {
  return (
    <>
      <PlatformIcon platform={platform} />
      <span>{downloadCtaLabel(platform)}</span>
    </>
  );
}

type SelectionAnchor = {
  tabTop: number;
  tabLeft: number;
  popupTop: number;
  popupLeft: number;
  popupWidth: number;
} | null;

type PopupStage = "select" | "loading" | "result" | "limit";

const POPUP_MAX_WIDTH = 480;
const POPUP_MIN_WIDTH = 280;
const FREE_LIMIT = 8;
const ANON_LIMIT = 5;
const ANON_RESET_MS = 24 * 60 * 60 * 1000;
const ANON_USAGE_KEY = "huu_anon_usage";

type AnonUsage = { count: number; firstUseTime: number };

function readAnonUsage(): AnonUsage {
  if (typeof window === "undefined") return { count: 0, firstUseTime: 0 };
  try {
    const raw = localStorage.getItem(ANON_USAGE_KEY);
    if (!raw) return { count: 0, firstUseTime: 0 };
    const parsed = JSON.parse(raw) as AnonUsage;
    if (
      parsed.firstUseTime &&
      Date.now() - parsed.firstUseTime > ANON_RESET_MS
    ) {
      localStorage.removeItem(ANON_USAGE_KEY);
      return { count: 0, firstUseTime: 0 };
    }
    return parsed;
  } catch {
    return { count: 0, firstUseTime: 0 };
  }
}

function writeAnonUsage(next: AnonUsage) {
  try {
    localStorage.setItem(ANON_USAGE_KEY, JSON.stringify(next));
  } catch {}
}
const BRAND = "#fff700";

// ---------- Component ----------

export default function LandingPage() {
  const { isSignedIn, isLoaded, user } = useUser();
  const downloadPlatform = detectDownloadPlatform();
  const [usageCount, setUsageCount] = useState<number>(0);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("Email");
  const [anchor, setAnchor] = useState<SelectionAnchor>(null);
  const [expanded, setExpanded] = useState(false);
  const [popupStage, setPopupStage] = useState<PopupStage>("select");
  const [selectedTones, setSelectedTones] = useState<string[]>([]);
  const [resultText, setResultText] = useState<string>("");
  const [generatedSignature, setGeneratedSignature] = useState("");
  const [copied, setCopied] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  const [activeUseCase, setActiveUseCase] = useState<UseCase>(USE_CASES[0]);
  const [animStep, setAnimStep] = useState(0);
  const [arrowFlash, setArrowFlash] = useState(false);
  const [animStarted, setAnimStarted] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);      // 0=email, 1=Unpolished, 2=Controversial, 3=Enter
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorExiting, setCursorExiting] = useState(false);
  const [btnLefts, setBtnLefts] = useState({ u: "19%", c: "32%", e: "50%" });
  // Feature section animation state
  const [featAnimStep, setFeatAnimStep] = useState(0);
  const [featArrowFlash, setFeatArrowFlash] = useState(false);
  const [featAnimStarted, setFeatAnimStarted] = useState(false);
  const [featCursorPos, setFeatCursorPos] = useState(0); // 0=text, 1=Humanize, 2=Unpolished, 3=Enter
  const [featCursorVisible, setFeatCursorVisible] = useState(false);
  const [featCursorExiting, setFeatCursorExiting] = useState(false);
  const [featBtnLefts, setFeatBtnLefts] = useState<{ h: string; u: string; e: string; top: string }>({ h: "15%", u: "33%", e: "75%", top: "54%" });
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const savedRangeRef = useRef<Range | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const demoSectionRef = useRef<HTMLDivElement>(null);
  const benefitSectionRef = useRef<HTMLElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const featSectionRef = useRef<HTMLElement>(null);
  const featVizRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupStageRef = useRef<PopupStage>("select");

  // Keep the ref in sync so the global selectionchange listener can read the latest value.
  useEffect(() => {
    popupStageRef.current = popupStage;
  }, [popupStage]);

  useEffect(() => {
    if (user?.publicMetadata?.usageCount !== undefined) {
      const id = window.setTimeout(() => {
        setUsageCount(user.publicMetadata.usageCount as number);
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [user]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Start animation only when the benefit section scrolls into view.
  useEffect(() => {
    const el = benefitSectionRef.current;
    if (!el || animStarted) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animStarted]);

  // Compute cursor target positions from real DOM layout (updates on resize too).
  useEffect(() => {
    const compute = () => {
      const col = rightColumnRef.current;
      if (!col) return;
      const u = col.querySelector('[data-btn-id="unpolished"]') as HTMLElement | null;
      const c = col.querySelector('[data-btn-id="controversial"]') as HTMLElement | null;
      const e = col.querySelector('[data-btn-id="enter"]') as HTMLElement | null;
      if (!u || !c || !e) return;
      const colRect = col.getBoundingClientRect();
      const pct = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2 - 1; // -1 for cursor tip offset
        return `${(((cx - colRect.left) / colRect.width) * 100).toFixed(1)}%`;
      };
      setBtnLefts({ u: pct(u), c: pct(c), e: pct(e) });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Benefit-section demo animation — runs once after animStarted flips true.
  useEffect(() => {
    if (!animStarted) return;
    // ── Fade in at email ──
    const t1  = window.setTimeout(() => { setCursorPos(0); setCursorVisible(true); }, 600);
    // Selection highlight
    const t2  = window.setTimeout(() => setAnimStep(2), 1800);

    // ── Tone picker appears, cursor moves up to Unpolished (visible, smooth) ──
    const t3a = window.setTimeout(() => setAnimStep(3), 3300);
    const t3b = window.setTimeout(() => setCursorPos(1), 3400); // move while visible
    // Unpolished turns yellow once cursor has arrived (~800ms travel)
    const t4  = window.setTimeout(() => setAnimStep(4), 4400);

    // ── Cursor moves to Controversial (visible, smooth) ──
    const t5a = window.setTimeout(() => setCursorPos(2), 5000);
    // Controversial turns yellow
    const t5b = window.setTimeout(() => setAnimStep(5), 5900);

    // ── Cursor moves to Enter (visible, smooth) ──
    const t6a = window.setTimeout(() => setCursorPos(3), 6500);
    // Enter button flashes (click!)
    const t6b = window.setTimeout(() => {
      setArrowFlash(true);
      window.setTimeout(() => setArrowFlash(false), 600);
    }, 7300);

    // ── Cursor exits: slides right and fades out ──
    const t7a = window.setTimeout(() => { setCursorExiting(true); setCursorVisible(false); }, 7900);
    const t7b = window.setTimeout(() => setCursorExiting(false), 8600); // reset

    // ── Result ──
    const t8 = window.setTimeout(() => setAnimStep(6), 8500);
    const t9 = window.setTimeout(() => setAnimStep(7), 9500);

    return () => {
      [t1,t2,t3a,t3b,t4,t5a,t5b,t6a,t6b,t7a,t7b,t8,t9]
        .forEach((t) => window.clearTimeout(t));
    };
  }, [animStarted]);

  // Feature section: trigger animation when scrolled into view.
  useEffect(() => {
    const el = featSectionRef.current;
    if (!el || featAnimStarted) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setFeatAnimStarted(true); observer.disconnect(); }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [featAnimStarted]);

  // Feature section: compute tone-button DOM positions for cursor targeting.
  useEffect(() => {
    const compute = () => {
      const viz = featVizRef.current;
      if (!viz) return;
      const h = viz.querySelector('[data-feat-btn-id="humanize"]') as HTMLElement | null;
      const u = viz.querySelector('[data-feat-btn-id="unpolished"]') as HTMLElement | null;
      const e = viz.querySelector('[data-feat-btn-id="enter"]') as HTMLElement | null;
      if (!h || !u || !e) return;
      const vr = viz.getBoundingClientRect();
      const pctLeft = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return `${(((r.left + r.width / 2 - 1 - vr.left) / vr.width) * 100).toFixed(1)}%`;
      };
      const pctTop = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return `${(((r.top + r.height / 2 - vr.top) / vr.height) * 100).toFixed(1)}%`;
      };
      setFeatBtnLefts({ h: pctLeft(h), u: pctLeft(u), e: pctLeft(e), top: pctTop(h) });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Feature section: animation sequence (runs once after featAnimStarted).
  useEffect(() => {
    if (!featAnimStarted) return;
    const f1  = window.setTimeout(() => { setFeatCursorPos(0); setFeatCursorVisible(true); }, 600);
    const f2  = window.setTimeout(() => setFeatAnimStep(2), 1800);   // text selected
    const f3a = window.setTimeout(() => setFeatAnimStep(3), 3000);   // tone bar appears
    const f3b = window.setTimeout(() => setFeatCursorPos(1), 3200);  // cursor → Humanize
    const f4  = window.setTimeout(() => setFeatAnimStep(4), 4100);   // Humanize yellow
    const f5a = window.setTimeout(() => setFeatCursorPos(2), 4700);  // cursor → Unpolished
    const f5b = window.setTimeout(() => setFeatAnimStep(5), 5600);   // Unpolished yellow
    const f6a = window.setTimeout(() => setFeatCursorPos(3), 6200);  // cursor → Enter
    const f6b = window.setTimeout(() => {
      setFeatArrowFlash(true);
      window.setTimeout(() => setFeatArrowFlash(false), 600);
    }, 7000);
    const f7a = window.setTimeout(() => { setFeatCursorExiting(true); setFeatCursorVisible(false); }, 7600);
    const f7b = window.setTimeout(() => setFeatCursorExiting(false), 8300);
    const f8  = window.setTimeout(() => setFeatAnimStep(6), 7900);   // loading
    const f9  = window.setTimeout(() => setFeatAnimStep(7), 9200);   // result
    return () => {
      [f1,f2,f3a,f3b,f4,f5a,f5b,f6a,f6b,f7a,f7b,f8,f9].forEach((t) => window.clearTimeout(t));
    };
  }, [featAnimStarted]);

  // Track which section is in view for crossed-out nav effect.
  // Uses a shared Set so that when ALL sections leave the viewport (i.e. hero is showing)
  // activeSection resets to "" and no nav link is crossed out.
  useEffect(() => {
    const sectionIds = NAV_LINKS.map((l) => l.href.replace("#", ""));
    const visible = new Set<string>();
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            visible.add(id);
            setActiveSection(id);
          } else {
            visible.delete(id);
            // If nothing is in view any more (back at hero) → clear the cross-out
            setActiveSection((prev) => {
              if (prev !== id) return prev;           // something else is still active
              if (visible.size > 0) return [...visible][visible.size - 1];
              return "";                              // hero — no section active
            });
          }
        },
        { rootMargin: "-40% 0px -40% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      // Don't dismiss popup while loading or showing result.
      if (popupStageRef.current !== "select") return;

      const selection = window.getSelection();
      const editor = editorRef.current;
      const section = demoSectionRef.current;

      if (!selection || !editor || !section || selection.rangeCount === 0) {
        setAnchor(null);
        setExpanded(false);
        return;
      }

      const range = selection.getRangeAt(0);
      const selectedText = selection.toString();

      if (
        range.collapsed ||
        selectedText.trim().length === 0 ||
        !editor.contains(range.commonAncestorContainer)
      ) {
        setAnchor(null);
        setExpanded(false);
        return;
      }

      const rangeRect = range.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      const sectionWidth = section.offsetWidth;

      const relRight = rangeRect.right - sectionRect.left;
      const relLeft = rangeRect.left - sectionRect.left;
      const relTop = rangeRect.top - sectionRect.top;
      const relHeight = rangeRect.height;

      const tabLeft = Math.min(relRight + 10, sectionWidth - 40);
      const tabTop = relTop + relHeight / 2 - 14;

      // Popup width adapts to section so it never causes horizontal page overflow.
      const popupWidth = Math.max(
        POPUP_MIN_WIDTH,
        Math.min(POPUP_MAX_WIDTH, sectionWidth - 16)
      );

      // Always centered horizontally above the selection, translated upward
      // via CSS transform so its bottom edge sits 12px above the selection top.
      const rangeCenter = (relLeft + relRight) / 2;
      const desiredLeft = rangeCenter - popupWidth / 2;
      const popupLeft = Math.min(
        Math.max(8, desiredLeft),
        Math.max(8, sectionWidth - popupWidth - 8)
      );
      const popupTop = relTop;

      setAnchor({ tabTop, tabLeft, popupTop, popupLeft, popupWidth });
      savedRangeRef.current = range.cloneRange();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setAnchor(null);
      setExpanded(false);
      setPopupStage("select");
      setSelectedTones([]);
      setResultText("");
      setGeneratedSignature("");
      window.getSelection()?.removeAllRanges();
    }, 0);

    return () => window.clearTimeout(id);
  }, [activeTab]);

  // Click outside the popup (and outside the editor) closes the popup.
  useEffect(() => {
    if (!expanded) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (editorRef.current?.contains(target)) return;
      closePopup();
    };

    // Defer one tick so the click that opened the popup doesn't immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [expanded]);

  const isAtLimit = () => {
    if (isSignedIn) return usageCount >= FREE_LIMIT;
    return readAnonUsage().count >= ANON_LIMIT;
  };

  function closePopup() {
    setAnchor(null);
    setExpanded(false);
    setPopupStage("select");
    setSelectedTones([]);
    setResultText("");
    setGeneratedSignature("");
    setCopied(false);
    savedRangeRef.current = null;
  }

  const openPopup = () => {
    setExpanded(true);
    setSelectedTones([]);
    setResultText("");
    setGeneratedSignature("");
    setCopied(false);
    setPopupStage("select");
  };
  const handleCustomModeToggle = () => {
    const entering = !isCustomMode;
    setIsCustomMode(entering);
    if (entering) {
      setAnchor(null);
      setExpanded(false);
      setPopupStage("select");
      setSelectedTones([]);
      setResultText("");
      setGeneratedSignature("");
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleBack = () => {
    setCopied(false);
    setPopupStage("select");
  };

  // After the user dismisses the download modal, transform the popup into the
  // locked "out of rewrites" state with the black header bar.
  const handleDismissLimitModal = () => {
    setShowLimitModal(false);
    setPopupStage("limit");
  };

  const toggleTone = (tone: string) => {
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
    if (resultText && generatedSignature === signature) {
      setPopupStage("result");
      return;
    }

    // Hard gate: at limit → show the download modal first. Once the user
    // dismisses it, the popup transitions to the locked "limit" stage.
    if (isAtLimit()) {
      setShowLimitModal(true);
      return;
    }

    setPopupStage("loading");

    try {
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tones: selectedTones }),
      });

      const data = await res.json();

      if (
        res.status === 401 ||
        res.status === 429 ||
        data.error === "sign_up_required" ||
        data.error === "usage_limit_reached"
      ) {
        setPopupStage("select");
        setShowLimitModal(true);
        return;
      }
      if (!data.result) {
        console.error("Humanize API returned no result:", data);
        setPopupStage("select");
        return;
      }

      // Update usage counters.
      if (isSignedIn && data.usageCount !== undefined) {
        setUsageCount(data.usageCount);
      } else if (!isSignedIn) {
        const current = readAnonUsage();
        const next: AnonUsage = {
          count: current.count + 1,
          firstUseTime: current.firstUseTime || Date.now(),
        };
        writeAnonUsage(next);
      }

      setResultText(data.result);
      setGeneratedSignature(signature);
      setPopupStage("result");
    } catch (err) {
      console.error(err);
      setPopupStage("select");
    }
  };

  const handleAccept = () => {
    const range = savedRangeRef.current;
    if (!range || !resultText) {
      closePopup();
      return;
    }
    range.deleteContents();
    range.insertNode(document.createTextNode(resultText));
    editorRef.current?.normalize();
    window.getSelection()?.removeAllRanges();
    closePopup();
  };

  const handleCopy = async () => {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Limit modal — first intervention when user clicks generate at the limit.
          Dismissing it transitions the popup into the locked "limit" stage. */}
      {showLimitModal && (
        <div
          onClick={handleDismissLimitModal}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-10 text-center"
          >
            <button
              onClick={handleDismissLimitModal}
              aria-label="Close"
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-black hover:bg-neutral-100 transition"
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="text-5xl mb-4 text-[#fff700] [text-shadow:0_2px_0_rgba(0,0,0,0.08)]">
              ✦
            </div>
            <h3 className="font-display text-3xl text-black mb-3 leading-tight">
              Download the app for the full experience
            </h3>
            <p className="text-neutral-500 text-sm mb-8 leading-relaxed">
              You&rsquo;ve used all your free web rewrites for today. Get the
              desktop app for unlimited rewrites and the ability to humanize
              text in any field, anywhere on your computer.
            </p>
            <div className="flex flex-col gap-3">
              <a
                href="/download"
                onClick={handleDismissLimitModal}
                className="w-full px-6 py-3.5 text-base font-bold text-black bg-[#fff700] rounded-full hover:brightness-95 transition"
              >
                Download the app
              </a>
              <button
                onClick={handleDismissLimitModal}
                className="text-sm text-neutral-400 hover:text-black transition"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating island header */}
      <header className="fixed top-4 sm:top-6 left-0 right-0 z-50 flex justify-center px-6 pointer-events-none">
        <div
          className={`pointer-events-auto flex items-center w-full max-w-4xl px-6 py-3 rounded-full border transition-all duration-300 ${
            scrolled
              ? "bg-white/90 backdrop-blur-md border-black/10 shadow-lg"
              : "bg-white/80 backdrop-blur border-black/[0.08] shadow-sm"
          }`}
        >
          {/* Logo — left */}
          <a
            href="#top"
            className="font-display text-3xl text-black leading-none shrink-0 mr-8"
          >
            huu
          </a>

          {/* Nav links — center, flex-1 */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {NAV_LINKS.map((link) => {
              const id = link.href.replace("#", "");
              const isCurrent = activeSection === id;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`relative px-4 py-2 font-display text-sm font-bold rounded-full transition-colors ${
                    isCurrent
                      ? "text-neutral-400"
                      : "text-neutral-700 hover:text-black hover:bg-black/[0.04]"
                  }`}
                >
                  {isCurrent && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-4 top-1/2 h-px bg-neutral-400 -translate-y-1/2"
                    />
                  )}
                  {link.label}
                </a>
              );
            })}
          </nav>

          {/* Divider */}
          <div className="hidden md:block w-px h-5 bg-black/15 mx-6 shrink-0" />

          {/* Auth controls — right */}
          <div className="shrink-0 flex items-center gap-3">
            {isLoaded && isSignedIn ? (
              <a
                href="/download"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-[#fff700] px-5 py-2.5 text-sm font-black text-black shadow-[0_2px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
              >
                <DownloadCtaContent platform={downloadPlatform} />
              </a>
            ) : (
              <>
               <SignUpButton mode="redirect" forceRedirectUrl="/download">
                <button className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-[#fff700] px-5 py-2.5 text-sm font-black text-black shadow-[0_2px_0_rgba(0,0,0,0.18)] transition hover:brightness-95">
                  <DownloadCtaContent platform={downloadPlatform} />
                </button>
              </SignUpButton>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 1. HERO (white) */}
      <section
        id="top"
        className="bg-white px-4 sm:px-6 pt-24 sm:pt-28 pb-8"
      >
        {/* Big hero card — contains everything */}
        <div className="huu-hero-card w-full min-h-[78vh] rounded-3xl border border-black/[0.08] shadow-[0_4px_32px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center px-8 py-16 sm:py-20">

          <h1 className="font-display text-6xl sm:text-7xl md:text-8xl leading-[1.02] text-black max-w-4xl">
            &ldquo;Stop writing like a f*cking robot.&rdquo;
          </h1>

          <p className="font-sans text-neutral-500 text-lg sm:text-xl mt-6 mb-10 max-w-lg">
            the text selection tool that rephrases AI copy into unpolished-human sounding words across every app.
          </p>

          {/* Download CTA */}
          {isLoaded && isSignedIn ? (
            <a
              href="/download"
              className="inline-flex items-center gap-2.5 rounded-2xl border-2 border-black bg-[#fff700] px-10 py-4 text-lg font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
            >
              <DownloadCtaContent platform={downloadPlatform} />
            </a>
          ) : (
            <SignUpButton mode="redirect" forceRedirectUrl="/download">
              <button className="inline-flex items-center gap-2.5 rounded-2xl border-2 border-black bg-[#fff700] px-10 py-4 text-lg font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.18)] transition hover:brightness-95">
                <DownloadCtaContent platform={downloadPlatform} />
              </button>
            </SignUpButton>
          )}

          {/* Handwritten annotation */}
          <div className="mt-10 flex flex-col items-center gap-1">
            <svg width="20" height="34" viewBox="0 0 18 30" fill="none" aria-hidden="true" className="text-neutral-400">
              <path d="M9 28C9 28 7 18 9 2M9 2L3 10M9 2L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="font-handwritten text-2xl sm:text-3xl text-neutral-400 -rotate-2">
              &ldquo;because anyone can tell you use AI to write, you lazy f*ck&rdquo;
            </p>
          </div>

        </div>
      </section>

      {/* 2. BENEFIT — Rephrase anything */}
      <section
        id="benefit"
        ref={benefitSectionRef}
        className="bg-white px-4 sm:px-6 pt-24 sm:pt-28 pb-4 sm:pb-6"
      >
        {/* Everything lives inside the black box */}
        <div className="bg-black rounded-[2.5rem] w-full overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr]">

            {/* ── LEFT COLUMN — headline + CTA ── */}
            <div className="flex flex-col justify-center gap-7 p-10 sm:p-14 lg:border-r lg:border-white/10">

              {/* Platform pills */}
              <div className="flex flex-wrap gap-2">
                <span className="border border-white/30 text-white text-xs font-sans rounded-full px-4 py-1.5 flex items-center gap-1.5">
                  <svg width="11" height="13" viewBox="0 0 18 22" fill="currentColor" aria-hidden="true">
                    <path d="M14.7 11.6c0-2.7 2.2-4 2.3-4.1-1.3-1.8-3.2-2.1-3.8-2.1-1.6-.2-3.1.9-3.9.9s-2-.9-3.3-.9C4.3 5.4 2.7 6.4 1.8 8c-1.9 3.2-.5 8 1.3 10.6.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.8 3.4-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-3.1-1.2-3.1-4ZM12.1 3.7c.7-.9 1.2-2 1.1-3.2-1.1 0-2.3.7-3.1 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3.1-1.5Z"/>
                  </svg>
                  Mac
                </span>
                <span className="border border-white/30 text-white text-xs font-sans rounded-full px-4 py-1.5 flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3 4.4 10.7 3v8.2H3V4.4Zm0 8.4h7.7V21L3 19.6v-6.8Zm9.3-10.1L21 1.2v10h-8.7V2.7Zm0 10.1H21v10l-8.7-1.5v-8.5Z"/>
                  </svg>
                  Windows
                </span>
              </div>

              <h2 className="font-display text-4xl sm:text-5xl text-white leading-[1.05]">
                Rephrase anything to sound human.{" "}
                In under 2 seconds.
              </h2>

              <p className="font-sans text-white/55 text-base leading-7">
                Select any text in your draft, a cold email, a LinkedIn DM, a post.
                Pick a tone. huumanity rewrites it so it sounds like a real person wrote it.
              </p>

              <div>
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-[#fff700] px-7 py-3 text-sm font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
                >
                  Try it free
                </Link>
              </div>
            </div>

            {/* ── RIGHT COLUMN — animation ── */}
            <div
              ref={rightColumnRef}
              className="relative flex flex-col gap-4 p-6 sm:p-10 min-h-[540px]"
              style={{ paddingTop: "84px" }}
            >

              {/* macOS cursor — position controlled by cursorPos, visibility by cursorVisible */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  // pos 0 = in email body; pos 1-3 = at tone picker (34px from column top)
                  top: cursorPos === 0 ? "58%" : "34px",
                  left: (["8%", btnLefts.u, btnLefts.c, btnLefts.e] as string[])[Math.min(cursorPos, 3)] ?? "8%",
                  opacity: cursorVisible ? 1 : 0,
                  transform: cursorExiting ? "translateX(30px)" : "translateX(0)",
                  // Position animates smoothly while visible; only fade in/out at start and end
                  transition: "top 1.0s cubic-bezier(0.33,1,0.68,1), left 0.75s cubic-bezier(0.33,1,0.68,1), opacity 0.4s ease, transform 0.55s ease-in",
                  pointerEvents: "none",
                  zIndex: 30,
                }}
              >
                {/* Classic macOS arrow cursor: white outline + black fill */}
                <svg width="16" height="22" viewBox="0 0 22 30" fill="none">
                  {/* Soft drop shadow */}
                  <path
                    d="M3 2L3 25L9 19.5L13.5 29L17.5 27.5L13 18L21 18L3 2Z"
                    fill="rgba(0,0,0,0.22)"
                    transform="translate(1.5,1.5)"
                  />
                  {/* White outer border (stroke paints outside the black fill) */}
                  <path
                    d="M3 2L3 25L9 19.5L13.5 29L17.5 27.5L13 18L21 18L3 2Z"
                    fill="white"
                    stroke="white"
                    strokeWidth="4.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* Black fill on top */}
                  <path
                    d="M3 2L3 25L9 19.5L13.5 29L17.5 27.5L13 18L21 18L3 2Z"
                    fill="black"
                  />
                </svg>
              </div>

              {/* Tone picker — floats above Gmail card, slides in at step 3 */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: "22px",
                  left: "1.5rem",
                  right: "1.5rem",
                  zIndex: 20,
                  pointerEvents: "none",
                  opacity: animStep >= 3 ? 1 : 0,
                  transform: animStep >= 3 ? "translateY(0)" : "translateY(8px)",
                  transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
                }}
              >
                <div className="bg-white rounded-full px-3 py-2 flex items-center gap-1.5 w-fit shadow-lg">
                  {[
                    { label: "Humanize", id: "", step: 99 },
                    { label: "Unpolished", id: "unpolished", step: 4 },
                    { label: "Controversial", id: "controversial", step: 5 },
                    { label: "Direct", id: "", step: 99 },
                  ].map(({ label, id, step }) => (
                    <span
                      key={label}
                      data-btn-id={id || undefined}
                      className={`font-sans text-xs font-semibold whitespace-nowrap px-2.5 py-0.5 rounded-full transition-all duration-300 ${
                        animStep >= step ? "bg-[#fff700] text-black" : "text-neutral-500"
                      }`}
                    >
                      {label}
                    </span>
                  ))}
                  <span
                    data-btn-id="enter"
                    className={`ml-1 w-7 h-7 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors duration-300 ${
                      arrowFlash
                        ? "bg-[#fff700] border-[#fff700] text-black"
                        : "border-neutral-300 text-neutral-400"
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </span>
                </div>
              </div>

              {/* Gmail-format email card */}
              <div className="bg-white rounded-2xl overflow-hidden">
                {/* Gmail header */}
                <div className="flex items-center px-4 py-3">
                  <span
                    aria-label="Gmail"
                    className="font-black text-xl leading-none select-none"
                    style={{
                      background: "linear-gradient(135deg, #EA4335 0%, #FBBC04 45%, #34A853 72%, #4285F4 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    M
                  </span>
                </div>
                <div className="h-px bg-neutral-200" />
                {/* Email body */}
                <div className="px-4 py-4 whitespace-pre-wrap min-h-[180px]">
                  <span
                    className={`font-sans text-[12px] leading-[1.75] ${
                      animStep >= 2 ? "huu-selecting" : "text-neutral-800"
                    }`}
                  >
                    {`Hi Dimitri!\n\nWe haven't met but I'm reaching out to you because it's always great to network with other executives. I'm Andrea from Acme company, a Meta ads agency for discerning and successful professionals across Asia.\n\nIf you are looking to get 10 extra booked calls in your calendar, I'd like to introduce myself and connect with you, to see if you can benefit from our professional ads expertise.`}
                  </span>
                </div>
              </div>

              {/* Result card — slides in at step 6, offset right like a Grammarly popup */}
              <div
                className="bg-white rounded-2xl p-4 border-2 border-[#fff700] shadow-[0_4px_20px_rgba(255,247,0,0.18)]"
                style={{
                  marginLeft: "1rem",
                  opacity: animStep >= 6 ? 1 : 0,
                  transform: animStep >= 6 ? "translateY(0)" : "translateY(14px)",
                  transition: "opacity 0.7s ease-out, transform 0.7s ease-out",
                }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#fff700]" aria-hidden="true" />
                  <span className="font-sans text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
                    Rewritten by huu
                  </span>
                </div>
                <p className="font-sans text-[12px] leading-[1.75] text-neutral-800 whitespace-pre-line">
                  {`Dimitri, we haven't met but I'm gonna skip the networking bullshit and just say it.\n\nI'm Andrea from Acme. We run Meta ads for people across Asia who actually know what they're doing. If your calendar isn't full, that's a problem we fix. 10 extra booked calls, not leads that ghost you, actual calls with people who show up.`}
                </p>
                <div
                  className="flex gap-2 mt-3"
                  style={{
                    opacity: animStep >= 7 ? 1 : 0,
                    transition: "opacity 0.5s ease-out",
                  }}
                >
                  <button className="bg-neutral-100 text-black font-sans text-xs font-semibold rounded-full px-4 py-1.5">Back</button>
                  <button className="bg-neutral-100 text-black font-sans text-xs font-semibold rounded-full px-4 py-1.5">Copy</button>
                  <button className="bg-[#fff700] text-black font-sans text-xs font-bold rounded-full px-4 py-1.5 border border-black">Accept</button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* 3. WEB DEMO (white) — main selling point */}
      <section
        id="demo"
        ref={demoSectionRef}
        className="relative bg-white px-6 pt-6 pb-10 sm:pt-8 sm:pb-12"
      >
        {/* Headline block — wider container so text stays on one line on desktop */}
        <div className="max-w-5xl mx-auto text-center mb-20">
          <h2
            className="font-display text-black leading-[1.02] tracking-tight mb-5 md:whitespace-nowrap"
            style={{ fontSize: "clamp(2rem, 4.8vw, 3.75rem)" }}
          >
            People know it&apos;s written by AI
          </h2>
          <p className="font-sans text-neutral-500 text-base sm:text-lg leading-7 max-w-xl mx-auto mb-10">
            huumanity turns your AI copy into writing that sounds like you.
            Select any text, pick a tone, and accept.
          </p>
          <div className="flex justify-center">
            <Link
              href="/download"
              className="inline-flex items-center gap-2.5 rounded-xl border-2 border-black bg-[#fff700] px-7 py-3.5 text-sm font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
            >
              <svg width="13" height="16" viewBox="0 0 18 22" fill="currentColor" aria-hidden="true">
                <path d="M14.7 11.6c0-2.7 2.2-4 2.3-4.1-1.3-1.8-3.2-2.1-3.8-2.1-1.6-.2-3.1.9-3.9.9s-2-.9-3.3-.9C4.3 5.4 2.7 6.4 1.8 8c-1.9 3.2-.5 8 1.3 10.6.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.8 3.4-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-3.1-1.2-3.1-4ZM12.1 3.7c.7-.9 1.2-2 1.1-3.2-1.1 0-2.3.7-3.1 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3.1-1.5Z"/>
              </svg>
              Download for macOS
            </Link>
          </div>
        </div>

        <div className="max-w-3xl mx-auto">

          {/* Yellow tab bar + Paste yours button */}
          <div className="flex items-center justify-center gap-10 mb-6 flex-wrap">
            <div className="inline-flex items-center gap-2 p-1.5 rounded-2xl bg-[#fff700] shadow-[0_4px_0_rgba(0,0,0,0.08)]">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setIsCustomMode(false); }}
                  className={`px-6 py-2.5 text-base sm:text-lg font-bold rounded-xl transition-colors ${
                    activeTab === tab && !isCustomMode
                      ? "bg-black text-[#fff700]"
                      : "text-black hover:bg-black/5"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <button
              onClick={handleCustomModeToggle}
              style={{
                transform: isCustomMode ? "rotate(-9deg) translateY(-2px)" : "rotate(0deg) translateY(0)",
                boxShadow: isCustomMode ? "4px 4px 0 rgba(0,0,0,0.85)" : "0 4px 0 rgba(0,0,0,0.08)",
                transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease",
              }}
              className="px-6 py-2.5 text-base sm:text-lg font-bold rounded-xl bg-[#fff700] border-2 border-black text-black"
            > 
              Paste yours
            </button>
          </div>

          {/* Bold one-line tutorial */}
          <p className="text-center font-display text-lg sm:text-xl text-black mb-2">
            Select any text below and choose a style.
          </p>
          <p className="text-center text-sm text-neutral-500 mb-8">
            Just like the example illustration further down ↓
          </p>

          {/* Editable demo box */}
          <div className="relative rounded-3xl bg-white border-2 border-black shadow-[0_8px_0_rgba(0,0,0,0.08)]">
            <div className="absolute top-4 left-5 flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-black/10" />
              <span className="w-2.5 h-2.5 rounded-full bg-black/10" />
              <span className="w-2.5 h-2.5 rounded-full bg-black/10" />
            </div>
            <div
              key={activeTab}
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              className="min-h-[380px] p-8 pt-12 sm:p-10 sm:pt-12 text-[15px] sm:text-base leading-7 text-neutral-700 whitespace-pre-wrap focus:outline-none font-sans"
              style={{ caretColor: BRAND }}
            >
              {SAMPLES[activeTab]}
            </div>
          </div>

          {anchor && !expanded && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                openPopup();
              }}
              className="absolute z-20 w-9 h-9 rounded-full bg-[#fff700] hover:brightness-95 border-2 border-black shadow-md flex items-center justify-center text-black transition"
              style={{ top: anchor.tabTop, left: anchor.tabLeft }}
              aria-label="Open rephrase options"
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
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          )}

          {anchor && expanded && (
            <div
              ref={popupRef}
              className="absolute z-20"
              style={{
                top: anchor.popupTop,
                left: anchor.popupLeft,
                width: anchor.popupWidth,
                transform: "translateY(calc(-100% - 12px))",
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="relative bg-white rounded-2xl border-2 border-[#fff700] shadow-xl overflow-hidden transition-all">
                {/* STAGE: LIMIT — Grammarly-style "out of rewrites" header bar */}
                {popupStage === "limit" && (
                  <div className="bg-black text-white px-5 py-3 flex items-center justify-between gap-4">
                    <span className="text-[12px] sm:text-[13px] font-semibold flex items-center gap-2 min-w-0">
                      <span className="text-[#fff700] shrink-0">✦</span>
                      <span className="truncate">
                        You&rsquo;re out of free rewrites for today
                      </span>
                    </span>
                    <a
                      href="/download"
                      className="shrink-0 px-3.5 py-1.5 text-[11px] font-bold text-black bg-[#fff700] rounded-full hover:brightness-95 transition whitespace-nowrap"
                    >
                      Download the app
                    </a>
                  </div>
                )}

                {/* X close button — visible only in the result stage */}
                {popupStage === "result" && (
                  <button
                    onClick={closePopup}
                    aria-label="Close"
                    className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 hover:text-black hover:bg-neutral-100 transition z-10"
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
                )}

                <div className="p-5">
                  {/* STAGE: SELECT */}
                  {popupStage === "select" && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {TONES.map((tone) => {
                          const isOn = selectedTones.includes(tone);
                          return (
                            <button
                              key={tone}
                              onClick={() => toggleTone(tone)}
                              className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-full whitespace-nowrap transition-colors ${
                                isOn
                                  ? "bg-[#fff700] text-black ring-2 ring-black"
                                  : "bg-neutral-100 text-black hover:bg-neutral-200"
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
                        aria-label="Generate"
                        className="shrink-0 w-8 h-8 rounded-full border-2 border-[#fff700] flex items-center justify-center text-black hover:bg-[#fff700] transition disabled:opacity-40 disabled:cursor-not-allowed"
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

                  {/* STAGE: LOADING (Grammarly-style skeleton with wave shimmer) */}
                  {popupStage === "loading" && (
                    <div className="space-y-2.5 py-1">
                      <div className="h-2.5 rounded-full huu-shimmer w-full" />
                      <div className="h-2.5 rounded-full huu-shimmer w-11/12" />
                      <div className="h-2.5 rounded-full huu-shimmer w-4/5" />
                      <div className="h-2.5 rounded-full huu-shimmer w-3/4" />
                      <p className="text-[11px] text-neutral-500 mt-3 text-center">
                        Rewriting…
                      </p>
                    </div>
                  )}

                  {/* STAGE: RESULT */}
                  {popupStage === "result" && (
                    <>
                      <p className="pr-6 text-[13px] sm:text-sm text-neutral-800 leading-6 mb-4 whitespace-pre-wrap">
                        {resultText}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={handleBack}
                          className="flex items-center gap-1 px-3.5 py-1.5 text-[11px] font-semibold rounded-full border-2 border-[#fff700] text-black hover:bg-[#fff700]/30 transition-colors"
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
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-full bg-neutral-100 text-black hover:bg-neutral-200 transition-colors"
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
                                  width="12"
                                  height="12"
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
                          <button
                            onClick={handleAccept}
                            className="px-3 py-1.5 text-[11px] font-bold rounded-full bg-[#fff700] text-black hover:brightness-95 transition border-2 border-black"
                          >
                            Accept
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* STAGE: LIMIT — disabled tone buttons (no enter button) */}
                  {popupStage === "limit" && (
                    <div className="flex flex-wrap items-center gap-2">
                      {TONES.map((tone) => (
                        <button
                          key={tone}
                          disabled
                          className="px-3.5 py-1.5 text-[12px] font-semibold rounded-full whitespace-nowrap bg-neutral-100 text-neutral-400 cursor-not-allowed"
                        >
                          {tone}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </section>

      {/* 4. USE CASES (black) */}
      <section id="use-cases" className="bg-black text-white px-6 py-24 sm:py-32">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">

            {/* LEFT: Headline + description + tags */}
            <div>
              <h2 className="font-display text-5xl sm:text-6xl lg:text-[4.5rem] leading-[1.0] tracking-tight">
                Write for every room
              </h2>
              <p className="text-neutral-400 text-base sm:text-lg mt-6 leading-7 max-w-md">
                One tool for 4 ways to sound human. Whether you&apos;re closing a deal,
                building an audience, recording yourself, or fixing text you stumbled on.
                huumanity handles it.
              </p>
              <div className="flex flex-wrap gap-2 mt-10">
                {USE_CASES.map((uc) => (
                  <button
                    key={uc.id}
                    onClick={() => setActiveUseCase(uc)}
                    className={`px-5 py-2.5 text-sm font-bold rounded-full border-2 transition-all duration-200 ${
                      activeUseCase.id === uc.id
                        ? "bg-[#fff700] text-black border-[#fff700]"
                        : "bg-transparent text-white border-white/20 hover:border-white/60"
                    }`}
                  >
                    {uc.label}
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT: Active use case content */}
            <div className="lg:pt-3">
              <h3 className="font-display text-3xl sm:text-4xl leading-[1.1] mb-5">
                {activeUseCase.title}
              </h3>
              <p className="text-neutral-300 text-base sm:text-lg leading-[1.75]">
                {activeUseCase.blurb}
              </p>
              <div className="flex gap-3 mt-8 flex-wrap">
                <Link
                  href="/download"
                  className="inline-flex items-center gap-2.5 rounded-xl border-2 border-white bg-white px-6 py-3 text-sm font-black text-black transition hover:brightness-95"
                >
                  <svg width="13" height="16" viewBox="0 0 18 22" fill="currentColor" aria-hidden="true">
                    <path d="M14.7 11.6c0-2.7 2.2-4 2.3-4.1-1.3-1.8-3.2-2.1-3.8-2.1-1.6-.2-3.1.9-3.9.9s-2-.9-3.3-.9C4.3 5.4 2.7 6.4 1.8 8c-1.9 3.2-.5 8 1.3 10.6.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.8 3.4-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-3.1-1.2-3.1-4ZM12.1 3.7c.7-.9 1.2-2 1.1-3.2-1.1 0-2.3.7-3.1 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3.1-1.5Z"/>
                  </svg>
                  Download for macOS
                </Link>
                <a
                  href="#pricing"
                  className="inline-flex items-center px-6 py-3 text-sm font-semibold text-white border-2 border-white/20 rounded-xl hover:border-white/50 transition"
                >
                  See pricing →
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 5. FEATURE: Rephrase anything (white) */}
      <section ref={featSectionRef} className="bg-white px-6 py-24 sm:py-32">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* LEFT: Animated Instagram post visualization */}
          <div
            ref={featVizRef}
            className="relative rounded-2xl bg-black overflow-hidden flex flex-col"
            style={{ minHeight: "680px" }}
          >
            {/* Cursor — starts over white caption box (pos 0), moves UP to tone bar (pos 1-3) */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: featCursorPos === 0 ? "80%" : featBtnLefts.top,
                left: ([
                  "30%",
                  featBtnLefts.h,
                  featBtnLefts.u,
                  featBtnLefts.e,
                ] as string[])[Math.min(featCursorPos, 3)] ?? "30%",
                opacity: featCursorVisible ? 1 : 0,
                transform: featCursorExiting ? "translateX(30px)" : "translateX(0)",
                transition: "top 1.0s cubic-bezier(0.33,1,0.68,1), left 0.75s cubic-bezier(0.33,1,0.68,1), opacity 0.4s ease, transform 0.55s ease-in",
                pointerEvents: "none",
                zIndex: 30,
              }}
            >
              <svg width="16" height="22" viewBox="0 0 22 30" fill="none">
                <path d="M3 2L3 25L9 19.5L13.5 29L17.5 27.5L13 18L21 18L3 2Z" fill="rgba(0,0,0,0.22)" transform="translate(1.5,1.5)"/>
                <path d="M3 2L3 25L9 19.5L13.5 29L17.5 27.5L13 18L21 18L3 2Z" fill="white" stroke="white" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round"/>
                <path d="M3 2L3 25L9 19.5L13.5 29L17.5 27.5L13 18L21 18L3 2Z" fill="black"/>
              </svg>
            </div>

            {/* ── TOP: result text on dark (no card) — fills available space ── */}
            <div className="flex-1 px-8 pt-10 min-h-[180px]">
              {featAnimStep === 6 && (
                <div className="space-y-2.5 pt-1">
                  {[1, 0.8, 1, 0.65, 0.9].map((w, i) => (
                    <div
                      key={i}
                      className="h-2 rounded-full"
                      style={{
                        width: `${w * 100}%`,
                        backgroundColor: "#2a2a2a",
                        backgroundImage: "linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.09) 50%,transparent 100%)",
                        backgroundSize: "200% 100%",
                        animation: `huu-shimmer 1.5s ease-in-out infinite ${i * 0.07}s`,
                      }}
                    />
                  ))}
                </div>
              )}
              {featAnimStep >= 7 && (
                <div className="space-y-2.5">
                  <p className="text-white text-[15px] font-semibold leading-[1.35]">real talk most dropshipping stores dont fail bc of bad ads</p>
                  <p className="text-white text-[15px] font-semibold leading-[1.35]">they fail bc they have no clue how to find products that actually sell</p>
                  <p className="text-white text-[15px] font-semibold leading-[1.35]">im in china rn and ive been talking to suppliers, manufacturers, ppl who are actually moving volume. and got all the info on whats working</p>
                  <p className="text-white text-[15px] font-semibold leading-[1.35]">this weekend im doing a free mastermind on how to find winning products before everyone else catches on</p>
                  <p className="text-white text-[15px] font-semibold leading-[1.35]">comment &ldquo;FREE&rdquo; and i'll send u the invite</p>
                </div>
              )}
            </div>

            {/* ── TONE BAR — always in DOM for cursor position computation; appears above white box ── */}
            <div
              className="px-8 pt-5 pb-3 transition-opacity duration-300"
              style={{ opacity: featAnimStep >= 3 ? 1 : 0 }}
            >
              <div className="inline-flex items-center gap-1 bg-white rounded-full px-3 py-2">
                {[
                  { label: "Humanize",     id: "humanize",     step: 4  },
                  { label: "Unpolished",   id: "unpolished",   step: 5  },
                  { label: "Controversial",id: "",             step: 99 },
                  { label: "Direct",       id: "",             step: 99 },
                ].map(({ label, id, step }) => (
                  <span
                    key={label}
                    data-feat-btn-id={id || undefined}
                    className={`font-sans text-xs font-semibold whitespace-nowrap px-2.5 py-1 rounded-full transition-all duration-300 ${
                      featAnimStep >= step ? "bg-[#fff700] text-black" : "text-neutral-500"
                    }`}
                  >
                    {label}
                  </span>
                ))}
                <span
                  data-feat-btn-id="enter"
                  className={`ml-0.5 w-7 h-7 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors duration-300 ${
                    featArrowFlash
                      ? "bg-[#fff700] border-[#fff700] text-black"
                      : "border-neutral-300 text-neutral-400"
                  }`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </span>
              </div>
            </div>

            {/* ── WHITE INSTAGRAM CAPTION BOX at bottom ── */}
            <div className="mx-6 mb-6 rounded-2xl bg-white overflow-hidden">
              <div className="px-6 pt-6 pb-4 space-y-3">
                {featAnimStep < 2 ? (
                  <>
                    <p className="text-[15px] font-semibold leading-[1.35] text-neutral-800">Most dropshipping stores don&apos;t fail because of ads.</p>
                    <p className="text-[15px] font-semibold leading-[1.35] text-neutral-800">They fail because they don&apos;t know how to find winning products.</p>
                    <p className="text-[15px] font-semibold leading-[1.35] text-neutral-800">I&apos;m visiting China 🇨🇳 and got all the inside info from suppliers, manufacturers, and top sellers.</p>
                    <p className="text-[15px] font-semibold leading-[1.35] text-neutral-800">This weekend, I&apos;m hosting a FREE mastermind exposing the winning products and how to find them before they blow up.</p>
                    <p className="text-[15px] font-semibold leading-[1.35] text-neutral-800">Comment &ldquo;FREE&rdquo; and I&apos;ll send you an invite</p>
                  </>
                ) : (
                  <>
                    <p className="text-[15px] font-semibold leading-[1.35]"><span className="huu-selecting">Most dropshipping stores don&apos;t fail because of ads.</span></p>
                    <p className="text-[15px] font-semibold leading-[1.35]"><span className="huu-selecting">They fail because they don&apos;t know how to find winning products.</span></p>
                    <p className="text-[15px] font-semibold leading-[1.35]"><span className="huu-selecting">I&apos;m visiting China 🇨🇳 and got all the inside info from suppliers, manufacturers, and top sellers.</span></p>
                    <p className="text-[15px] font-semibold leading-[1.35]"><span className="huu-selecting">This weekend, I&apos;m hosting a FREE mastermind exposing the winning products and how to find them before they blow up.</span></p>
                    <p className="text-[15px] font-semibold leading-[1.35]"><span className="huu-selecting">Comment &ldquo;FREE&rdquo; and I&apos;ll send you an invite</span></p>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between px-6 py-3 border-t border-neutral-100">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
                  <line x1="9" y1="9" x2="9.01" y2="9"/>
                  <line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
                <span className="text-neutral-400 text-xs">376/2,200</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Copy */}
          <div className="flex flex-col gap-6">
            <h2 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight text-black">
              Rephrase anything without leaving your work
            </h2>
            <p className="font-sans text-neutral-500 text-base sm:text-lg leading-7">
              Stop copying text into ChatGPT to fix it. Select whatever you want to change; a sentence, a paragraph, a whole email. And huumanity rewrites it right where it sits without switching tabs.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-white px-6 py-3.5 text-sm font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
              >
                Try free
              </Link>
              <Link
                href="/download"
                className="inline-flex items-center gap-2.5 rounded-xl border-2 border-black bg-[#fff700] px-6 py-3.5 text-sm font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
              >
                <svg width="13" height="16" viewBox="0 0 18 22" fill="currentColor" aria-hidden="true">
                  <path d="M14.7 11.6c0-2.7 2.2-4 2.3-4.1-1.3-1.8-3.2-2.1-3.8-2.1-1.6-.2-3.1.9-3.9.9s-2-.9-3.3-.9C4.3 5.4 2.7 6.4 1.8 8c-1.9 3.2-.5 8 1.3 10.6.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.8 3.4-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-3.1-1.2-3.1-4ZM12.1 3.7c.7-.9 1.2-2 1.1-3.2-1.1 0-2.3.7-3.1 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3.1-1.5Z"/>
                </svg>
                Download for macOS
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* TONE BLOCKS */}

      {/* Humanize */}
      <section className="bg-white px-6 py-24 sm:py-32 border-t border-neutral-100">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* LEFT: card */}
          <div className="rounded-2xl bg-neutral-950 overflow-hidden p-8 space-y-4">
            <p className="text-[11px] uppercase tracking-widest text-neutral-500 font-semibold">Before</p>
            <p className="text-neutral-400 text-[13px] leading-[1.7]">
              I am pleased to inform you that following extensive deliberation, our team has successfully executed the strategic initiative and is now well-positioned to leverage synergies going forward.
            </p>
            <div className="border-t border-white/10 pt-4">
              <p className="text-[11px] uppercase tracking-widest text-[#fff700] font-semibold mb-3">Humanize</p>
              <p className="text-white text-[13px] leading-[1.7] font-medium">
                After a lot of back-and-forth, we finally got it done. Here&apos;s where we&apos;re at and what&apos;s coming next.
              </p>
            </div>
          </div>
          {/* RIGHT: copy */}
          <div className="flex flex-col gap-5">
            <span className="inline-flex w-fit px-3 py-1 rounded-full bg-neutral-100 text-xs font-bold text-neutral-600 uppercase tracking-widest">Tone</span>
            <h2 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight text-black">Humanize</h2>
            <p className="text-neutral-500 text-base sm:text-lg leading-7">
              For when your text sounds like a press release wrote itself. Humanize strips the corporate gloss and rewrites it in plain, natural language that sounds like an actual person wrote it. The AI smell? Gone.
            </p>
            <p className="text-sm text-neutral-400 font-medium">Best for: emails, LinkedIn posts, bios, product copy.</p>
          </div>
        </div>
      </section>

      {/* Unpolished */}
      <section className="bg-neutral-950 px-6 py-24 sm:py-32">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* LEFT: copy */}
          <div className="flex flex-col gap-5">
            <span className="inline-flex w-fit px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-neutral-400 uppercase tracking-widest">Tone</span>
            <h2 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight text-white">Unpolished</h2>
            <p className="text-neutral-400 text-base sm:text-lg leading-7">
              Less grammar, more voice. Like a text message or a quick voice note — the kind of writing that builds trust because it doesn&apos;t try too hard. Raw and real wins every time over polished and forgettable.
            </p>
            <p className="text-sm text-neutral-600 font-medium">Best for: DMs, casual outreach, X threads, Discord messages.</p>
          </div>
          {/* RIGHT: card */}
          <div className="rounded-2xl bg-black border border-white/10 overflow-hidden p-8 space-y-4">
            <p className="text-[11px] uppercase tracking-widest text-neutral-500 font-semibold">Before</p>
            <p className="text-neutral-400 text-[13px] leading-[1.7]">
              I wanted to follow up to see if you had a chance to review the proposal I sent over last week. Please let me know if you have any questions.
            </p>
            <div className="border-t border-white/10 pt-4">
              <p className="text-[11px] uppercase tracking-widest text-[#fff700] font-semibold mb-3">Unpolished</p>
              <p className="text-white text-[13px] leading-[1.7] font-medium">
                hey — did you get a chance to look at that? lmk if you have questions
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Controversial */}
      <section className="bg-white px-6 py-24 sm:py-32 border-t border-neutral-100">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* LEFT: card */}
          <div className="rounded-2xl bg-neutral-950 overflow-hidden p-8 space-y-4">
            <p className="text-[11px] uppercase tracking-widest text-neutral-500 font-semibold">Before</p>
            <p className="text-neutral-400 text-[13px] leading-[1.7]">
              I think AI is going to significantly change the way we work over the coming years and presents interesting opportunities for professionals who adapt.
            </p>
            <div className="border-t border-white/10 pt-4">
              <p className="text-[11px] uppercase tracking-widest text-[#fff700] font-semibold mb-3">Controversial</p>
              <p className="text-white text-[13px] leading-[1.7] font-medium">
                Most people at your company will be replaceable by AI in 3 years. The ones who won&apos;t be are already adapting. Are you one of them?
              </p>
            </div>
          </div>
          {/* RIGHT: copy */}
          <div className="flex flex-col gap-5">
            <span className="inline-flex w-fit px-3 py-1 rounded-full bg-neutral-100 text-xs font-bold text-neutral-600 uppercase tracking-widest">Tone</span>
            <h2 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight text-black">Controversial</h2>
            <p className="text-neutral-500 text-base sm:text-lg leading-7">
              For when you want to stop the scroll. Controversial takes a strong stance, flips the conventional take, or says the thing most people are thinking but won&apos;t say out loud. Built for posts and threads that spark real conversation — not polite applause.
            </p>
            <p className="text-sm text-neutral-400 font-medium">Best for: X threads, LinkedIn posts, YouTube hooks, newsletters.</p>
          </div>
        </div>
      </section>

      {/* Direct */}
      <section className="bg-neutral-950 px-6 py-24 sm:py-32">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* LEFT: copy */}
          <div className="flex flex-col gap-5">
            <span className="inline-flex w-fit px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-neutral-400 uppercase tracking-widest">Tone</span>
            <h2 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight text-white">Direct</h2>
            <p className="text-neutral-400 text-base sm:text-lg leading-7">
              No fluff. No setup. No &ldquo;I hope this finds you well.&rdquo; Direct gets straight to the point in as few words as possible. The tone for cold outreach, follow-ups, and any time someone&apos;s attention is precious.
            </p>
            <p className="text-sm text-neutral-600 font-medium">Best for: cold emails, follow-ups, Slack messages, pitches.</p>
          </div>
          {/* RIGHT: card */}
          <div className="rounded-2xl bg-black border border-white/10 overflow-hidden p-8 space-y-4">
            <p className="text-[11px] uppercase tracking-widest text-neutral-500 font-semibold">Before</p>
            <p className="text-neutral-400 text-[13px] leading-[1.7]">
              I hope this message finds you well. I wanted to reach out because I believe there might be some interesting synergies between our companies that could be worth exploring together.
            </p>
            <div className="border-t border-white/10 pt-4">
              <p className="text-[11px] uppercase tracking-widest text-[#fff700] font-semibold mb-3">Direct</p>
              <p className="text-white text-[13px] leading-[1.7] font-medium">
                We help companies like yours cut reply time by 40%. Worth 15 minutes this week?
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. PRICING (black) */}
      <section id="pricing" className="bg-black text-white px-6 py-24 sm:py-32">
        <div className="max-w-4xl mx-auto">
          {/* Headline + description */}
          <h2 className="font-display text-4xl sm:text-5xl md:text-6xl text-center leading-[1.05] max-w-3xl mx-auto">
            Simple Pricing
          </h2>
          <p className="text-neutral-400 text-base sm:text-lg mt-5 max-w-sm mx-auto text-center leading-7">
            Download the app and start free with 5 rewrites a day.
            No credit card required.
          </p>

          {/* Monthly / Annual toggle */}
          <div className="flex justify-center mt-10">
            <div className="inline-flex items-center p-1.5 rounded-2xl bg-neutral-900 border border-white/10">
              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-200 ${
                  billingPeriod === "monthly"
                    ? "bg-[#fff700] text-black shadow-sm"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod("annual")}
                className={`px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-200 ${
                  billingPeriod === "annual"
                    ? "bg-[#fff700] text-black shadow-sm"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Annual&nbsp;&nbsp;<span className={`text-xs font-bold ${billingPeriod === "annual" ? "text-black/70" : "text-[#fff700]"}`}>20% off</span>
              </button>
            </div>
          </div>

          {/* Pricing cards — 2 tiers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-12 max-w-2xl mx-auto">
            {PRICING.map((tier) => {
              const price = billingPeriod === "annual" ? tier.annualPrice : tier.monthlyPrice;
              return (
                <div
                  key={tier.name}
                  className={`rounded-3xl p-8 flex flex-col ${
                    tier.accent
                      ? "bg-[#fff700] text-black"
                      : "bg-transparent text-white border-2 border-white/15"
                  }`}
                >
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-display text-2xl">{tier.name}</h3>
                    {tier.accent && (
                      <span className="text-[10px] uppercase tracking-widest bg-black text-[#fff700] px-2.5 py-1 rounded-full font-bold">
                        Popular
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline mb-7">
                    <span className="font-display text-5xl tracking-tight">{price}</span>
                    {price !== "$0" && (
                      <span className={`ml-1.5 text-sm ${tier.accent ? "text-black/60" : "text-neutral-400"}`}>
                        {tier.cadence}
                        {billingPeriod === "annual" && (
                          <span className={`ml-1.5 text-xs font-semibold ${tier.accent ? "text-black/50" : "text-neutral-500"}`}>
                            billed annually
                          </span>
                        )}
                      </span>
                    )}
                    {price === "$0" && (
                      <span className={`ml-1.5 text-sm ${tier.accent ? "text-black/60" : "text-neutral-400"}`}>/forever</span>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {tier.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-sm leading-[1.5]">
                        <svg
                          className={`mt-0.5 shrink-0 ${tier.accent ? "text-black" : "text-[#fff700]"}`}
                          width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/download"
                    className={`block text-center px-4 py-3 text-sm font-bold rounded-full transition-colors ${
                      tier.accent
                        ? "bg-black text-[#fff700] hover:brightness-110"
                        : "bg-[#fff700] text-black hover:brightness-95"
                    }`}
                  >
                    {tier.cta}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 8. FINAL CTA (yellow) */}
      <section className="bg-[#fff700] px-6 py-24 sm:py-32 border-y-2 border-black">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-5xl sm:text-6xl md:text-7xl text-black leading-[1.02]">
            Start sounding human.
          </h2>
          <p className="text-black/80 text-base sm:text-lg mt-6 mb-10 max-w-md mx-auto">
            5 free rewrites. No card.
          </p>
          <Link
            href="/sign-up"
            className="inline-block px-8 py-3 text-sm font-bold text-[#fff700] bg-black rounded-full hover:bg-neutral-900 transition-colors"
          >
            Try it free
          </Link>
        </div>
      </section>

      {/* 9. FOOTER (black) */}
      <footer className="bg-black text-white">
        <div className="w-full max-w-6xl mx-auto px-6 py-14 grid grid-cols-2 sm:grid-cols-5 gap-8">
          <div className="col-span-2 sm:col-span-1">
            <span className="font-display text-3xl text-[#fff700]">huu</span>
            <p className="text-sm text-neutral-400 mt-3 max-w-[14rem]">
              Make your AI copy sound like you wrote it.
            </p>
          </div>

          {FOOTER_LINKS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs uppercase tracking-widest text-neutral-500 mb-3 font-bold">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-neutral-300 hover:text-[#fff700] transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10">
          <div className="w-full max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs text-neutral-500">
              © {new Date().getFullYear()} huu. All rights reserved.
            </p>
            <p className="text-xs text-neutral-500">
              Built for people who don&apos;t want to sound like a robot.
            </p>
          </div>
        </div>

        <div className="overflow-hidden">
          <div
            className="font-display text-center text-[#fff700] leading-none select-none pointer-events-none px-4 pb-2"
            style={{ fontSize: "clamp(8rem, 24vw, 20rem)" }}
          >
            huu
          </div>
        </div>
      </footer>
    </div>
  );
}
