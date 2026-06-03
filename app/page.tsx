"use client";

import { useEffect, useRef, useState } from "react";

// ---------- Constants ----------

const TABS = ["Email", "DMs", "X & Linkedin posts"] as const;
type Tab = (typeof TABS)[number];

const TONES = ["Unpolished", "Raw", "Informal", "Shorter", "Humorous"] as const;

const SAMPLES: Record<Tab, string> = {
  Email: `Dear [name],

I hope this email finds you well. I am reaching out to introduce myself and explore potential synergies between our organizations. Based on my research, I believe there is significant value in connecting, and I would love to schedule a brief call at your earliest convenience to discuss how we might collaborate moving forward.

Please let me know what time works best for your schedule.

Best regards,
Alex`,

  DMs: `Hi [name]!

I came across your profile and was thoroughly impressed by your professional accomplishments and the value you continue to deliver in your industry. I would love to connect and explore opportunities for mutual collaboration.

Looking forward to engaging with your insightful content and hearing back from you at your earliest convenience.`,

  "X & Linkedin posts": `After conducting extensive research and analysis over the past several months, I am thrilled to share that AI is fundamentally transforming the way we approach productivity and workflow optimization.

The implications of this technological revolution truly cannot be overstated.

I will be sharing more in-depth insights in the coming days. Stay tuned for what promises to be an exciting thread.`,
};

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#personas", label: "For You" },
  { href: "#pricing", label: "Pricing" },
  { href: "#demo", label: "Web Demo" },
];

const BRAND_LOGOS = [
  "OpenAI", "YC", "a16z", "Stripe", "Notion", "Vercel", "Linear", "Figma", "Loom", "Superhuman", "Anthropic", "Mercury",
];

type Persona = {
  id: string;
  label: string;
  title: string;
  blurb: string;
};

const PERSONAS: Persona[] = [
  {
    id: "founders",
    label: "Founders",
    title: "huu for Founders",
    blurb:
      "You're raising, hiring, and shipping at the same time. Stop sending investor updates that read like a press release. huu rewrites your drafts so they sound like you, not like ChatGPT did it at 2am.",
  },
  {
    id: "marketers",
    label: "Marketers",
    title: "huu for Marketers",
    blurb:
      "Your landing pages, ads, and emails all sound the same — because the AI behind them is the same. huu adds the human edge that makes copy actually convert.",
  },
  {
    id: "sales",
    label: "Sales",
    title: "huu for Sales",
    blurb:
      "Cold emails that say \"I hope this finds you well\" get deleted. huu turns generic outbound into messages that get opened, read, and replied to.",
  },
  {
    id: "writers",
    label: "Writers",
    title: "huu for Writers",
    blurb:
      "Use AI to draft fast, then humanize with huu so the final piece sounds like you actually wrote it. No more readers spotting the em-dashes from a mile away.",
  },
  {
    id: "creators",
    label: "Creators",
    title: "huu for Creators",
    blurb:
      "Captions, threads, and DMs that don't read like a corporate intern wrote them. huu helps your voice come through, even when AI helped draft the first pass.",
  },
  {
    id: "recruiters",
    label: "Recruiters",
    title: "huu for Recruiters",
    blurb:
      "Candidates ghost generic outreach. huu turns your sequences into messages that feel like a real human is on the other end — because they are.",
  },
  {
    id: "students",
    label: "Students",
    title: "huu for Students",
    blurb:
      "Draft essays, cover letters, and applications fast with AI. Then run them through huu so they sound like a person, not a prompt.",
  },
  {
    id: "support",
    label: "Customer Support",
    title: "huu for Customer Support",
    blurb:
      "Reply 10x faster without the canned-response energy. huu makes scripted answers sound human, every single time.",
  },
];

type Device = {
  id: string;
  label: string;
  title: string;
  blurb: string;
};

const DEVICES: Device[] = [
  {
    id: "web",
    label: "Web",
    title: "huu in your browser",
    blurb:
      "No install. Open huu.app, paste your text, and rewrite. Works in every browser on every OS.",
  },
  {
    id: "chrome",
    label: "Chrome",
    title: "huu in Gmail, LinkedIn, X & more",
    blurb:
      "The Chrome extension adds a one-click rewrite button to every text box on the internet. Gmail, LinkedIn, X, Notion, Substack — wherever you write.",
  },
  {
    id: "mac",
    label: "Mac",
    title: "huu, system-wide on macOS",
    blurb:
      "A native menubar app. Select text anywhere on your Mac, hit a shortcut, and watch it rewrite in place.",
  },
  {
    id: "ios",
    label: "iOS",
    title: "huu on iPhone",
    blurb:
      "A custom keyboard that humanizes anything you type. Replies, DMs, captions — all in your voice.",
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
      "I draft with ChatGPT and finish with huu. It's the only tool that strips the AI smell without changing what I'm trying to say.",
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
    name: "James O'Connor",
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
    role: "Creator, 480k followers on X",
  },
];

