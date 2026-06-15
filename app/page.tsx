"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isRephrashable } from "./lib/isRephrashable";
import { HuuLogo } from "./components/HuuLogo";

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

// 3-step tutorial visualization — the Twitter post being rewritten.
const TUT_ORIGINAL =
  "AI content is flooding every platform. Authenticity is now the key differentiator. Leverage human creativity to craft narratives that truly resonate.";
const TUT_REWRITTEN =
  "every platform is drowning in AI slop rn and honestly the only thing that actually cuts through is real human creativity, like stuff that actually sounds like a person wrote it bc they meant it";

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
      "Highlight any text you see on your screen. Doesn't matter where it is: a webpage, a doc, a form. Pick a tone and huumanity rewrites it right there for you to clipboard it.",
  },
  {
    id: "outreach",
    label: "Outreach",
    title: "huu for Outreach",
    blurb:
      "Whether it be for cold emails, DMs, or follow-ups. Your prospects can smell a ChatGPT template from the subject line. huumanity rewrites your draft so it sounds like it was written by an actual human with emotions, and that you actually gave a damn before hitting send.",
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
      "Audiences can still hear that your script is written by AI. Doesn't matter if it's for a whole YouTube video or short-form content. Reading AI-written scripts out loud is painful for everyone in the room. huumanity rewrites them so the words actually sound like yours.",
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
      "10 rewrites per day",
      "All 4 tones",
      "App that works everywhere. Any app, any text field on your computer",
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

function DownloadCtaContent({
  platform,
  waitlist,
}: {
  platform: DownloadPlatform;
  waitlist?: boolean;
}) {
  if (waitlist) {
    return <span>Join the Waitlist</span>;
  }
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
const ANON_LIMIT = 7;
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

// ---------- Scroll-scrub helper ----------

/**
 * Drives an animation timeline from scroll position instead of timers.
 *
 * `apply` is called with a virtual time T in [0, duration] derived from how
 * far `el` has been scrolled into view: T=0 when the element's top enters the
 * bottom of the viewport, T=duration once the element's midpoint crosses the
 * viewport's midpoint ("halfway past the section"). Scrolling back up runs
 * the same timeline in reverse — the animation un-plays itself.
 *
 * The raw progress is eased toward its target with a small per-frame lerp
 * (requestAnimationFrame) so fast scroll flicks still play out smoothly
 * instead of jumping straight to the end state.
 */
function attachScrollScrub(
  el: HTMLElement,
  duration: number,
  apply: (t: number) => void,
  gain = 1
): () => void {
  let target = 0;
  let current = -1; // forces the first apply
  let raf = 0;
  let running = false;

  const computeTarget = () => {
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const total = vh / 2 + rect.height / 2;
    if (total <= 0) return 0;
    // `gain` > 1 makes the timeline reach 1 before the element hits the dead
    // center of the viewport, then hold complete — useful when the animation
    // should be fully played "by the halfway point" rather than exactly at it.
    return Math.min(1, Math.max(0, ((vh - rect.top) / total) * gain));
  };

  const tick = () => {
    const next = current < 0 ? target : current + (target - current) * 0.2;
    current = Math.abs(target - next) < 0.0005 ? target : next;
    apply(current * duration);
    if (current !== target) {
      raf = requestAnimationFrame(tick);
    } else {
      running = false;
    }
  };

  const onScroll = () => {
    target = computeTarget();
    if (!running) {
      running = true;
      raf = requestAnimationFrame(tick);
    }
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    cancelAnimationFrame(raf);
  };
}

// ---------- 3-step tutorial: mini tweet card ----------

/**
 * Tiny Twitter-post mockup used by the 3-step "how it works" visualization.
 * `selCount` highlights that many words counting from the END of the text, so
 * the selection can be animated word-by-word like a real cursor drag (rather
 * than flashing on as one solid blue block). `huuButton` pops the little
 * yellow selector button in beside the first words.
 */
function TutTweet({
  text,
  selCount = 0,
  huuButton = false,
}: {
  text: string;
  selCount?: number;
  huuButton?: boolean;
}) {
  const words = text.split(" ");
  const firstSelected = words.length - Math.max(0, Math.min(selCount, words.length));
  return (
    <div className="flex gap-2.5">
      <span className="w-8 h-8 rounded-full bg-neutral-200 shrink-0" aria-hidden="true" />
      <div className="relative min-w-0 flex-1">
        {huuButton && (
          <span
            className="absolute -left-5 top-4 z-10 w-5 h-5 rounded-full bg-[#fff700] border border-black shadow flex items-center justify-center"
            style={{ animation: "huu-btn-fadein 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
            aria-hidden="true"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </span>
        )}
        <p className="text-[11px] leading-tight">
          <span className="font-bold text-black">Alex Johnson</span>{" "}
          <span className="text-neutral-400">@alexjohnson · 2h</span>
        </p>
        {/* Reserved height fits the longest variant (the rewrite), so swapping
            text never changes the card height — keeps all 3 columns aligned. */}
        <p className="mt-1 text-[11px] leading-[1.6] min-h-[4.6rem]">
          {words.map((w, i) => {
            const on = i >= firstSelected;
            return (
              <span
                key={i}
                className={`transition-colors duration-200 ${
                  on ? "bg-[#cfe1ff] text-[#1d4ed8]" : "text-neutral-800"
                }`}
              >
                {w}
                {i < words.length - 1 ? " " : ""}
              </span>
            );
          })}
        </p>
        <div className="mt-2.5 flex items-center gap-5 text-neutral-400">
            <span className="flex items-center gap-1 text-[9px]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              24
            </span>
            <span className="flex items-center gap-1 text-[9px]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              81
            </span>
            <span className="flex items-center gap-1 text-[9px]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              142
            </span>
            <span className="flex items-center text-[9px]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </span>
          </div>
      </div>
    </div>
  );
}

/** The floating tone bar shown in the tutorial (its own little box). */
function ToneBar({
  unpolished = false,
  direct = false,
  enter = false,
}: {
  unpolished?: boolean;
  direct?: boolean;
  enter?: boolean;
}) {
  const tones = [
    { label: "Humanize", on: false },
    { label: "Unpolished", on: unpolished },
    { label: "Controversial", on: false },
    { label: "Direct", on: direct },
  ];
  return (
    <div className="inline-flex items-center gap-1" aria-hidden="true">
      {tones.map(({ label, on }) => (
        <span
          key={label}
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap transition-colors duration-300 ${
            on ? "bg-[#fff700] text-black" : "text-neutral-500"
          }`}
        >
          {label}
        </span>
      ))}
      <span
        className={`ml-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-300 ${
          enter ? "bg-[#fff700] border-[#fff700] text-black" : "border-neutral-300 text-neutral-400"
        }`}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </span>
    </div>
  );
}

/** Mini macOS arrow cursor used by the tutorial; position via `style`. */
function TutCursor({ visible, style }: { visible: boolean; style: CSSProperties }) {
  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transition:
          "left 0.8s cubic-bezier(0.33,1,0.68,1), top 0.8s cubic-bezier(0.33,1,0.68,1), right 0.8s cubic-bezier(0.33,1,0.68,1), bottom 0.8s cubic-bezier(0.33,1,0.68,1), opacity 0.35s ease",
        ...style,
      }}
      aria-hidden="true"
    >
      <svg width="13" height="18" viewBox="0 0 22 30" fill="none">
        <path d="M3 2L3 25L9 19.5L13.5 29L17.5 27.5L13 18L21 18L3 2Z" fill="rgba(0,0,0,0.22)" transform="translate(1.5,1.5)" />
        <path d="M3 2L3 25L9 19.5L13.5 29L17.5 27.5L13 18L21 18L3 2Z" fill="white" stroke="white" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M3 2L3 25L9 19.5L13.5 29L17.5 27.5L13 18L21 18L3 2Z" fill="black" />
      </svg>
    </div>
  );
}

// ---------- Component ----------

export default function LandingPage() {
  const { isSignedIn, isLoaded, user } = useUser();
  const downloadPlatform = detectDownloadPlatform();
  // Waitlist mode — when this page is rendered at /waitlist, every
  // download/sign-up CTA becomes "Join the Waitlist" and links to /sign-up
  // (which renders Clerk's waitlist form when waitlist mode is enabled in
  // the Clerk Dashboard). Same code, two routes, zero duplication.
  const pathname = usePathname();
  const isWaitlist = pathname?.startsWith("/waitlist") ?? false;
  // Waitlist CTAs go to our custom /join page (inline email capture) rather
  // than Clerk's multi-step /sign-up form, so visitors can submit in one step.
  const primaryCtaHref = isWaitlist ? "/join" : "/download";
  const waitlistLabel = "Join the Waitlist";
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
  const [cursorPos, setCursorPos] = useState(0);      // 0=email, 1=Unpolished, 2=Controversial, 3=Enter
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorExiting, setCursorExiting] = useState(false);
  const [btnLefts, setBtnLefts] = useState({ u: "19%", c: "32%", e: "50%" });
  // Feature section animation state
  const [featAnimStep, setFeatAnimStep] = useState(0);
  const [featArrowFlash, setFeatArrowFlash] = useState(false);
  const [featCursorPos, setFeatCursorPos] = useState(0); // 0=text, 1=Humanize, 2=Unpolished, 3=Enter
  const [featCursorVisible, setFeatCursorVisible] = useState(false);
  const [featCursorExiting, setFeatCursorExiting] = useState(false);
  const [featBtnLefts, setFeatBtnLefts] = useState<{ h: string; u: string; e: string; top: string }>({ h: "15%", u: "33%", e: "75%", top: "54%" });
  const [isCustomMode, setIsCustomMode] = useState(false);
  // 3-step tutorial state. The animation plays col 1 → 2 → 3 in sequence.
  // `currentStep` tracks which column is "live" so the others dim back.
  const tutRef = useRef<HTMLDivElement>(null);
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2 | 3>(1);
  // Column 1 — select text. Cursor position and visibility are decoupled so
  // we never animate the position while invisible. Without this the cursor
  // would teleport between cycles (and between right/left anchored states).
  const [c1Sel, setC1Sel] = useState(0); // # of words highlighted, counting from the END
  const [c1CursorPos, setC1CursorPos] = useState<"start" | "end" | "button" | "after">("start");
  const [c1CursorOn, setC1CursorOn] = useState(false);
  const [c1Button, setC1Button] = useState(false); // yellow selector button
  const [c1Bar, setC1Bar] = useState(false); // tone-bar box faded in
  // Column 2 — pick tone(s)
  const [c2Tone, setC2Tone] = useState(0); // 0 none · 1 Unpolished · 2 +Direct · 3 Enter clicked
  const [c2Cursor, setC2Cursor] = useState<"hidden" | "unpolished" | "direct" | "enter" | "away">("hidden");
  // Column 3 — accept the rewrite
  const [c3, setC3] = useState(0); // 0 idle · 1 shimmer · 2 result · 3 cursor→accept · 4 clicked · 5 replaced
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("annual");
  const savedRangeRef = useRef<Range | null>(null);
  const activeSelTextRef = useRef<string>("");
  const editorRef = useRef<HTMLDivElement>(null);
  const demoSectionRef = useRef<HTMLDivElement>(null);
  const benefitSectionRef = useRef<HTMLElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const featSectionRef = useRef<HTMLElement>(null);
  const featVizRef = useRef<HTMLDivElement>(null);
  const tryUnderlineWrapRef = useRef<HTMLSpanElement>(null);
  const tryUnderlinePathRef = useRef<SVGPathElement>(null);
  const demoBoxWrapRef = useRef<HTMLDivElement>(null);
  const demoArrowsRef = useRef<HTMLDivElement>(null);
  const leftShaftRef = useRef<SVGPathElement>(null);
  const leftHeadRef = useRef<SVGPathElement>(null);
  const rightShaftRef = useRef<SVGPathElement>(null);
  const rightHeadRef = useRef<SVGPathElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const expandedRef      = useRef(false);
  const showTimerRef     = useRef<number | null>(null);

  // Keep the ref in sync so the global selectionchange listener can read the
  // latest "is the popup open?" value without re-subscribing the listener.
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

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

  // Benefit-section demo animation — scrubbed by scroll. The timeline keeps
  // the same beats as the old timer version (cursor in → select → tone bar →
  // hover tones → enter → result), but progress is tied to how far the
  // section has scrolled into view: it completes once the section is halfway
  // past the viewport center, and scrolling back up reverses it.
  useEffect(() => {
    const el = benefitSectionRef.current;
    if (!el) return;
    return attachScrollScrub(el, 10000, (T) => {
      // Cursor stays parked on the Enter button after the click; Enter keeps
      // its yellow "clicked" state for the rest of the timeline.
      setCursorVisible(T >= 600);
      setCursorExiting(false);
      setCursorPos(T >= 6500 ? 3 : T >= 5000 ? 2 : T >= 3400 ? 1 : 0);
      setArrowFlash(T >= 7300);
      setAnimStep(
        T >= 9500 ? 7
        : T >= 8500 ? 6
        : T >= 5900 ? 5
        : T >= 4400 ? 4
        : T >= 3300 ? 3
        : T >= 1800 ? 2
        : 0
      );
    });
  }, []);

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

  // Feature-section animation — scrubbed by scroll, same approach as the
  // benefit section above.
  useEffect(() => {
    const el = featSectionRef.current;
    if (!el) return;
    return attachScrollScrub(el, 9700, (T) => {
      // Cursor fades in and then STAYS on the Enter button (pos 3) — it no
      // longer slides away after the click. Enter keeps its clicked/yellow
      // state so the cursor reads as resting on the active button.
      setFeatCursorVisible(T >= 600);
      setFeatCursorExiting(false);
      setFeatCursorPos(T >= 6200 ? 3 : T >= 4700 ? 2 : T >= 3200 ? 1 : 0);
      setFeatArrowFlash(T >= 7000);
      setFeatAnimStep(
        T >= 9200 ? 7
        : T >= 7900 ? 6
        : T >= 5600 ? 5
        : T >= 4100 ? 4
        : T >= 3000 ? 3
        : T >= 1800 ? 2
        : 0
      );
    });
  }, []);

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

  // Hand-drawn underline beneath "Try huumanity Here" — the stroke sketches
  // itself in sync with the scroll (drawing on the way down, erasing in
  // reverse on the way up). Writes stroke-dashoffset straight to the DOM so
  // it stays smooth without re-rendering React every frame.
  useEffect(() => {
    const el = tryUnderlineWrapRef.current;
    const path = tryUnderlinePathRef.current;
    if (!el || !path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    // gain 2 → fully underlined by the time the headline is roughly halfway
    // up the screen, then holds. Scrolling back up erases it.
    return attachScrollScrub(
      el,
      1,
      (t) => {
        path.style.strokeDashoffset = `${len * (1 - t)}`;
      },
      2
    );
  }, []);

  // Two hand-drawn arrows that curve from beside the "Try huumanity Here"
  // headline down to the demo box, drawing/erasing with the scroll. Tied to
  // the box position: the arrows finish landing on the box as it comes fully
  // onto the screen, and retract as you scroll back up past the demo.
  useEffect(() => {
    const el = demoBoxWrapRef.current;
    const ls = leftShaftRef.current;
    const lh = leftHeadRef.current;
    const rs = rightShaftRef.current;
    const rh = rightHeadRef.current;
    if (!el || !ls || !lh || !rs || !rh) return;

    const lsLen = ls.getTotalLength();
    const lhLen = lh.getTotalLength();
    const rsLen = rs.getTotalLength();
    const rhLen = rh.getTotalLength();
    for (const [p, len] of [
      [ls, lsLen],
      [lh, lhLen],
      [rs, rsLen],
      [rh, rhLen],
    ] as [SVGPathElement, number][]) {
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
    }

    // The shaft draws over the first 82% of the timeline; the arrowHEAD only
    // starts once the shaft is fully connected (t ≥ 0.82) and finishes by t=1.
    // This guarantees the head never floats ahead of an unfinished line.
    const HEAD_START = 0.82;
    return attachScrollScrub(
      el,
      1,
      (t) => {
        const shaftT = Math.min(1, t / HEAD_START);
        const headT = Math.max(0, (t - HEAD_START) / (1 - HEAD_START));
        ls.style.strokeDashoffset = `${lsLen * (1 - shaftT)}`;
        rs.style.strokeDashoffset = `${rsLen * (1 - shaftT)}`;
        lh.style.strokeDashoffset = `${lhLen * (1 - headT)}`;
        rh.style.strokeDashoffset = `${rhLen * (1 - headT)}`;
      },
      1.25
    );
  }, []);

  // 3-step tutorial sequence. All three columns stay visible; the animation
  // plays col 1 → 2 → 3 then holds 2s and repeats, but only while the block is
  // on screen. Driven by an awaitable, cancellable timeline so each beat is
  // explicit and the whole thing stays smooth (opacity / transform only).
  useEffect(() => {
    const el = tutRef.current;
    if (!el) return;

    const totalWords = TUT_ORIGINAL.split(" ").length;
    let token = { cancelled: true };
    let timeoutId: number | undefined;

    const sleep = (ms: number) =>
      new Promise<void>((res) => {
        timeoutId = window.setTimeout(res, ms);
      });

    const reset = () => {
      setC1Sel(0);
      // Silently move the cursor back to the start position while invisible —
      // the next loop will fade it in there with no slide.
      setC1CursorPos("start");
      setC1CursorOn(false);
      setC1Button(false);
      setC1Bar(false);
      setC2Tone(0);
      setC2Cursor("hidden");
      setC3(0);
      setCurrentStep(1); // step 1 starts fully lit; cols 2 & 3 dim
    };

    const loop = async (tok: { cancelled: boolean }) => {
      while (!tok.cancelled) {
        reset();
        await sleep(1100);
        if (tok.cancelled) return;

        // ── COLUMN 1 — cursor selects the text, then clicks the huu button ──
        // Cursor fades IN at the "start" position (set by reset). Position
        // changes only happen while it's visible, so it always glides — never
        // teleports. Sequence:
        //   appear at start → glide up-left while words highlight backward →
        //   pause → yellow button pops in → cursor glides ONTO the button →
        //   click → tone bar fades in above + cursor walks left and fades.
        setC1CursorOn(true);
        await sleep(800); // let the fade-in finish + read the start pose
        if (tok.cancelled) return;
        setC1CursorPos("end"); // begin gliding to the start-of-text area
        for (let i = 1; i <= totalWords; i++) {
          setC1Sel(i); // highlight words from the last back to the first
          await sleep(2200 / totalWords);
          if (tok.cancelled) return;
        }
        await sleep(550);
        if (tok.cancelled) return;
        setC1Button(true); // yellow huu button pops in beside "AI content"
        await sleep(600); // wait out the pop-in before "clicking" it
        if (tok.cancelled) return;
        setC1CursorPos("button"); // cursor glides onto the button
        await sleep(1000); // hold on the click so it reads as a press
        if (tok.cancelled) return;
        setC1Bar(true); // click → tone bar starts fading in above
        setC1CursorPos("after"); // cursor glides slightly left of the button
        await sleep(600);
        if (tok.cancelled) return;
        setC1CursorOn(false); // …then fades away softly at the "after" pose
        await sleep(900);
        if (tok.cancelled) return;

        // ── COLUMN 2 — pick Unpolished + Direct, click Enter, glide away ──
        setCurrentStep(2); // attention moves to step 2; col 1 dims back
        setC2Cursor("unpolished");
        await sleep(950);
        if (tok.cancelled) return;
        setC2Tone(1);
        await sleep(750);
        if (tok.cancelled) return;
        setC2Cursor("direct");
        await sleep(950);
        if (tok.cancelled) return;
        setC2Tone(2);
        await sleep(750);
        if (tok.cancelled) return;
        setC2Cursor("enter");
        await sleep(950);
        if (tok.cancelled) return;
        setC2Tone(3); // Enter clicked — stays yellow
        await sleep(700);
        if (tok.cancelled) return;
        setC2Cursor("away"); // slide sideways to the right, then step 3 begins
        await sleep(1100);
        if (tok.cancelled) return;

        // ── COLUMN 3 — shimmer 1.5s → result → accept → swap the tweet ──
        setCurrentStep(3); // step 3 "pops" — everything lights up at full opacity
        setC3(1); // rewriting shimmer
        await sleep(1500);
        if (tok.cancelled) return;
        setC3(2); // rewritten text + Back / Copy / Accept
        await sleep(1200);
        if (tok.cancelled) return;
        setC3(3); // cursor glides onto Accept
        await sleep(1200);
        if (tok.cancelled) return;
        setC3(4); // Accept clicked
        await sleep(1200); // wait ~1s …
        if (tok.cancelled) return;
        setC3(5); // … then the tweet holds the huumanity rewrite; popup fades
        await sleep(2600); // hold, then loop
        if (tok.cancelled) return;
      }
    };

    const start = () => {
      if (!token.cancelled) return; // already running
      token = { cancelled: false };
      loop(token);
    };
    const stop = () => {
      token.cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      reset();
    };

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start();
        else stop();
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      stop();
    };
  }, []);

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
    const clearShowTimer = () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    // Read the CURRENT selection, validate it against the rephrase rules, and
    // return the floating-button geometry + a cloned range — or null when
    // nothing rephrasable is selected.
    //
    // This is fully self-contained (does NOT rely on a value pre-populated by
    // `selectionchange`). That matters cross-platform: Chrome/Edge/Firefox on
    // Windows fire `selectionchange` AFTER `mouseup`, whereas WebKit/Chrome on
    // macOS fire it before. Computing from the live selection at mouseup time
    // works identically on every OS/browser.
    const computeAnchorFromSelection = ():
      | { anchor: NonNullable<SelectionAnchor>; range: Range }
      | null => {
      const selection = window.getSelection();
      const editor    = editorRef.current;
      const section   = demoSectionRef.current;

      if (!selection || !editor || !section || selection.rangeCount === 0) return null;

      const range        = selection.getRangeAt(0);
      const selectedText = selection.toString();

      if (
        range.collapsed ||
        selectedText.trim().length === 0 ||
        !editor.contains(range.commonAncestorContainer)
      ) {
        return null;
      }

      // Smart gate — same ground rules as everywhere else
      if (!isRephrashable(selectedText)) return null;

      const sectionRect  = section.getBoundingClientRect();
      const sectionWidth  = section.offsetWidth;

      const rects = range.getClientRects();
      if (rects.length === 0) return null;
      const firstRect    = rects[0];
      const rangeRect    = range.getBoundingClientRect();
      const relLeft      = rangeRect.left  - sectionRect.left;
      const relRight     = rangeRect.right - sectionRect.left;
      const relFirstTop  = firstRect.top   - sectionRect.top;
      const relFirstLeft = firstRect.left  - sectionRect.left;
      const tabTop       = relFirstTop + firstRect.height / 2 - 18;
      // Anchor the floating yellow button just LEFT of the first selected
      // character (same UX as the Mac app), instead of pinning it to the
      // section edge. Button is 36px wide; offset by 44px + clamp to 4px.
      const BUTTON_OFFSET = 44;
      const tabLeft      = Math.max(4, relFirstLeft - BUTTON_OFFSET);

      const popupWidth  = Math.max(POPUP_MIN_WIDTH, Math.min(POPUP_MAX_WIDTH, sectionWidth - 16));
      const rangeCenter = (relLeft + relRight) / 2;
      const desiredLeft = rangeCenter - popupWidth / 2;
      const popupLeft   = Math.min(Math.max(8, desiredLeft), Math.max(8, sectionWidth - popupWidth - 8));

      return {
        anchor: { tabTop, tabLeft, popupTop: relFirstTop, popupLeft, popupWidth },
        range: range.cloneRange(),
      };
    };

    // Show / hide the floating button purely off `selectionchange`.
    //
    // Why selectionchange (and NOT mouseup): `mouseup` only fires for MOUSE
    // selections on the desktop. It does NOT fire when a visitor selects text
    // on a touch device (phone/tablet) using the native selection handles, so
    // the button — and therefore the entire tone bar — never appeared for
    // mobile users even though it worked on the developer's desktop. That was
    // the "works for me, not for other people" bug.
    //
    // `selectionchange` fires for mouse, touch, AND keyboard selection on
    // every modern browser, and is independent of event ordering (Windows
    // fires it after mouseup, macOS before), so this single path behaves
    // identically on every device.
    const handleSelectionChange = () => {
      const result = computeAnchorFromSelection();

      // Popup already open → a brand-new selection resets it back to the tone
      // picker; an unchanged or cleared selection is left alone (the popup is
      // closed by the outside-tap handler instead).
      if (expandedRef.current) {
        if (result && result.range.toString() !== activeSelTextRef.current) {
          // Update the ref synchronously so logic below can proceed to show
          // the button for the new selection without waiting for a re-render.
          expandedRef.current = false;
          setExpanded(false);
          setPopupStage("select");
          setSelectedTones([]);
          setResultText("");
          setGeneratedSignature("");
        } else {
          return;
        }
      }

      // Selection cleared / not rephrasable → retract the pending button.
      if (!result) {
        clearShowTimer();
        setAnchor(null);
        activeSelTextRef.current = "";
        return;
      }

      // Valid selection — remember it, save the range, and (re)schedule the
      // button. The short debounce means the rapid selectionchange events
      // fired during a drag keep resetting the timer, so the button only
      // appears ~250ms after the selection settles (no mid-drag flicker).
      activeSelTextRef.current = result.range.toString();
      savedRangeRef.current = result.range;
      clearShowTimer();
      const snapshot = result.anchor;
      showTimerRef.current = window.setTimeout(() => {
        setAnchor(snapshot);
        showTimerRef.current = null;
      }, 250) as unknown as number;
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      clearShowTimer();
    };
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

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (editorRef.current?.contains(target)) return;
      closePopup();
    };

    // Defer one tick so the press that opened the popup doesn't immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", handlePointerDown);
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
                href={primaryCtaHref}
                onClick={handleDismissLimitModal}
                className="w-full px-6 py-3.5 text-base font-bold text-black bg-[#fff700] rounded-full hover:brightness-95 transition"
              >
                {isWaitlist ? waitlistLabel : "Download the app"}
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
          <a href="#top" className="shrink-0 mr-8">
            <HuuLogo className="text-3xl" />
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

          {/* Auth controls — right.
              Waitlist site → /join (inline email capture).
              Main site + signed in → straight to /download.
              Main site + signed out → Clerk sign-up, then /download. */}
          <div className="shrink-0 flex items-center gap-3">
            {isWaitlist ? (
              <a
                href={primaryCtaHref}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-[#fff700] px-5 py-2.5 text-sm font-black text-black shadow-[0_2px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
              >
                <DownloadCtaContent platform={downloadPlatform} waitlist />
              </a>
            ) : isLoaded && isSignedIn ? (
              <a
                href="/download"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-[#fff700] px-5 py-2.5 text-sm font-black text-black shadow-[0_2px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
              >
                <DownloadCtaContent platform={downloadPlatform} />
              </a>
            ) : (
              <SignUpButton mode="redirect" forceRedirectUrl="/download">
                <button className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-[#fff700] px-5 py-2.5 text-sm font-black text-black shadow-[0_2px_0_rgba(0,0,0,0.18)] transition hover:brightness-95">
                  <DownloadCtaContent platform={downloadPlatform} />
                </button>
              </SignUpButton>
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
            Stop writing like a f*cking robot.
          </h1>

          <p className="font-sans text-neutral-500 text-lg sm:text-xl mt-6 mb-10 max-w-lg">
            the text selection tool that rephrases AI copy into unpolished-human sounding words across every app.
          </p>

          {/* Download CTA — same routing as the header. */}
          {isWaitlist ? (
            <a
              href={primaryCtaHref}
              className="inline-flex items-center gap-2.5 rounded-2xl border-2 border-black bg-[#fff700] px-10 py-4 text-lg font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
            >
              <DownloadCtaContent platform={downloadPlatform} waitlist />
            </a>
          ) : isLoaded && isSignedIn ? (
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
        className="bg-white px-4 sm:px-6 pt-24 sm:pt-28 pb-3"
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
                Select any text and pick any of the four tones
              </h2>

              <p className="font-sans text-white/55 text-base leading-7">
                Rephrase your AI copy right inside whatever you&apos;re working
                in without opening another AI chat to do it
              </p>

              <div>
                {isWaitlist ? (
                  <Link
                    href={primaryCtaHref}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-[#fff700] px-7 py-3 text-sm font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
                  >
                    {waitlistLabel}
                  </Link>
                ) : isLoaded && isSignedIn ? (
                  <Link
                    href="/download"
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-[#fff700] px-7 py-3 text-sm font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
                  >
                    Try it free
                  </Link>
                ) : (
                  <SignUpButton mode="redirect" forceRedirectUrl="/download">
                    <button className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-[#fff700] px-7 py-3 text-sm font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.18)] transition hover:brightness-95">
                      Try it free
                    </button>
                  </SignUpButton>
                )}
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
                    Rewritten by huumanity
                  </span>
                </div>
                <p className="font-sans text-[12px] leading-[1.75] text-neutral-800 whitespace-pre-line">
                  {`Dimitri, we haven't met but I'm gonna skip the networking bullshit and just say it.\n\nI'm Andrea from Acme. We run Meta ads for people across Asia who actually know what they're doing. If your calendar isn't full, that's a problem we fix. 10 extra booked calls, not leads that ghost you, actual calls with people who show up.`}
                </p>
                {/* Back on the left; Copy (icon) + Accept grouped on the right. */}
                <div
                  className="flex items-center justify-between gap-2 mt-3"
                  style={{
                    opacity: animStep >= 7 ? 1 : 0,
                    transition: "opacity 0.5s ease-out",
                  }}
                >
                  <button className="bg-neutral-100 text-black font-sans text-xs font-semibold rounded-full px-4 py-1.5">Back</button>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label="Copy"
                      className="flex items-center gap-1 bg-neutral-100 text-black font-sans text-xs font-semibold rounded-full px-3 py-1.5"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy
                    </button>
                    <button className="bg-[#fff700] text-black font-sans text-xs font-bold rounded-full px-4 py-1.5 border border-black">Accept</button>
                  </div>
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
        className="relative bg-white px-4 sm:px-6 pt-3 pb-10 sm:pb-12"
      >
        {/* Headline — yellow rounded box, visually attached to the black benefit box above */}
        <div className="max-w-6xl mx-auto">
          <div className="bg-[#fff700] rounded-[2.5rem] px-8 sm:px-14 py-14 sm:py-20 text-center">
            <h2
              className="font-display text-black leading-[1.02] tracking-tight mb-5"
              style={{ fontSize: "clamp(2rem, 4.8vw, 3.75rem)" }}
            >
              People know it&apos;s written by AI
            </h2>
            <p className="font-sans text-black/60 text-base sm:text-lg leading-7 max-w-xl mx-auto">
              The way AI writes is instantly recognizable. And it&apos;s quietly killing your replies, your engagement, and your credibility.
            </p>
          </div>
        </div>

        {/* 3-step "how the selection tool works" visualization. All three
            columns stay visible; the animation plays through them in sequence
            (1 → 2 → 3), holds, and repeats while on screen. Spans the same
            max-w-6xl width as the feature section's black box, so column 1 sits
            at the far left and column 3 at the far right. Each column stacks a
            separate tone-bar / result box above a separate tweet box. */}
        <div
          ref={tutRef}
          className="max-w-6xl mx-auto mt-20 sm:mt-28 grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-14 text-left"
        >

          {/* ── STEP 1 — Select a text ──
              Lit from step 1 onward (stays at 100% once it has played). */}
          <div
            className={`flex flex-col transition-opacity duration-700 ${
              currentStep >= 1 ? "opacity-100" : "opacity-30"
            }`}
          >
            <div className="flex items-center gap-3 mb-7">
              <span className="w-7 h-7 rounded-lg bg-[#fff700]/55 flex items-center justify-center font-black text-sm text-black shrink-0">1</span>
              <span className="font-display text-xl text-black">Select a text</span>
            </div>
            {/* fixed-height top slot keeps the tone-bar / result boxes on one
                line across all three columns and the tweet boxes parallel */}
            <div className="h-[96px] mb-5">
              {/* tone-bar box — its own card; fades in only after the huu click */}
              <div
                className="rounded-xl border border-black/10 bg-white shadow-sm px-3 py-2 w-fit transition-all duration-700 ease-out"
                style={{ opacity: c1Bar ? 1 : 0, transform: c1Bar ? "translateY(0)" : "translateY(8px)" }}
              >
                <ToneBar />
              </div>
            </div>
            {/* tweet box — its own card; cursor selects the text then clicks huu */}
            <div className="relative rounded-xl border border-black/10 bg-white shadow-sm p-4">
              <TutTweet text={TUT_ORIGINAL} selCount={c1Sel} huuButton={c1Button} />
              {/* All step-1 positions use LEFT/TOP only (never right/bottom) —
                  mixing the two snaps the un-set anchor to `auto`, which is
                  not transitionable and was making the cursor teleport. */}
              <TutCursor
                visible={c1CursorOn}
                style={
                  c1CursorPos === "start"
                    ? // end of the last line of text ("…truly resonate.")
                      { left: "52%", top: "58%" }
                    : c1CursorPos === "end"
                      ? // just left of "AI" at the start of the tweet text
                        { left: "16%", top: "22%" }
                      : c1CursorPos === "button"
                        ? // tip directly on the yellow huu button (sits at
                          // -left-5 top-4 over the avatar gap)
                          { left: "13%", top: "27%" }
                        : // "after" — slight left/down of the button as the
                          // cursor walks away
                          { left: "4%", top: "36%" }
                }
              />
            </div>
          </div>

          {/* ── STEP 2 — Pick a tone(s) ──
              Lit from step 2 onward (stays at 100% once it has played). */}
          <div
            className={`flex flex-col transition-opacity duration-700 ${
              currentStep >= 2 ? "opacity-100" : "opacity-30"
            }`}
          >
            <div className="flex items-center gap-3 mb-7">
              <span className="w-7 h-7 rounded-lg bg-[#fff700]/55 flex items-center justify-center font-black text-sm text-black shrink-0">2</span>
              <span className="font-display text-xl text-black">Pick a tone(s)</span>
            </div>
            <div className="h-[96px] mb-5">
              {/* tone-bar box — Unpolished → Direct light up, Enter clicks; cursor lives here */}
              <div className="relative rounded-xl border border-black/10 bg-white shadow-sm px-3 py-2 w-fit">
                <ToneBar unpolished={c2Tone >= 1} direct={c2Tone >= 2} enter={c2Tone >= 3} />
                <TutCursor
                  visible={c2Cursor !== "hidden" && c2Cursor !== "away"}
                  style={
                    c2Cursor === "unpolished"
                      ? { left: "30%", top: "52%" }
                      : c2Cursor === "direct"
                        ? { left: "72%", top: "52%" }
                        : c2Cursor === "enter"
                          ? { left: "90%", top: "52%" }
                          : { left: "120%", top: "52%" }
                  }
                />
              </div>
            </div>
            {/* tweet box — fully selected, waiting for the rewrite */}
            <div className="rounded-xl border border-black/10 bg-white shadow-sm p-4">
              <TutTweet text={TUT_ORIGINAL} selCount={TUT_ORIGINAL.split(" ").length} />
            </div>
          </div>

          {/* ── STEP 3 — Accept the rewrite ──
              Lit only during step 3 — the final reveal pops everything. */}
          <div
            className={`flex flex-col transition-opacity duration-700 ${
              currentStep === 3 ? "opacity-100" : "opacity-30"
            }`}
          >
            <div className="flex items-center gap-3 mb-7">
              <span className="w-7 h-7 rounded-lg bg-[#fff700]/55 flex items-center justify-center font-black text-sm text-black shrink-0">3</span>
              <span className="font-display text-xl text-black">Accept the rewrite</span>
            </div>
            <div className="h-[96px] mb-5">
              {/* result box — its own card, sized to its content (no stretch, so
                  no dead white space inside); shimmer → rewrite → cursor clicks
                  Accept → fades. Top-aligned in the slot, so it lines up with
                  the tone bars in columns 1 & 2. */}
              <div
                className="relative rounded-xl border-2 border-[#fff700] bg-white p-3 shadow-[0_3px_14px_rgba(255,247,0,0.22)] transition-all duration-700 ease-out"
                style={{
                  opacity: c3 >= 1 && c3 < 5 ? 1 : 0,
                  transform: c3 >= 1 && c3 < 5 ? "translateY(0)" : "translateY(8px)",
                }}
              >
                <div>
                  {c3 >= 2 ? (
                    <>
                      <p className="text-[9px] leading-[1.6] text-neutral-800">{TUT_REWRITTEN}</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-[8px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-black">Back</span>
                        <div className="flex items-center gap-1.5">
                          <span className="flex items-center gap-0.5 text-[8px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-black">
                            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Copy
                          </span>
                          <span
                            className={`text-[8px] font-bold px-2 py-0.5 rounded-full bg-[#fff700] border border-black text-black transition-transform duration-200 ${
                              c3 >= 4 ? "scale-90" : ""
                            }`}
                          >
                            Accept
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 py-0.5">
                      <div className="h-1.5 rounded-full huu-shimmer w-full" />
                      <div className="h-1.5 rounded-full huu-shimmer w-11/12" />
                      <div className="h-1.5 rounded-full huu-shimmer w-4/5" />
                      <div className="h-1.5 rounded-full huu-shimmer w-2/3" />
                    </div>
                  )}
                </div>
                <TutCursor
                  visible={c3 >= 2 && c3 < 5}
                  style={
                    c3 >= 3
                      ? // tip sits on the Accept button at the box's bottom-right
                        { right: "8%", bottom: "10%" }
                      : // resting just below the box before gliding onto Accept
                        { right: "45%", bottom: "-26px" }
                  }
                />
              </div>
            </div>
            {/* tweet box — holds the original until Accept, then the rewrite */}
            <div className="rounded-xl border border-black/10 bg-white shadow-sm p-4">
              <TutTweet
                text={c3 >= 5 ? TUT_REWRITTEN : TUT_ORIGINAL}
                selCount={c3 >= 5 ? 0 : TUT_ORIGINAL.split(" ").length}
              />
            </div>
          </div>

        </div>

        <div className="max-w-3xl mx-auto mt-24 sm:mt-32">

          {/* Funnel region: headline + tabs + box, with two hand-drawn arrows
              overlaid that curve from beside the headline down onto the box. */}
          <div ref={demoArrowsRef} className="relative">

          {/* "Try huumanity Here" sub-headline with a bold hand-drawn underline
              that sketches itself beneath the words as you scroll down (and
              erases scrolling back up). Same handwritten pen as the hero
              annotation (neutral-400), but thicker. */}
          <p className="text-center mb-10 mt-2">
            <span ref={tryUnderlineWrapRef} className="relative inline-block px-2 pb-3">
              <span
                className="relative z-10 font-display text-black leading-tight"
                style={{ fontSize: "clamp(1.75rem, 4vw, 3rem)" }}
              >
                Try huumanity Here
              </span>
              <svg
                className="absolute pointer-events-none"
                style={{ left: "-2%", bottom: "-6%", width: "104%", height: "42%" }}
                viewBox="0 0 600 48"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {/* Loose, slightly wavy underline — one stroke, drawn via
                    stroke-dashoffset scrubbing. */}
                <path
                  ref={tryUnderlinePathRef}
                  d="M 10 30 C 130 16, 250 40, 370 26 C 470 15, 545 36, 592 24"
                  fill="none"
                  stroke="#9ca3af"
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </p>

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
            Paste your own texts to test the demo ↓
          </p>

          {/* Editable demo box */}
          <div ref={demoBoxWrapRef} className="relative rounded-3xl bg-white border-2 border-black shadow-[0_8px_0_rgba(0,0,0,0.08)] z-10">
            <div className="absolute top-4 left-5 flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-black/10" />
              <span className="w-2.5 h-2.5 rounded-full bg-black/10" />
              <span className="w-2.5 h-2.5 rounded-full bg-black/10" />
            </div>
            <div
              // key includes isCustomMode so toggling "Paste yours" remounts
              // the editor (which is how we swap between sample text and a
              // blank box without React fighting contentEditable).
              key={`${activeTab}-${isCustomMode ? "custom" : "sample"}`}
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              data-placeholder="Paste your text here to humanize it…"
              className="min-h-[380px] p-8 pt-12 sm:p-10 sm:pt-12 text-[15px] sm:text-base leading-7 text-neutral-700 whitespace-pre-wrap focus:outline-none font-sans"
              style={{ caretColor: BRAND }}
            >
              {isCustomMode ? "" : SAMPLES[activeTab]}
            </div>
          </div>

          {/* Two hand-drawn arrows: tails start at the ends of the headline's
              underline, swoop outward into the page margins, and the tips land
              beside the demo box pointing down-into it. Single path per arrow
              with the head as trailing subpaths, so the dash-offset scrub
              draws the LINE first and THEN the arrowhead. Fixed-size SVGs (no
              preserveAspectRatio stretching) keep the strokes undistorted.
              Hidden below lg where there's no margin space for them. */}
          <svg
            className="absolute hidden lg:block pointer-events-none z-0"
            style={{ left: "-150px", top: "44px" }}
            width="240"
            height="300"
            viewBox="0 0 240 300"
            fill="none"
            aria-hidden="true"
          >
            <path
              ref={leftShaftRef}
              d="M 235 4 C 130 24, 60 90, 68 185 C 72 232, 84 258, 100 272"
              stroke="#9ca3af"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              ref={leftHeadRef}
              d="M 100 272 L 76 264 M 100 272 L 92 248"
              stroke="#9ca3af"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <svg
            className="absolute hidden lg:block pointer-events-none z-0"
            style={{ right: "-150px", top: "44px" }}
            width="240"
            height="300"
            viewBox="0 0 240 300"
            fill="none"
            aria-hidden="true"
          >
            <path
              ref={rightShaftRef}
              d="M 5 4 C 110 24, 180 90, 172 185 C 168 232, 156 258, 140 272"
              stroke="#9ca3af"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              ref={rightHeadRef}
              d="M 140 272 L 164 264 M 140 272 L 148 248"
              stroke="#9ca3af"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          </div>

          {anchor && !expanded && (
            <button
              type="button"
              // pointerDown (not mouseDown) so a finger tap on touch devices
              // opens the popup too — and preventDefault keeps the text
              // selection intact when the button steals the press.
              onPointerDown={(e) => {
                e.preventDefault();
                openPopup();
              }}
              className="absolute z-20 w-9 h-9 rounded-full bg-[#fff700] hover:brightness-95 border-2 border-black shadow-md flex items-center justify-center text-black"
              style={{
                top: anchor.tabTop,
                left: anchor.tabLeft,
                animation: "huu-btn-fadein 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards",
              }}
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
              // Keep the underlying selection alive when interacting with the
              // popup on both mouse and touch.
              onPointerDown={(e) => e.preventDefault()}
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
                      href={primaryCtaHref}
                      className="shrink-0 px-3.5 py-1.5 text-[11px] font-bold text-black bg-[#fff700] rounded-full hover:brightness-95 transition whitespace-nowrap"
                    >
                      {isWaitlist ? waitlistLabel : "Download the app"}
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
                {USE_CASES.map((uc, i) => {
                  const isActive = activeUseCase.id === uc.id;
                  const tiltDir = i % 2 === 0 ? -7 : 7; // even = lean left, odd = lean right
                  return (
                    <button
                      key={uc.id}
                      onClick={() => setActiveUseCase(uc)}
                      style={{
                        transform: isActive ? `rotate(${tiltDir}deg) translateY(-2px)` : "rotate(0deg) translateY(0)",
                        boxShadow: isActive ? "4px 4px 0 rgba(0,0,0,0.85)" : "none",
                        transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease",
                      }}
                      className={`px-5 py-2.5 text-sm font-bold rounded-full border-2 ${
                        isActive
                          ? "bg-[#fff700] text-black border-[#fff700]"
                          : "bg-transparent text-white border-white/20 hover:border-white/60"
                      }`}
                    >
                      {uc.label}
                    </button>
                  );
                })}
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
                  href={primaryCtaHref}
                  className="inline-flex items-center gap-2.5 rounded-xl border-2 border-white bg-white px-6 py-3 text-sm font-black text-black transition hover:brightness-95"
                >
                  {isWaitlist ? (
                    <>{waitlistLabel}</>
                  ) : (
                    <DownloadCtaContent platform={downloadPlatform} />
                  )}
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
                  <p className="text-white text-[15px] font-semibold leading-[1.35]">comment &ldquo;FREE&rdquo; and i&apos;ll send u the invite</p>
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
              Stop switching tabs to fix your AI copy
            </h2>
            <p className="font-sans text-neutral-500 text-base sm:text-lg leading-7">
              Why switch between your AI chat and your work space when you can
              select the text right where it is and rephrase it in seconds.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href="#demo"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-white px-6 py-3.5 text-sm font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
              >
                Try free
              </Link>
              <Link
                href={primaryCtaHref}
                className="inline-flex items-center gap-2.5 rounded-xl border-2 border-black bg-[#fff700] px-6 py-3.5 text-sm font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.18)] transition hover:brightness-95"
              >
                {isWaitlist ? (
                  <>{waitlistLabel}</>
                ) : (
                  <DownloadCtaContent platform={downloadPlatform} />
                )}
              </Link>
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
            Download the app and start free with 10 rewrites a day.
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
                    href={primaryCtaHref}
                    className={`block text-center px-4 py-3 text-sm font-bold rounded-full transition-colors ${
                      tier.accent
                        ? "bg-black text-[#fff700] hover:brightness-110"
                        : "bg-[#fff700] text-black hover:brightness-95"
                    }`}
                  >
                    {isWaitlist ? waitlistLabel : tier.cta}
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
          <h2 className="font-display text-5xl sm:text-6xl md:text-7xl text-black leading-[1.02] whitespace-nowrap">
            Start sounding human.
          </h2>
          <p className="text-black/80 text-base sm:text-lg mt-6 mb-10 max-w-xl mx-auto leading-7">
            Every cold email, DM, and post you send deserves to sound like you and not some AI slop. Free to start now.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="#demo"
              className="inline-block px-8 py-3.5 text-sm font-black text-[#fff700] bg-black border-2 border-black rounded-xl shadow-[0_3px_0_rgba(0,0,0,0.25)] hover:bg-neutral-900 transition-colors"
            >
              Try it for free
            </Link>
            <Link
              href={primaryCtaHref}
              className="inline-flex items-center gap-2.5 px-8 py-3.5 text-sm font-black text-black bg-transparent border-2 border-black rounded-xl shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:bg-black/5 transition-colors"
            >
              {isWaitlist ? (
                <>{waitlistLabel}</>
              ) : (
                <>
                  <svg width="13" height="16" viewBox="0 0 18 22" fill="currentColor" aria-hidden="true">
                    <path d="M14.7 11.6c0-2.7 2.2-4 2.3-4.1-1.3-1.8-3.2-2.1-3.8-2.1-1.6-.2-3.1.9-3.9.9s-2-.9-3.3-.9C4.3 5.4 2.7 6.4 1.8 8c-1.9 3.2-.5 8 1.3 10.6.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.8 3.4-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-3.1-1.2-3.1-4ZM12.1 3.7c.7-.9 1.2-2 1.1-3.2-1.1 0-2.3.7-3.1 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3.1-1.5Z"/>
                  </svg>
                  Download
                </>
              )}
            </Link>
          </div>
        </div>
      </section>

      {/* 9. FOOTER (black) */}
      <footer className="bg-black text-white">
        <div className="w-full max-w-6xl mx-auto px-6 py-14 grid grid-cols-2 sm:grid-cols-3 gap-10">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <HuuLogo className="text-3xl" />
            <p className="text-sm text-neutral-400 mt-3 max-w-[14rem]">
              Make your AI copy sound like you wrote it.
            </p>
          </div>

          {/* Use Cases */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-neutral-500 mb-3 font-bold">
              Use Cases
            </h4>
            <ul className="space-y-2">
              {[
                { label: "Anywhere", href: "#use-cases" },
                { label: "Outreach", href: "#use-cases" },
                { label: "Posts", href: "#use-cases" },
                { label: "Scripts", href: "#use-cases" },
              ].map(({ label, href }) => (
                <li key={label}>
                  <a href={href} className="text-sm text-neutral-300 hover:text-[#fff700] transition-colors">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* How it works */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-neutral-500 mb-3 font-bold">
              How it works
            </h4>
            <p className="text-sm text-neutral-400 leading-[1.7]">
              Select any text anywhere on your screen. Pick from four tones: Humanize, Unpolished, Controversial, or Direct. huumanity rewrites it instantly. Accept, copy, or try again.
            </p>
          </div>
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