const FEATURED_QUOTES = [
  {
    headline: "11x more replies",
    quote: "huu took our cold email reply rate from 1% to 11% in 14 days.",
    name: "Maya Patel",
    role: "Founder, Loomly",
  },
  {
    headline: "0 AI tells",
    quote: "I run every draft through huu before publishing. Nothing slips through.",
    name: "Daniel Cho",
    role: "Head of Content, Mercury",
  },
  {
    headline: "Sounds like me",
    quote: "It learned my voice in two presets and now everything I send sounds like I actually wrote it.",
    name: "Rina Suzuki",
    role: "Growth at Linear",
  },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    cadence: "/forever",
    blurb: "For the curious. Try huu, no card required.",
    features: ["50 rewrites / month", "All 5 tones", "1 saved preset"],
    cta: "Start free",
    accent: false,
  },
  {
    name: "Pro",
    price: "$12",
    cadence: "/month",
    blurb: "For people who write every day and want to sound like themselves.",
    features: [
      "Unlimited rewrites",
      "All 5 tones",
      "Unlimited presets",
      "History & versions",
      "Chrome extension",
    ],
    cta: "Go Pro",
    accent: true,
  },
  {
    name: "Team",
    price: "$29",
    cadence: "/seat / month",
    blurb: "For teams that ship outbound, content, or support at volume.",
    features: [
      "Everything in Pro",
      "Shared team tones",
      "Centralized billing",
      "Priority support",
    ],
    cta: "Talk to us",
    accent: false,
  },
];

const FOOTER_LINKS: { title: string; links: string[] }[] = [
  { title: "Product", links: ["Features", "Pricing", "Web Demo", "Chrome Extension", "Changelog"] },
  { title: "Use Cases", links: ["Founders", "Marketers", "Sales", "Creators", "Recruiters"] },
  { title: "Company", links: ["About", "Careers", "Blog", "Contact"] },
  { title: "Resources", links: ["Help Center", "Guides", "API", "Status", "Privacy"] },
];

type SelectionAnchor = {
  tabTop: number;
  tabLeft: number;
  popupTop: number;
  popupLeft: number;
} | null;

const POPUP_WIDTH = 340;

// ---------- Component ----------

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Email");
  const [anchor, setAnchor] = useState<SelectionAnchor>(null);
  const [expanded, setExpanded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activePersona, setActivePersona] = useState<Persona>(PERSONAS[0]);
  const [activeDevice, setActiveDevice] = useState<Device>(DEVICES[0]);
  const editorRef = useRef<HTMLDivElement>(null);
  const demoSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
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
      const relTop = rangeRect.top - sectionRect.top;
      const relHeight = rangeRect.height;

      const tabLeft = Math.min(relRight + 10, sectionWidth - 40);
      const tabTop = relTop + relHeight / 2 - 14;

      const desiredLeft = relRight + 16;
      const popupLeft = Math.min(
        Math.max(8, desiredLeft),
        sectionWidth - POPUP_WIDTH - 8
      );
      const popupTop = Math.max(8, relTop - 12);

      setAnchor({ tabTop, tabLeft, popupTop, popupLeft });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  useEffect(() => {
    setAnchor(null);
    setExpanded(false);
    window.getSelection()?.removeAllRanges();
  }, [activeTab]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Announcement banner */}
      <div className="fixed top-0 inset-x-0 z-[60] bg-black text-white text-xs sm:text-sm py-2 px-4 text-center">
        <span className="opacity-80">huu is in public beta — </span>
        <a href="#demo" className="underline underline-offset-2 hover:opacity-80">
          Get 50 free rewrites, no card →
        </a>
      </div>

      {/* Floating island header */}
      <header className="fixed top-12 sm:top-14 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
        <div
          className={`pointer-events-auto flex items-center gap-3 sm:gap-6 px-3 sm:px-4 py-2 rounded-full border transition-all duration-300 ${
            scrolled
              ? "bg-white/80 backdrop-blur-md border-black/10 shadow-md"
              : "bg-white/60 backdrop-blur border-black/[0.06] shadow-sm"
          }`}
        >
          <a
            href="#top"
            className="text-2xl text-black px-2"
            style={{
              fontFamily: "ui-serif, Georgia, serif",
              fontStyle: "italic",
            }}
          >
            huu
          </a>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 text-sm text-neutral-700 hover:text-black rounded-full hover:bg-black/[0.04] transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <a
            href="#demo"
            className="px-4 py-1.5 text-sm font-medium text-white bg-black rounded-full hover:bg-neutral-800 transition-colors"
          >
            Try it free
          </a>
        </div>
      </header>

      {/* Hero */}
      <section
        id="top"
        className="flex flex-col items-center text-center px-6 pt-44 pb-20 sm:pt-52"
      >
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.02] text-black max-w-4xl">
          Don&apos;t write like AI.
        </h1>
        <p className="text-neutral-500 text-base sm:text-lg mt-6 mb-8 max-w-xl">
          The text humanizer that turns AI-generated copy into real,
          human-sounding writing — in every app you already use.
        </p>
        <a
          href="#demo"
          className="px-6 py-2.5 text-sm font-medium text-white bg-black rounded-full hover:bg-neutral-800 transition-colors"
        >
          Try it free
        </a>
        <p className="text-xs text-neutral-400 mt-4">
          Available on Web, Chrome, Mac and iPhone
        </p>

        {/* Before / After comparison (Wispr-style) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl w-full mt-20 text-left">
          <div className="rounded-3xl bg-white border border-black/[0.08] p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                Written by AI
              </span>
            </div>
            <p className="text-[15px] leading-7 text-neutral-700">
              I hope this email finds you well. I am reaching out to introduce
              myself and explore potential synergies between our organizations.
              Based on my research, I believe there is significant value in
              connecting, and I would love to schedule a brief call at your
              earliest convenience to discuss how we might collaborate moving
              forward.
            </p>
          </div>
          <div className="rounded-3xl bg-black text-white p-6 sm:p-8 shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] uppercase tracking-widest text-amber-300">
                Rewritten with huu
              </span>
            </div>
            <p className="text-[15px] leading-7 text-neutral-200">
              Hey — saw what you&apos;re building at [company] and figured I&apos;d
              reach out. We&apos;re working on something pretty close to your
              problem space and I think there&apos;s a real shot we could be
              useful to each other. Worth a quick 15 min next week?
            </p>
          </div>
        </div>
      </section>

      {/* Brand logos */}
      <section className="w-full max-w-6xl mx-auto px-6 pb-24">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500 mb-8">
          Used by founders, marketers and creators at
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-60">
          {BRAND_LOGOS.map((brand) => (
            <span
              key={brand}
              className="text-sm sm:text-base font-semibold text-neutral-500 tracking-tight"
            >
              {brand}
            </span>
          ))}
        </div>
      </section>

      {/* "10x more replies" benefit comparison */}
      <section
        id="features"
        className="w-full max-w-6xl mx-auto px-6 pb-28"
      >
        <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4">
          Why huu
        </p>
        <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-black text-center leading-[1.05] max-w-3xl mx-auto">
          11x more replies
        </h2>
        <p className="text-neutral-500 text-base sm:text-lg mt-6 max-w-xl mx-auto text-center">
          Cold emails that sound like a human get opened, read, and replied to.
          Templates don&apos;t. huu turns one into the other in two clicks.
        </p>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-3xl bg-white border border-black/[0.08] p-7">
            <p className="text-[11px] uppercase tracking-widest text-neutral-500 mb-3">
              AI Template
            </p>
            <p className="text-4xl font-bold text-black tracking-tight mb-1">
              1%
            </p>
            <p className="text-sm text-neutral-500 mb-6">reply rate</p>
            <div className="space-y-2">
              <div className="h-1.5 rounded-full bg-neutral-100 w-full" />
              <div className="h-1.5 rounded-full bg-neutral-100 w-11/12" />
              <div className="h-1.5 rounded-full bg-neutral-100 w-3/4" />
              <div className="h-1.5 rounded-full bg-neutral-100 w-9/12" />
            </div>
          </div>
          <div className="rounded-3xl bg-black text-white p-7">
            <p className="text-[11px] uppercase tracking-widest text-amber-300 mb-3">
              huu
            </p>
            <p className="text-4xl font-bold tracking-tight mb-1">11%</p>
            <p className="text-sm text-neutral-400 mb-6">reply rate</p>
            <div className="space-y-2">
              <div className="h-1.5 rounded-full bg-amber-300 w-full" />
              <div className="h-1.5 rounded-full bg-amber-300 w-11/12" />
              <div className="h-1.5 rounded-full bg-amber-300 w-10/12" />
              <div className="h-1.5 rounded-full bg-amber-300 w-9/12" />
            </div>
          </div>
        </div>
      </section>

      {/* Web demo */}
      <section
        id="demo"
        ref={demoSectionRef}
        className="relative w-full max-w-3xl mx-auto px-6 pb-28"
      >
        <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4">
          Web Demo
        </p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-black text-center mb-3">
          Try huu, right here.
        </h2>
        <p className="text-center text-neutral-500 text-base mb-10 max-w-md mx-auto">
          No signup. Paste any AI-sounding copy, select a phrase, and rewrite it
          on the spot.
        </p>

        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white border border-black/[0.08]">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                  activeTab === tab
                    ? "bg-black text-white font-medium"
                    : "text-neutral-500 hover:text-black"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-sm text-neutral-500 mb-5">
          Select any part of the text below to unpolish it.
        </p>

        <div className="relative rounded-3xl bg-white border border-black/[0.08] shadow-sm">
          <div
            key={activeTab}
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            className="min-h-[360px] p-8 sm:p-10 text-[15px] sm:text-base leading-7 text-neutral-700 whitespace-pre-wrap selection:bg-sky-200/70 selection:text-black focus:outline-none"
          >
            {SAMPLES[activeTab]}
          </div>
        </div>

        {anchor && !expanded && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setExpanded(true);
            }}
            className="absolute z-20 w-8 h-8 rounded-full bg-amber-300 hover:bg-amber-400 border border-amber-500/40 shadow-md flex items-center justify-center text-neutral-800 transition-colors"
            style={{ top: anchor.tabTop, left: anchor.tabLeft }}
            aria-label="Open rephrase options"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
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
            className="absolute z-20"
            style={{
              top: anchor.popupTop,
              left: anchor.popupLeft,
              width: POPUP_WIDTH,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-xl p-4">
              <div className="space-y-2 mb-4">
                <div className="h-2.5 rounded-full bg-neutral-200 w-full" />
                <div className="h-2.5 rounded-full bg-neutral-200 w-11/12" />
                <div className="h-2.5 rounded-full bg-neutral-200 w-4/5" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {TONES.map((tone) => (
                    <button
                      key={tone}
                      className="px-2.5 py-1 text-[11px] rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors whitespace-nowrap"
                    >
                      {tone}
                    </button>
                  ))}
                </div>
                <button
                  aria-label="Apply"
                  className="shrink-0 w-7 h-7 rounded-full border border-amber-300 flex items-center justify-center text-neutral-700 hover:bg-amber-50 transition-colors"
                >
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
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Made for the way you write — persona tabs */}
      <section
        id="personas"
        className="w-full max-w-6xl mx-auto px-6 pb-28"
      >
        <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4">
          For the way you write
        </p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-black text-center max-w-3xl mx-auto leading-[1.1] mb-3">
          Made for the way <em className="font-bold not-italic underline decoration-amber-300 decoration-4 underline-offset-4">you</em> write
        </h2>
        <p className="text-center text-neutral-500 text-base mb-10 max-w-xl mx-auto">
          Select one to see huu in action for your role.
        </p>

        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePersona(p)}
              className={`px-4 py-2 text-sm rounded-full border transition-colors ${
                activePersona.id === p.id
                  ? "bg-black text-white border-black"
                  : "bg-white text-neutral-700 border-black/[0.08] hover:border-black/30"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="rounded-3xl bg-white border border-black/[0.08] p-8 sm:p-12 max-w-3xl mx-auto">
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-black mb-3">
            {activePersona.title}
          </h3>
          <p className="text-base sm:text-lg text-neutral-600 leading-7">
            {activePersona.blurb}
          </p>
          <div className="flex gap-3 mt-7">
            <a
              href="#demo"
              className="px-5 py-2 text-sm font-medium text-white bg-black rounded-full hover:bg-neutral-800 transition-colors"
            >
              Try it free
            </a>
            <a
              href="#pricing"
              className="px-5 py-2 text-sm font-medium text-neutral-700 hover:text-black transition-colors"
            >
              See pricing →
            </a>
          </div>
        </div>
      </section>

      {/* One tool. Your workflow. */}
      <section className="w-full max-w-6xl mx-auto px-6 pb-28">
        <div className="rounded-[2.5rem] bg-gradient-to-br from-amber-50 via-white to-emerald-50 border border-black/[0.06] p-10 sm:p-16 text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-black max-w-2xl mx-auto leading-[1.1]">
            One tool. Your workflow.
          </h2>
          <p className="text-neutral-500 text-base sm:text-lg mt-5 max-w-xl mx-auto">
            Whether you&apos;re sending cold emails, drafting LinkedIn posts, or
            replying to your group chat, huu fits into how you already work.
            Highlight, rewrite, send.
          </p>
          <a
            href="#demo"
            className="inline-block mt-8 px-6 py-2.5 text-sm font-medium text-white bg-black rounded-full hover:bg-neutral-800 transition-colors"
          >
            Try it free
          </a>
        </div>
      </section>

      {/* Core feature 1: text selection visual */}
      <section className="w-full max-w-5xl mx-auto px-6 pb-32">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4">
          Core feature · 01
        </p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-black text-center max-w-3xl mx-auto leading-[1.1] mb-4">
          Select. Rephrase. Send.
        </h2>
        <p className="text-center text-neutral-500 text-base mb-14 max-w-xl mx-auto">
          Highlight any phrase. Pick a tone. Done.
        </p>

        <div className="relative h-[360px] sm:h-[400px] max-w-3xl mx-auto">
          <div className="absolute left-0 bottom-0 w-[78%] sm:w-[70%] bg-white border border-black/[0.08] rounded-2xl shadow-md p-6 text-[13px] sm:text-sm leading-6 text-neutral-700">
            <p className="mb-3">
              <span className="bg-sky-200/70 text-black">Dear [name]</span>
            </p>
            <p>
              <span className="bg-sky-200/70 text-black">
                I hope this email finds you well. I am reaching out to introduce
                myself and explore potential synergies between our
                organizations. Based on my research, I believe there is
                significant value in connecting, and I would love to schedule a
                brief call at your earliest convenience to discuss how we might
                collaborate moving forward.
              </span>
            </p>
          </div>

          <div className="absolute right-0 top-0 w-[78%] sm:w-[62%] bg-white rounded-2xl border-2 border-amber-300 shadow-xl p-5">
            <p className="text-[13px] sm:text-sm leading-6 text-neutral-700 mb-4">
              Yo [name]
              <br />
              <br />
              Rather than a generic &ldquo;lets connect&rdquo; kind of thing, I
              think we could actually add specific value for your team, and on
              our end we&rsquo;d love to learn more about how you handle
              [something relevant to them]. Would you be up for a quick 15 min
              call this week or next?
            </p>

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {TONES.map((tone) => {
                  const isSelected = tone === "Unpolished";
                  return (
                    <span
                      key={tone}
                      className={`px-2.5 py-1 text-[11px] rounded-full whitespace-nowrap ${
                        isSelected
                          ? "bg-emerald-500 text-white"
                          : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {tone}
                    </span>
                  );
                })}
              </div>
              <span className="shrink-0 w-7 h-7 rounded-full border border-amber-300 flex items-center justify-center text-neutral-700">
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
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </span>
            </div>
          </div>
        </div>

        <p className="text-center text-sm sm:text-base text-neutral-500 mt-10 max-w-xl mx-auto">
          Pick the tone that fits — Unpolished, Raw, Informal, Shorter, or
          Humorous. huu handles the rewrite in under two seconds.
        </p>
      </section>

      {/* Core feature 2 + 3 + 4 — three columns (Wispr's Dictionary/Snippets/Languages) */}
      <section className="w-full max-w-6xl mx-auto px-6 pb-28">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4">
          Core features · 02 — 04
        </p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-black text-center max-w-3xl mx-auto leading-[1.1] mb-14">
          Built around your voice.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Tone presets */}
          <div className="bg-white border border-black/[0.08] rounded-3xl p-7">
            <h3 className="text-lg font-semibold text-black mb-2">
              Tone presets
            </h3>
            <p className="text-sm text-neutral-500 mb-5">
              Save your favourite tone combos. One click and your style is back.
            </p>
            <div className="space-y-2">
              {[
                { name: "Cold email energy", tones: ["Unpolished", "Shorter"] },
                { name: "LinkedIn brain", tones: ["Informal", "Humorous"] },
                { name: "Founder voice", tones: ["Raw", "Shorter"] },
              ].map((preset) => (
                <div
                  key={preset.name}
                  className="flex items-center justify-between p-3 rounded-xl bg-neutral-50"
                >
                  <span className="text-sm text-neutral-700">{preset.name}</span>
                  <div className="flex gap-1">
                    {preset.tones.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-black/[0.08] text-neutral-600"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Personal voice */}
          <div className="bg-white border border-black/[0.08] rounded-3xl p-7">
            <h3 className="text-lg font-semibold text-black mb-2">
              Personal voice
            </h3>
            <p className="text-sm text-neutral-500 mb-5">
              Paste 3 samples of your real writing. huu learns and rewrites in
              your style — not a generic &ldquo;casual&rdquo; preset.
            </p>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-neutral-50">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-neutral-700">
                  Sample · Tuesday memo
                </span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-neutral-50">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-neutral-700">
                  Sample · X thread on hiring
                </span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-neutral-50">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-neutral-700">
                  Sample · Investor update Q3
                </span>
              </div>
            </div>
          </div>

          {/* 30+ languages */}
          <div className="bg-white border border-black/[0.08] rounded-3xl p-7">
            <h3 className="text-lg font-semibold text-black mb-2">
              30+ languages
            </h3>
            <p className="text-sm text-neutral-500 mb-5">
              huu detects the language and rewrites in it — automatically.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                "English",
                "Français",
                "Español",
                "Deutsch",
                "Português",
                "日本語",
                "한국어",
                "中文",
                "Bahasa",
                "Italiano",
                "Polski",
                "Türkçe",
              ].map((lang) => (
                <span
                  key={lang}
                  className="text-xs px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700"
                >
                  {lang}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Device tabs */}
      <section className="w-full max-w-6xl mx-auto px-6 pb-28">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4">
          Every device
        </p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-black text-center max-w-3xl mx-auto leading-[1.1] mb-3">
          huu, wherever you write.
        </h2>
        <p className="text-center text-neutral-500 text-base mb-10 max-w-xl mx-auto">
          Native on the platforms you already use. Your tone, presets and voice
          sync across all of them.
        </p>

        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white border border-black/[0.08]">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveDevice(d)}
                className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                  activeDevice.id === d.id
                    ? "bg-black text-white font-medium"
                    : "text-neutral-500 hover:text-black"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] bg-white border border-black/[0.08] p-8 sm:p-12 max-w-4xl mx-auto">
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-black mb-3">
            {activeDevice.title}
          </h3>
          <p className="text-base sm:text-lg text-neutral-600 leading-7 max-w-xl">
            {activeDevice.blurb}
          </p>

          {/* Placeholder mock window */}
          <div className="mt-8 rounded-2xl bg-neutral-50 border border-black/[0.06] aspect-[16/9] flex items-center justify-center">
            <span className="text-sm text-neutral-400">
              {activeDevice.label} mockup
            </span>
          </div>
        </div>
      </section>

      {/* Featured quotes */}
      <section className="w-full max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURED_QUOTES.map((q) => (
            <div
              key={q.headline}
              className="rounded-3xl bg-black text-white p-7"
            >
              <p className="text-3xl font-bold tracking-tight text-amber-300 mb-3">
                {q.headline}
              </p>
              <p className="text-sm text-neutral-200 leading-6 mb-5">
                &ldquo;{q.quote}&rdquo;
              </p>
              <div className="text-xs text-neutral-400">
                <span className="font-medium text-white">{q.name}</span> ·{" "}
                {q.role}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Love letters / testimonials grid */}
      <section className="w-full max-w-6xl mx-auto px-6 pb-32">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4">
          Love letters
        </p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-black text-center max-w-3xl mx-auto leading-[1.1] mb-14">
          Love letters to huu
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="rounded-3xl bg-white border border-black/[0.08] p-7"
            >
              <p className="text-base text-neutral-700 leading-7 mb-5">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="text-sm">
                <span className="font-medium text-black">{t.name}</span>
                <span className="text-neutral-500"> · {t.role}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="w-full max-w-5xl mx-auto px-6 pb-32">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4">
          Pricing
        </p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-black text-center max-w-3xl mx-auto leading-[1.1] mb-14">
          Simple, honest pricing.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PRICING.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-3xl p-7 flex flex-col ${
                tier.accent
                  ? "bg-black text-white border border-black"
                  : "bg-white border border-black/[0.08]"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                {tier.accent && (
                  <span className="text-[10px] uppercase tracking-widest bg-amber-300 text-black px-2 py-0.5 rounded-full">
                    Popular
                  </span>
                )}
              </div>
              <p
                className={`text-sm mb-6 ${
                  tier.accent ? "text-neutral-300" : "text-neutral-500"
                }`}
              >
                {tier.blurb}
              </p>
              <div className="flex items-baseline mb-6">
                <span className="text-4xl font-bold tracking-tight">
                  {tier.price}
                </span>
                <span
                  className={`ml-1 text-sm ${
                    tier.accent ? "text-neutral-400" : "text-neutral-500"
                  }`}
                >
                  {tier.cadence}
                </span>
              </div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {tier.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                        tier.accent ? "bg-amber-300" : "bg-emerald-500"
                      }`}
                    />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <a
                href="#"
                className={`block text-center px-4 py-2.5 text-sm font-medium rounded-full transition-colors ${
                  tier.accent
                    ? "bg-amber-300 text-black hover:bg-amber-200"
                    : "bg-black text-white hover:bg-neutral-800"
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Start sounding human CTA */}
      <section className="w-full max-w-6xl mx-auto px-6 pb-32">
        <div className="rounded-[2.5rem] bg-black text-white px-8 py-20 sm:py-28 text-center">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05] max-w-3xl mx-auto">
            Start sounding human.
          </h2>
          <p className="text-neutral-400 text-base sm:text-lg mt-6 mb-10 max-w-md mx-auto">
            50 free rewrites. No card. No catch. Available on Web, Chrome, Mac
            and iPhone.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
            <a
              href="#demo"
              className="px-6 py-2.5 text-sm font-medium text-black bg-white rounded-full hover:bg-neutral-200 transition-colors"
            >
              Try it free
            </a>
            <a
              href="#pricing"
              className="px-6 py-2.5 text-sm font-medium text-white border border-white/20 rounded-full hover:bg-white/10 transition-colors"
            >
              See pricing
            </a>
          </div>
        </div>
      </section>

      {/* Ask ChatGPT / Claude / Perplexity */}
      <section className="w-full max-w-3xl mx-auto px-6 pb-32 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-black max-w-xl mx-auto mb-3">
          Still not sure that huu is right for you?
        </h2>
        <p className="text-neutral-500 text-base mb-8 max-w-md mx-auto">
          Let ChatGPT, Claude or Perplexity do the thinking for you. Click and
          see what your favourite AI says about huu.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {["Ask ChatGPT", "Ask Claude", "Ask Perplexity"].map((label) => (
            <a
              key={label}
              href="#"
              className="px-5 py-2 text-sm font-medium text-black bg-white border border-black/[0.08] rounded-full hover:bg-neutral-100 transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/[0.08] bg-white">
        <div className="w-full max-w-6xl mx-auto px-6 py-14 grid grid-cols-2 sm:grid-cols-5 gap-8">
          <div className="col-span-2 sm:col-span-1">
            <span
              className="text-3xl text-black"
              style={{
                fontFamily: "ui-serif, Georgia, serif",
                fontStyle: "italic",
              }}
            >
              huu
            </span>
            <p className="text-sm text-neutral-500 mt-3 max-w-[14rem]">
              Make your AI copy sound like you wrote it.
            </p>
          </div>

          {FOOTER_LINKS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs uppercase tracking-widest text-neutral-500 mb-3">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-neutral-700 hover:text-black transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-black/[0.06]">
          <div className="w-full max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs text-neutral-500">
              © {new Date().getFullYear()} Huumanity. All rights reserved.
            </p>
            <p className="text-xs text-neutral-500">
              Built for people who don&apos;t want to sound like a robot.
            </p>
          </div>
        </div>

        {/* Giant wordmark — like Wispr's huge "Flow" at the bottom */}
        <div className="overflow-hidden">
          <div
            className="text-center text-black/80 leading-none select-none pointer-events-none px-4 pb-2"
            style={{
              fontFamily: "ui-serif, Georgia, serif",
              fontStyle: "italic",
              fontSize: "clamp(8rem, 24vw, 20rem)",
            }}
          >
            huu
          </div>
        </div>
      </footer>
    </div>
  );
}
