"use client";

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUser, useClerk, useAuth } from "@clerk/nextjs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalRewritePanel } from "../components/ExternalRewritePanel";
import { ScratchpadEditor } from "../components/ScratchpadEditor";
import { HuuLogo } from "../components/HuuLogo";

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "home" | "scratchpad";
type SettingsTab = "account" | "billing";
type AuthState = "login" | "signing-in" | "verified" | "app";
type Plan = "free" | "pro";

type SubscriptionStatus = {
  plan: Plan;
  usageCount: number;
  limit: number;
  unlimited: boolean;
  remaining: number | null;
  resetsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
};

type SelectorHealth = {
  accessibilityAllowed: boolean;
  watcherRunning: boolean;
  status: string;
  hasSelection: boolean;
  canReplace: boolean;
  selectionLen: number;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function IcHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IcScratchpad() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IcSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}


function IcChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IcChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IcArrowUpRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { label: string; view: View; icon: React.ReactNode }[] = [
  { label: "Home", view: "home", icon: <IcHome /> },
  { label: "Scratchpad", view: "scratchpad", icon: <IcScratchpad /> },
];

// Detect the Tauri desktop shell. The desktop app now loads the live site
// (huumanity.app/editor) directly, so it shares the website's origin and we can
// no longer sniff `location.origin`. Tauri injects `__TAURI_INTERNALS__` into the
// windows it controls, which is present in the desktop app but not a browser.
function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Human-readable "time until the rolling 24h window resets", e.g. "6h 20m".
function formatResetIn(iso?: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "soon";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h >= 1 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function EditorPage() {
  // Auth
  const [authState, setAuthState] = useState<AuthState>("login");

  // Clerk user (available once authState === "app")
  const { user, isLoaded: clerkLoaded } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();

  // True while redeeming a sign-in ticket from a `huu://open?ticket=…` deep link.
  const [redeeming, setRedeeming] = useState(false);

  // UI
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<View>("home");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Subscription / usage
  const [subscription, setSubscription] = useState<SubscriptionStatus>({
    plan: process.env.NEXT_PUBLIC_TEST_PRO === "true" ? "pro" : "free",
    usageCount: 0,
    limit: 10,
    unlimited: process.env.NEXT_PUBLIC_TEST_PRO === "true",
    remaining: process.env.NEXT_PUBLIC_TEST_PRO === "true" ? null : 10,
  });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [selectedPrice, setSelectedPrice] = useState<"monthly" | "annual">("monthly");

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("annual");

  // Setup
  const [hasCompletedSetup, setHasCompletedSetup] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("huu_desktop_setup_complete") === "true";
  });
  const [accessibilityAllowed, setAccessibilityAllowed] = useState(false);
  const [detectorStatus, setDetectorStatus] = useState(
    "Waiting for Accessibility permission."
  );
  const [selectorHealth, setSelectorHealth] = useState<SelectorHealth | null>(
    null
  );
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  // Capture
  const [capturedText, setCapturedText] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [showRewritePanel, setShowRewritePanel] = useState(false);

  // ── Callbacks ──────────────────────────────────────────────────────────────

  // The desktop app and the website now share an origin (huumanity.app in
  // release, localhost in dev), so all API calls are same-origin and the Clerk
  // session cookie is sent automatically. Relative paths are correct everywhere;
  // NEXT_PUBLIC_HUMANIZE_API_URL stays as an explicit override if ever needed.
  const humanizeEndpoint = useCallback(() => {
    return process.env.NEXT_PUBLIC_HUMANIZE_API_URL ?? "/api/humanize";
  }, []);

  const apiBase = useCallback(() => "", []);

  const fetchSubscription = useCallback(async () => {
    // Skip real fetch when test mode is active — initial state already set to Pro
    if (process.env.NEXT_PUBLIC_TEST_PRO === "true") return;
    try {
      const res = await fetch(`${apiBase()}/api/subscription/status`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data: SubscriptionStatus = await res.json();
      setSubscription(data);
    } catch {
      // silently fail — UI degrades gracefully
    }
  }, [apiBase]);

  const handleUpgradeClick = useCallback(async (priceType: "monthly" | "annual" = "monthly") => {
    setCheckoutLoading(true);
    setCheckoutError("");
    const tauri = isTauriRuntime();
    // On the website, open a blank tab synchronously so it isn't popup-blocked.
    // In the desktop shell we navigate the app window itself instead.
    const tab = tauri ? null : window.open("", "_blank");
    try {
      const priceId =
        priceType === "annual"
          ? (process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL ?? "price_1TgPXi2ceurudS1gBxkZIf6D")
          : (process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ?? "price_1TgPXi2ceurudS1gl7UZeNmZ");

      const res = await fetch(`${apiBase()}/api/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `desktop` tells the server to send Stripe's success_url to the
        // /payment-success handoff page (which deep-links back into the app)
        // instead of straight to /editor.
        body: JSON.stringify({ priceId, desktop: tauri }),
      });
      const text = await res.text();
      let data: { url?: string; error?: string } = {};
      try { data = JSON.parse(text); } catch { /* non-JSON response */ }
      if (!res.ok || !data.url) {
        tab?.close();
        setCheckoutError(data.error ?? `Server error ${res.status}. Check that STRIPE_SECRET_KEY is set in Vercel.`);
        return;
      }

      if (tauri) {
        // Desktop: open Stripe in the system browser. After payment Stripe
        // redirects to /payment-success, whose "Open huumanity" button deep-links
        // back into the app with a fresh session token + the upgraded flag.
        try {
          await openUrl(data.url);
        } catch {
          window.location.assign(data.url);
        }
        return;
      }

      // Website: navigate the already-open tab to the Stripe checkout URL
      tab!.location.href = data.url;
      // Poll for upgrade after payment
      const poll = window.setInterval(async () => {
        try {
          const statusRes = await fetch(`${apiBase()}/api/subscription/status`, { cache: "no-store" });
          const status: SubscriptionStatus = await statusRes.json();
          if (status.plan === "pro") {
            setSubscription(status);
            setSettingsOpen(false);
            window.clearInterval(poll);
          }
        } catch { /* ignore poll errors */ }
      }, 3000);
      window.setTimeout(() => window.clearInterval(poll), 600_000);
    } catch (err) {
      tab?.close();
      setCheckoutError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setCheckoutLoading(false);
    }
  }, [apiBase]);

  const handleManageBilling = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase()}/api/stripe/portal`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    } catch {
      // ignore
    }
  }, [apiBase]);

  const handleSaveProfile = useCallback(async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      await user.update({
        firstName: editFirstName.trim() || undefined,
        lastName: editLastName.trim() || undefined,
      });
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 2500);
    } catch {
      // ignore Clerk error
    } finally {
      setIsSavingProfile(false);
    }
  }, [user, editFirstName, editLastName]);

  const refreshAccessibilityPermission = useCallback(async () => {
    try {
      const allowed = await invoke<boolean>("check_accessibility_permission");
      setAccessibilityAllowed(allowed);
      setDetectorStatus(
        allowed
          ? "Selector is running. Highlight text in any app to use huu."
          : "Allow huu in macOS Accessibility to enable desktop selection."
      );
      return allowed;
    } catch (err) {
      setAccessibilityAllowed(false);
      setDetectorStatus(`Could not check Accessibility permission — ${String(err)}`);
      return false;
    }
  }, []);

  const refreshApiConnection = useCallback(async () => {
    try {
      const response = await fetch(humanizeEndpoint(), {
        method: "OPTIONS",
        cache: "no-store",
      });
      setApiConnected(response.status < 500);
    } catch {
      setApiConnected(false);
    }
  }, [humanizeEndpoint]);

  const refreshSelectorHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const health = await invoke<SelectorHealth>("get_selector_health");
      setSelectorHealth(health);
      setAccessibilityAllowed(health.accessibilityAllowed);
      setDetectorStatus(
        health.accessibilityAllowed
          ? health.status
          : "Allow huu in macOS Accessibility to enable desktop selection."
      );
      await refreshApiConnection();
      return health;
    } catch (err) {
      setSelectorHealth(null);
      setDetectorStatus(`Could not read selector health — ${String(err)}`);
      return null;
    } finally {
      setIsCheckingHealth(false);
    }
  }, [refreshApiConnection]);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Restore auth state — Clerk session takes priority over localStorage.
  // This means if the user already has an active Clerk session in the browser
  // (e.g. signed in at huumanity.app), they skip the login screen entirely.
  // For the Tauri app where Clerk cookies may not carry over, localStorage is
  // the fallback that the sign-in flow writes to.
  useEffect(() => {
    if (!clerkLoaded) return; // wait for Clerk to finish resolving the session
    if (user) {
      // Active Clerk session detected — mark as logged in and go straight to app
      localStorage.setItem("huu_logged_in", "true");
      setAuthState("app");
      return;
    }
    // No Clerk session — check the localStorage flag set by the Tauri sign-in flow
    if (localStorage.getItem("huu_logged_in") === "true") {
      setAuthState("app");
    }
  }, [clerkLoaded, user]);

  // Redeem a one-time sign-in ticket delivered by the `huu://open?ticket=…` deep
  // link. This is how the desktop app picks up the session created in the system
  // browser. We hand the ticket to Clerk's <SignIn> via the `__clerk_ticket`
  // query param, which it processes automatically and then redirects to `next`,
  // landing back in the editor with the session live in the app's own webview.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("ticket");
    if (!ticket) return;

    setRedeeming(true);
    const next = params.get("upgraded") === "true" ? "/editor?upgraded=true" : "/editor";
    window.location.assign(
      `/sign-in?__clerk_ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent(next)}`
    );
  }, []);

  // Seed name fields when Clerk user loads
  useEffect(() => {
    if (!user) return;
    setEditFirstName(user.firstName ?? "");
    setEditLastName(user.lastName ?? "");
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (authState !== "app") return;
    const id = window.setTimeout(() => {
      void refreshAccessibilityPermission();
      void refreshSelectorHealth();
      void fetchSubscription();
    }, 0);
    return () => window.clearTimeout(id);
  }, [authState, refreshAccessibilityPermission, refreshSelectorHealth, fetchSubscription]);

  // Refresh subscription every 30s to pick up webhook-triggered upgrades
  useEffect(() => {
    if (authState !== "app") return;
    const id = window.setInterval(() => void fetchSubscription(), 30_000);
    return () => window.clearInterval(id);
  }, [authState, fetchSubscription]);

  // Session-token pump for the native selector. The selector overlay runs on
  // tauri://localhost and CANNOT send the Clerk cookie cross-origin to the
  // rewrite API, so without a token its rewrites look anonymous and never count
  // against the daily limit. This authenticated editor window mints a fresh
  // short-lived Clerk token (~60s lifetime) and hands it to the Rust layer.
  //
  // Two delivery paths, because a Clerk token lives only ~60s and a hidden
  // window's setInterval gets throttled by the OS to >60s (the token then
  // expires exactly when you're using the selector in another app — the old
  // "Open huumanity and sign in" bug):
  //   1. A periodic backup pump (every 20s while visible).
  //   2. On-demand: Rust fires `huu-mint-token` right before the selector
  //      needs a token; we mint immediately and push it back. Event-driven
  //      wakeups are far more reliable than background timers under throttling.
  // Only runs inside the desktop app.
  useEffect(() => {
    if (authState !== "app" || !isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const pump = async () => {
      try {
        const token = await getToken();
        if (!cancelled) await invoke("set_session_token", { token: token ?? null });
      } catch {
        /* transient; next tick / next request retries */
      }
    };

    // Mint on first run and whenever the window becomes visible again.
    void pump();
    const onVisible = () => {
      if (document.visibilityState === "visible") void pump();
    };
    document.addEventListener("visibilitychange", onVisible);

    // On-demand mint requested by the selector (via Rust).
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen("huu-mint-token", () => void pump());
      if (cancelled) stop();
      else unlisten = stop;
    })();

    const id = window.setInterval(pump, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      unlisten?.();
    };
  }, [authState, getToken]);

  // After a successful Stripe checkout, Stripe redirects to /editor?upgraded=true.
  // Immediately show the Pro UI optimistically, then do a real fetch to confirm.
  // Clean the query param from the URL so refreshing doesn't re-trigger.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") !== "true") return;
    // Optimistically flip to Pro
    setSubscription({ plan: "pro", usageCount: 0, limit: 0, unlimited: true, remaining: null });
    // Remove the query param cleanly
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);
    // Confirm with server once auth is ready (retry a few times)
    let tries = 0;
    const confirm = window.setInterval(async () => {
      tries++;
      try {
        const res = await fetch(`${apiBase()}/api/subscription/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data: SubscriptionStatus = await res.json();
        if (data.plan === "pro") {
          setSubscription(data);
          window.clearInterval(confirm);
        }
      } catch { /* ignore */ }
      if (tries >= 10) window.clearInterval(confirm); // give up after ~30s
    }, 3000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep link into Plans & Billing. The desktop selector's "Upgrade to Pro"
  // button (shown when the daily rewrite limit is reached) navigates the editor
  // window to /editor?settings=billing; open the settings modal on the billing
  // tab, then clean the param so a refresh doesn't re-open it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("settings") !== "billing") return;
    setSettingsTab("billing");
    setSettingsOpen(true);
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);
  }, []);

useEffect(() => {
    if (authState !== "app") return;
    const id = window.setInterval(() => void refreshSelectorHealth(), 3000);
    return () => window.clearInterval(id);
  }, [authState, refreshSelectorHealth]);

  // NOTE: the automatic "show the dot when text is selected" behavior lives
  // entirely in Rust now (a native mouse-up event tap — see
  // `start_selection_watcher` in src-tauri/src/lib.rs). A JS polling loop used
  // to ALSO call `show_selector_window` here every 500ms, which fought the Rust
  // watcher: it re-positioned the dot at the selection's raw top-left bounds on
  // every poll, causing the button to "chase" the cursor and land off the text
  // line. That loop has been removed so Rust is the single source of truth for
  // when and where the dot appears.

  // ── Handlers ───────────────────────────────────────────────────────────────

  const openAccessibilitySettings = async () => {
    try {
      await invoke("request_accessibility_permission");
      await invoke("open_accessibility_settings");
    } catch (err) {
      setCaptureError(
        `Could not open Accessibility settings — ${String(err)}. Open System Settings → Privacy & Security → Accessibility and enable huu.`
      );
    }
  };

  const openInputMonitoringSettings = async () => {
    try {
      await invoke("open_input_monitoring_settings");
    } catch (err) {
      setCaptureError(
        `Could not open Input Monitoring settings — ${String(err)}. Open System Settings → Privacy & Security → Input Monitoring and enable huu.`
      );
    }
  };

  const captureSelectedText = async () => {
    setIsCapturing(true);
    setCaptureError("");
    setShowRewritePanel(false);
    try {
      const text = await invoke<string>("capture_selected_text");
      setCapturedText(text);
      setShowRewritePanel(true);
    } catch (err) {
      setCapturedText("");
      setCaptureError(
        typeof err === "string"
          ? err
          : "Could not read selected text. Enable Accessibility permission for huu."
      );
    } finally {
      setIsCapturing(false);
    }
  };

  const closeRewritePanel = () => {
    setShowRewritePanel(false);
    setCapturedText("");
  };

  const completeSetup = () => {
    localStorage.setItem("huu_desktop_setup_complete", "true");
    setHasCompletedSetup(true);
  };

  const handleSignIn = async () => {
    if (isTauriRuntime()) {
      // Desktop: sign in / sign up in the system browser. The success page
      // (/app-verified) hands a one-time sign-in token back via the
      // `huu://open?ticket=…` deep link, which this app redeems on return.
      setAuthState("signing-in"); // show the "finish in your browser" screen
      try {
        await openUrl("https://huumanity.app/sign-up?next=/app-verified");
      } catch {
        // Opener unavailable (old build) — fall back to in-window navigation.
        window.location.assign("/sign-up?next=/app-verified");
      }
      return;
    }
    // Website: normal in-window sign-in.
    window.location.assign("/sign-in?redirect_url=/editor");
  };

  // ── Auth: Login screen ─────────────────────────────────────────────────────

  if (authState === "login") {
    return (
      <main className="flex h-screen w-screen overflow-hidden bg-white text-black">
        {/* Left panel — sign-in */}
        <div className="flex w-full flex-col justify-center px-10 sm:w-[46%]">
          {/* Logo */}
          <div className="mb-10">
            <HuuLogo className="text-4xl" />
          </div>

          <h1 className="font-display text-4xl sm:text-5xl leading-[1.1] text-black">
            Let&apos;s get you started
          </h1>
          <p className="mt-3 max-w-xs text-base text-neutral-500 leading-7">
            Sign in to your huumanity account to unlock rewrites across every
            app on your Mac.
          </p>

          <button
            onClick={handleSignIn}
            className="mt-8 flex w-full max-w-[340px] items-center justify-center gap-2 rounded-xl bg-black px-6 py-4 text-sm font-black text-white transition hover:bg-neutral-900"
          >
            Sign in via browser
            <IcArrowUpRight />
          </button>

          <p className="mt-6 text-xs text-neutral-500 leading-5 max-w-[340px]">
            By signing up, you agree to our{" "}
            <a
              href="https://huumanity.app/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-black underline underline-offset-2"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="https://huumanity.app/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-black underline underline-offset-2"
            >
              Privacy Policy
            </a>.
          </p>
        </div>

        {/* Right panel — workspace mockup illustrating the "works in any app"
            value prop, in the spirit of Wispr Flow's onboarding hero. */}
        <div className="hidden sm:flex sm:w-[54%] flex-col items-center justify-center bg-[#f5f4ef] px-10 py-16 relative overflow-hidden">
          <div className="text-center mb-10">
            <h2 className="font-display text-5xl text-black leading-[1.08]">
              Works inside every app.
              <br />
              <span className="text-neutral-500">No copy-paste needed.</span>
            </h2>
          </div>

          {/* Notion-style workspace mockup */}
          <div className="w-full max-w-md rounded-2xl bg-white shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-black/[0.06] overflow-hidden">
            {/* Top chrome — fake browser dots + page title */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-black/5 bg-neutral-50">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
              <span className="ml-3 text-[11px] font-semibold text-neutral-400">
                Untitled — Notion
              </span>
            </div>

            {/* Page body */}
            <div className="px-6 py-6">
              <h3 className="font-display text-xl text-black mb-3">
                Launch announcement
              </h3>

              {/* Paragraph 1 — plain copy */}
              <p className="text-[13px] leading-[1.7] text-neutral-700 mb-3">
                Today, we&apos;re excited to share a new chapter in our journey.
              </p>

              {/* Paragraph 2 — selected AI-sounding text, highlighted */}
              <p className="text-[13px] leading-[1.7] text-neutral-700 relative">
                <span className="bg-[#fff700]/40 box-decoration-clone px-0.5 rounded-sm">
                  In today&apos;s rapidly evolving landscape, leveraging
                  cutting-edge solutions to drive impactful outcomes has never
                  been more critical.
                </span>

                {/* Floating yellow huu button anchored to the highlight */}
                <span
                  className="absolute -right-3 -top-7 inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-[#fff700] px-3 py-1 text-[11px] font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.18)]"
                  aria-hidden="true"
                >
                  <span className="font-display text-sm leading-none">huu</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </span>
              </p>

              <p className="text-[13px] leading-[1.7] text-neutral-300 mt-3">
                The implications truly cannot be overstated. Stay tuned…
              </p>
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-neutral-500 max-w-xs leading-6">
            Highlight any text in any app. huu rewrites it so it sounds like a
            real person.
          </p>
        </div>
      </main>
    );
  }

  // ── Auth: Redeeming a sign-in ticket from the deep link ────────────────────

  if (redeeming) {
    return (
      <main className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-white text-black">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-black/15 border-t-black" />
        <p className="text-sm font-bold text-neutral-500">Signing you in…</p>
      </main>
    );
  }

  // ── Auth: Waiting for the user to finish in the system browser ─────────────

  if (authState === "signing-in") {
    return (
      <main className="flex h-screen w-screen flex-col items-center overflow-y-auto bg-white text-black">
        {/* Top bar — back button to return to the menu at any time */}
        <div className="flex w-full max-w-lg items-center px-6 pt-8">
          <button
            onClick={() => setAuthState("login")}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 -ml-2 text-sm font-bold text-neutral-500 transition hover:text-black"
          >
            <IcChevronLeft />
            Back
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-12 text-center max-w-sm mx-auto">
          <span className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[#fff700] ring-2 ring-black shadow-[0_4px_0_rgba(0,0,0,0.12)]">
            <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-black/20 border-t-black" />
          </span>
          <div>
            <h1 className="font-display text-3xl leading-tight">
              Finish signing in
            </h1>
            <p className="mt-2 text-sm text-neutral-500 leading-6">
              We opened your browser to sign in. Once you&apos;re done, click{" "}
              <span className="font-bold text-black">Open huumanity</span> and
              you&apos;ll land right back here.
            </p>
          </div>
          <button
            onClick={handleSignIn}
            className="text-sm font-bold text-neutral-500 underline underline-offset-4 transition hover:text-black"
          >
            Didn&apos;t open? Try again
          </button>
        </div>
      </main>
    );
  }

  // ── Auth: Verified screen ──────────────────────────────────────────────────

  if (authState === "verified") {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-white text-black">
        <div className="flex flex-col items-center gap-6 max-w-xs text-center px-6">
          <span className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[#fff700] text-3xl ring-2 ring-black shadow-[0_4px_0_rgba(0,0,0,0.12)]">
            ✦
          </span>
          <div>
            <h1 className="font-display text-4xl leading-tight">
              You&apos;re in.
            </h1>
            <p className="mt-2 text-sm text-neutral-500 leading-6">
              Your huumanity account is connected. huu is ready to rewrite text
              anywhere on your Mac.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <button
              onClick={() => setAuthState("app")}
              className="w-full rounded-xl bg-black py-4 text-sm font-black text-[#fff700] transition hover:bg-neutral-900"
            >
              Open huu &rarr;
            </button>
            <button
              onClick={() => window.close()}
              className="w-full rounded-xl border-2 border-black/10 py-3 text-sm font-bold text-neutral-500 transition hover:border-black hover:text-black"
            >
              Close window
            </button>
          </div>
          <p className="text-[11px] text-neutral-400">
            You can always reopen huu from your Applications folder.
          </p>
        </div>
      </main>
    );
  }

  // ── Derived: selector health rows ──────────────────────────────────────────

  const selectorHealthRows = [
    {
      label: "Accessibility",
      value: selectorHealth?.accessibilityAllowed ? "Allowed" : "Blocked",
      ok: Boolean(selectorHealth?.accessibilityAllowed),
    },
    {
      label: "Watcher",
      value: selectorHealth?.watcherRunning ? "Running" : "Not running",
      ok: Boolean(selectorHealth?.watcherRunning),
    },
    {
      label: "Selection",
      value: selectorHealth?.hasSelection
        ? `${selectorHealth.selectionLen} chars`
        : "Nothing yet",
      ok: Boolean(selectorHealth?.hasSelection),
    },
    {
      label: "Mode",
      value: selectorHealth?.hasSelection
        ? selectorHealth.canReplace
          ? "Text box"
          : "Read-only"
        : "—",
      ok: Boolean(selectorHealth?.hasSelection),
    },
    {
      label: "API",
      value:
        apiConnected === null
          ? "—"
          : apiConnected
            ? "Connected"
            : "Disconnected",
      ok: Boolean(apiConnected),
    },
  ];

  // ── Main app ───────────────────────────────────────────────────────────────

  return (
    <main className="flex h-screen overflow-hidden bg-white text-black">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`relative flex flex-col border-r border-black/[0.07] bg-[#fafaf8] transition-[width] duration-300 ease-in-out overflow-hidden shrink-0 ${
          sidebarOpen ? "w-[272px]" : "w-[56px]"
        }`}
      >
        {/* Logo + toggle */}
        <div className="flex h-14 shrink-0 items-center border-b border-black/[0.06] px-3">
          {sidebarOpen && (
            <span className="pl-1">
              <HuuLogo className="text-2xl" />
            </span>
          )}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-black/5 hover:text-black ${
              sidebarOpen ? "ml-auto" : "mx-auto"
            }`}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <IcChevronLeft /> : <IcChevronRight />}
          </button>
        </div>

        {/* Nav items — Home, Scratchpad, Settings */}
        <nav className="flex-1 space-y-0.5 overflow-hidden p-2 pt-3">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => setActiveView(item.view)}
                title={!sidebarOpen ? item.label : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-bold transition ${
                  isActive
                    ? "bg-black text-white"
                    : "text-neutral-600 hover:bg-black/5 hover:text-black"
                }`}
              >
                <span className={`shrink-0 ${isActive ? "text-[#fff700]" : ""}`}>
                  {item.icon}
                </span>
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}

          {/* Settings — opens modal, sits below Scratchpad */}
          <button
            title={!sidebarOpen ? "Settings" : undefined}
            onClick={() => { setSettingsTab("account"); setSettingsOpen(true); }}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-bold text-neutral-600 transition hover:bg-black/5 hover:text-black"
          >
            <span className="shrink-0"><IcSettings /></span>
            {sidebarOpen && <span className="truncate">Settings</span>}
          </button>
        </nav>

        {/* Bottom — upgrade widget only, fills the available space */}
        <div className="border-t border-black/[0.06] p-3">
          {sidebarOpen ? (
            subscription.plan === "pro" ? (
              <div className="rounded-2xl border-2 border-black bg-black p-5">
                <p className="text-sm font-black text-[#fff700]">Pro plan</p>
                <p className="mt-1.5 text-xs text-white/50 leading-5">
                  Unlimited rewrites.
                </p>
                <button
                  onClick={() => { setSettingsTab("billing"); setSettingsOpen(true); }}
                  className="mt-4 w-full rounded-xl border border-white/20 py-2.5 text-xs font-bold text-white/60 transition hover:border-white/40 hover:text-white"
                >
                  Manage billing
                </button>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#fff700] p-5">
                <p className="text-base font-black text-black leading-6">
                  {subscription.remaining ?? 0} rewrite{subscription.remaining !== 1 ? "s" : ""} left
                </p>
                <p className="mt-2 text-xs text-black/60 leading-5">
                  Upgrade to huumanity Pro to have unlimited rewrites.
                </p>
                <button
                  onClick={() => { setSettingsTab("billing"); setSettingsOpen(true); }}
                  className="mt-4 w-full rounded-xl bg-black py-3 text-sm font-black text-[#fff700] transition hover:bg-neutral-900"
                >
                  Upgrade to Pro
                </button>
              </div>
            )
          ) : (
            /* Collapsed sidebar — just show the upgrade icon */
            subscription.plan !== "pro" && (
              <button
                title="Upgrade to Pro"
                onClick={() => { setSettingsTab("billing"); setSettingsOpen(true); }}
                className="flex w-full items-center justify-center rounded-xl bg-[#fff700] py-2.5 transition hover:brightness-95"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            )
          )}
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <section className="flex flex-1 flex-col overflow-hidden bg-white">

        {/* Top bar — account menu lives here */}
        <header className="flex h-12 shrink-0 items-center justify-end border-b border-black/[0.06] px-5">
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-[#fff700] text-xs font-black transition hover:opacity-80"
              aria-label="Account menu"
            >
              {user?.firstName?.[0]?.toUpperCase() ??
               user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ??
               "U"}
            </button>

            {userMenuOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setUserMenuOpen(false)}
                />
                {/* Dropdown */}
                <div className="absolute right-0 top-10 z-40 w-72 overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-xl">
                  {/* User info */}
                  <div className="flex items-center gap-3 border-b border-black/[0.07] px-4 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-[#fff700] text-sm font-black">
                      {user?.firstName?.[0]?.toUpperCase() ??
                       user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ??
                       "U"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-black">
                        {user?.fullName ?? user?.firstName ?? "Account"}
                      </p>
                      <p className="truncate text-xs text-neutral-400">
                        {user?.emailAddresses?.[0]?.emailAddress ?? ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                      subscription.plan === "pro"
                        ? "bg-black text-[#fff700] border border-[#fff700]/30"
                        : "bg-[#fff700] text-black"
                    }`}>
                      {subscription.plan === "pro" ? "Pro" : "Free"}
                    </span>
                  </div>

                  {/* Menu items */}
                  <div className="p-1.5 space-y-0.5">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setSettingsTab("account");
                        setSettingsOpen(true);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-black/5 hover:text-black"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                      Manage account
                    </button>
                    {subscription.plan === "pro" ? (
                      <button
                        onClick={() => { setUserMenuOpen(false); void handleManageBilling(); }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-black/5 hover:text-black"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                        </svg>
                        Manage billing
                      </button>
                    ) : (
                      <button
                        onClick={() => { setUserMenuOpen(false); setSettingsTab("billing"); setSettingsOpen(true); }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-black/5 hover:text-black"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                        </svg>
                        Upgrade to Pro
                      </button>
                    )}
                  </div>

                  {/* Sign out */}
                  <div className="border-t border-black/[0.07] p-1.5">
                    <button
                      onClick={() => {
                        void signOut();
                        localStorage.removeItem("huu_logged_in");
                        setAuthState("login");
                        setUserMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto">
        {activeView === "scratchpad" ? (

          /* ── SCRATCHPAD VIEW ── */
          <div className="p-8">
            <ScratchpadEditor
              limitReached={subscription.remaining === 0 && !subscription.unlimited}
              onUpgradeRequired={() => { setSettingsTab("billing"); setSettingsOpen(true); }}
            />
          </div>

        ) : !hasCompletedSetup ? (

          /* ── SETUP VIEW ── */
          <div className="flex-1 p-8">
            <div className="max-w-2xl">
              <p className="mb-1 text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                First run setup
              </p>
              <h1 className="font-display text-4xl leading-tight mb-8">
                Set up desktop selector
              </h1>

              <div className="space-y-4">

                {/* Step 1 — Accessibility */}
                <div className="rounded-2xl border border-black/[0.08] bg-white p-6 shadow-sm">
                  <p className="font-black text-base mb-1">
                    1. Allow desktop control
                  </p>
                  <p className="text-sm text-neutral-500 leading-6 mb-4">
                    huu needs macOS Accessibility permission so it can read the
                    text you highlighted, place the yellow button near it, and
                    paste the rewrite back.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={openAccessibilitySettings}
                      className="rounded-full bg-black px-5 py-2.5 text-sm font-black text-[#fff700] transition hover:bg-neutral-900"
                    >
                      Open Accessibility settings
                    </button>
                    <button
                      onClick={refreshAccessibilityPermission}
                      className="rounded-full border-2 border-black/10 px-5 py-2.5 text-sm font-bold transition hover:border-black"
                    >
                      I allowed it
                    </button>
                  </div>
                  <p className="mt-3 text-xs font-bold text-neutral-400">
                    Status: {detectorStatus}
                  </p>
                </div>

                {/* Step 2 — Input Monitoring */}
                <div className="rounded-2xl border border-black/[0.08] bg-white p-6 shadow-sm">
                  <p className="font-black text-base mb-1">
                    2. Allow input monitoring
                  </p>
                  <p className="text-sm text-neutral-500 leading-6 mb-4">
                    huu also needs macOS Input Monitoring so it can detect the
                    exact moment you finish highlighting text and place the yellow
                    button in the right spot. Without this, the button never
                    appears.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={openInputMonitoringSettings}
                      className="rounded-full bg-black px-5 py-2.5 text-sm font-black text-[#fff700] transition hover:bg-neutral-900"
                    >
                      Open Input Monitoring settings
                    </button>
                  </div>
                </div>

                {/* Step 3 — Test selection */}
                <div className="rounded-2xl border border-black/[0.08] bg-white p-6 shadow-sm">
                  <p className="font-black text-base mb-1">3. Test selection</p>
                  <p className="text-sm text-neutral-500 leading-6 mb-4">
                    Select text in another app, then click Test selection. This
                    is the fallback path while the automatic yellow selector runs
                    in the background.
                  </p>
                  <button
                    onClick={captureSelectedText}
                    className="rounded-full bg-[#fff700] px-5 py-2.5 text-sm font-black text-black ring-2 ring-black transition hover:brightness-95"
                  >
                    {isCapturing ? "Reading selection..." : "Test selection"}
                  </button>
                  {captureError && (
                    <p className="mt-3 text-sm font-semibold text-red-600">
                      {captureError}
                    </p>
                  )}
                </div>

                {/* Step 4 — Finish */}
                <div className="rounded-2xl border border-black/[0.08] bg-white p-6 shadow-sm">
                  <p className="font-black text-base mb-1">4. Start using huu</p>
                  <p className="text-sm text-neutral-500 leading-6 mb-4">
                    Once Accessibility is allowed, huu will watch for
                    highlighted text and show the yellow button when the focused
                    app exposes the selection to macOS.
                  </p>
                  <button
                    onClick={completeSetup}
                    disabled={!accessibilityAllowed}
                    className="rounded-full bg-black px-5 py-2.5 text-sm font-black text-[#fff700] transition hover:bg-neutral-900 disabled:opacity-40"
                  >
                    Finish setup
                  </button>
                </div>

              </div>
            </div>
          </div>

        ) : (

          /* ── DASHBOARD VIEW ── */
          <div className="flex-1 p-8">

            {/* Page header */}
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                  Home
                </p>
                <h1 className="font-display text-4xl leading-tight">
                  Welcome back, Fikri
                </h1>
              </div>
              <button
                onClick={captureSelectedText}
                className="shrink-0 rounded-full bg-black px-5 py-2.5 text-sm font-black text-[#fff700] transition hover:bg-neutral-900"
              >
                {isCapturing ? "Checking..." : "Try it out"}
              </button>
            </div>

            {/* Selector status banner */}
            <div className="mb-6 overflow-hidden rounded-2xl bg-black">
              <div className="px-6 py-5 bg-[radial-gradient(circle_at_20%_50%,rgba(255,247,0,0.3),transparent_50%)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#fff700] mb-1">
                      Desktop selector
                    </p>
                    <p className="text-sm font-bold text-white leading-6">
                      {accessibilityAllowed
                        ? "Running. Highlight text in any app to see the yellow huu button."
                        : "Accessibility permission needed to use huu on your desktop."}
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {detectorStatus}
                    </p>
                  </div>
                  {!accessibilityAllowed && (
                    <button
                      onClick={openAccessibilitySettings}
                      className="shrink-0 rounded-full bg-[#fff700] px-4 py-2 text-sm font-black text-black transition hover:brightness-95"
                    >
                      Fix Accessibility
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Health card */}
            {selectorHealth !== null && (
              <div className="mb-6 rounded-2xl border border-black/[0.08] bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-400">
                    Selector health
                  </p>
                  <button
                    onClick={refreshSelectorHealth}
                    className="rounded-full border border-black/10 px-3 py-1 text-[11px] font-bold text-neutral-500 transition hover:border-black hover:text-black"
                  >
                    {isCheckingHealth ? "Checking…" : "Refresh"}
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {selectorHealthRows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-black/[0.07] bg-[#fafaf8] px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                        {row.label}
                      </p>
                      <p
                        className={`mt-1 text-xs font-black ${
                          row.ok ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {row.value}
                      </p>
                    </div>
                  ))}
                </div>
                {selectorHealth.status && (
                  <p className="mt-3 text-[11px] text-neutral-400 truncate">
                    {selectorHealth.status}
                  </p>
                )}
              </div>
            )}

            {/* Empty state */}
            <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-black/[0.08] bg-white">
              <div className="max-w-sm px-6 py-10 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.2rem] bg-[#fff700] text-2xl shadow-[0_4px_0_rgba(0,0,0,0.12)] ring-2 ring-black">
                  ✦
                </div>
                <h2 className="font-display text-3xl">Nothing rewritten yet.</h2>
                <p className="mt-3 text-sm text-neutral-500 leading-6">
                  Select text in any app on your Mac. The yellow huu button will
                  appear next to your selection automatically.
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <button
                    onClick={captureSelectedText}
                    className="rounded-full bg-black px-5 py-2.5 text-sm font-black text-[#fff700] transition hover:bg-neutral-900"
                  >
                    {isCapturing ? "Reading..." : "Test selection"}
                  </button>
                  <button
                    onClick={() => setActiveView("scratchpad")}
                    className="rounded-full border-2 border-black/10 px-5 py-2.5 text-sm font-bold text-neutral-700 transition hover:border-black hover:text-black"
                  >
                    Try in scratchpad
                  </button>
                </div>
              </div>
            </div>

            {/* Capture error */}
            {captureError && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
                <p className="text-sm font-bold text-red-900">{captureError}</p>
                <p className="mt-1 text-sm leading-6 text-red-700">
                  Go to System Settings &rarr; Privacy &amp; Security &rarr;
                  Accessibility and allow huu. Then select text in another app
                  and click Try it out again.
                </p>
              </div>
            )}

          </div>
        )}
        </div>{/* end flex-1 overflow-auto */}
      </section>

      {/* Rewrite panel overlay */}
      {showRewritePanel && capturedText && (
        <ExternalRewritePanel text={capturedText} onClose={closeRewritePanel} />
      )}

      {/* ── Settings modal ────────────────────────────────────────────────── */}
      {settingsOpen && (
        <>
          {/* Backdrop — click outside to close */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setSettingsOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
            <div
              className="pointer-events-auto flex h-[700px] w-[1060px] max-w-full overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/[0.06]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Left sub-nav */}
              <aside className="flex w-64 shrink-0 flex-col border-r border-black/[0.06] bg-[#fafaf8] p-5">
                <p className="mb-4 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
                  Settings
                </p>
                {(["account", "billing"] as SettingsTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSettingsTab(tab)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${
                      settingsTab === tab
                        ? "bg-black text-white"
                        : "text-neutral-600 hover:bg-black/5 hover:text-black"
                    }`}
                  >
                    {tab === "account" ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                      </svg>
                    )}
                    {tab === "account" ? "Account" : "Plans & Billing"}
                  </button>
                ))}
              </aside>

              {/* Right content */}
              <div className="relative flex-1 overflow-auto p-12">
                {/* Close button */}
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="absolute right-6 top-6 rounded-full p-1.5 text-neutral-400 transition hover:bg-black/5 hover:text-black"
                  aria-label="Close settings"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>

                {settingsTab === "account" ? (
                  /* ── ACCOUNT TAB ── */
                  <div className="max-w-xl">
                    <h1 className="font-display text-4xl text-black mb-8">Account</h1>

                    {/* Fields card */}
                    <div className="rounded-2xl border border-black/[0.08] bg-[#fafaf8] overflow-hidden">
                      {/* First name */}
                      <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06]">
                        <span className="text-sm font-semibold text-neutral-500 w-32 shrink-0">First name</span>
                        <input
                          type="text"
                          value={editFirstName}
                          onChange={(e) => setEditFirstName(e.target.value)}
                          className="flex-1 bg-transparent text-sm font-semibold text-black text-right focus:outline-none placeholder:text-neutral-300"
                          placeholder="First name"
                        />
                      </div>
                      {/* Last name */}
                      <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06]">
                        <span className="text-sm font-semibold text-neutral-500 w-32 shrink-0">Last name</span>
                        <input
                          type="text"
                          value={editLastName}
                          onChange={(e) => setEditLastName(e.target.value)}
                          className="flex-1 bg-transparent text-sm font-semibold text-black text-right focus:outline-none placeholder:text-neutral-300"
                          placeholder="Last name"
                        />
                      </div>
                      {/* Email */}
                      <div className="flex items-center justify-between px-6 py-4">
                        <span className="text-sm font-semibold text-neutral-500 w-32 shrink-0">Email</span>
                        <span className="flex-1 text-sm font-semibold text-neutral-400 text-right select-all">
                          {user?.emailAddresses?.[0]?.emailAddress ?? "—"}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-8 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            void signOut();
                            localStorage.removeItem("huu_logged_in");
                            setAuthState("login");
                            setSettingsOpen(false);
                          }}
                          className="rounded-xl border border-black/15 bg-[#f5f5f3] px-5 py-2.5 text-sm font-semibold text-neutral-700 transition hover:border-black/30 hover:bg-neutral-100"
                        >
                          Sign out
                        </button>
                        <button
                          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-neutral-400 transition hover:text-red-500"
                        >
                          Delete account
                        </button>
                      </div>
                      <button
                        onClick={() => void handleSaveProfile()}
                        disabled={isSavingProfile}
                        className="rounded-xl bg-neutral-800 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-black disabled:opacity-50"
                      >
                        {isSavingProfile ? "Saving…" : profileSaved ? "Saved ✓" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── PLANS & BILLING TAB ── */
                  <div className="max-w-2xl">
                    <h1 className="font-display text-4xl text-black mb-2">Plans &amp; Billing</h1>
                    <p className="mb-8 text-sm text-neutral-500">
                      Manage your subscription and usage.
                    </p>

                    {/* Usage meter — free only */}
                    {subscription.plan === "free" && (
                      <div className="mb-8 rounded-2xl border border-black/[0.08] bg-[#fafaf8] p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-sm font-black text-black">Daily rewrites used</p>
                          <p className="text-sm font-bold tabular-nums text-neutral-400">
                            {subscription.usageCount} / {subscription.limit}
                          </p>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                          <div
                            className="h-full rounded-full bg-[#fff700] transition-all duration-300"
                            style={{ width: `${Math.min(100, (subscription.usageCount / subscription.limit) * 100)}%` }}
                          />
                        </div>
                        <p className="mt-2.5 text-xs text-neutral-400">
                          {subscription.remaining === 0
                            ? `You've used all ${subscription.limit} rewrites.${subscription.resetsAt ? ` Resets in ${formatResetIn(subscription.resetsAt)}.` : ""}`
                            : `${subscription.remaining} rewrite${subscription.remaining !== 1 ? "s" : ""} remaining.${subscription.resetsAt ? ` Resets in ${formatResetIn(subscription.resetsAt)}.` : " Resets 24h after your first rewrite."}`}
                        </p>
                      </div>
                    )}

                    {/* Monthly / Annual toggle */}
                    {subscription.plan !== "pro" && (
                      <div className="mb-6 flex justify-center">
                        <div className="inline-flex items-center rounded-full bg-neutral-100 p-1">
                          <button
                            onClick={() => setBillingPeriod("monthly")}
                            className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                              billingPeriod === "monthly"
                                ? "bg-white shadow text-black"
                                : "text-neutral-500 hover:text-black"
                            }`}
                          >
                            Monthly
                          </button>
                          <button
                            onClick={() => setBillingPeriod("annual")}
                            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold transition ${
                              billingPeriod === "annual"
                                ? "bg-[#fff700] shadow text-black"
                                : "text-neutral-500 hover:text-black"
                            }`}
                          >
                            Annual
                            <span className={`text-xs font-black ${billingPeriod === "annual" ? "text-black/60" : "text-neutral-400"}`}>
                              20% off
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cancellation notice */}
                    {subscription.plan === "pro" && subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
                      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4">
                        <span className="mt-0.5 text-orange-400">⚠</span>
                        <p className="text-sm text-orange-800">
                          Your Pro plan has been cancelled. You still have full access until{" "}
                          <span className="font-bold">
                            {new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US", {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          , after which your account will revert to the free plan.
                        </p>
                      </div>
                    )}

                    {/* Plan cards */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Free card — dark */}
                      <div className="rounded-2xl bg-neutral-900 p-7 flex flex-col">
                        <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-400">Free</p>
                        <div className="flex items-baseline gap-1 mb-1">
                          <span className="font-display text-5xl text-white">$0</span>
                        </div>
                        <p className="mb-6 text-sm text-neutral-500">/forever</p>
                        <ul className="space-y-3 text-sm text-neutral-400 flex-1">
                          <li className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-[#fff700]">✓</span>10 rewrites per day
                          </li>
                          <li className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-[#fff700]">✓</span>All 4 tones
                          </li>
                          <li className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-[#fff700]">✓</span>Works on any app, any text field
                          </li>
                          <li className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-[#fff700]">✓</span>No credit card needed
                          </li>
                        </ul>
                        {subscription.plan === "free" ? (
                          <div className="mt-6 w-full rounded-xl border border-white/10 py-3 text-center text-sm font-black text-neutral-500">
                            Current plan
                          </div>
                        ) : null}
                      </div>

                      {/* Pro card — yellow */}
                      <div className="rounded-2xl bg-[#fff700] p-7 flex flex-col relative">
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-black/50">Pro</p>
                          <span className="rounded-full bg-black px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#fff700]">
                            POPULAR
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1 mb-1">
                          <span className="font-display text-5xl text-black">
                            {billingPeriod === "annual" ? "$8" : "$10"}
                          </span>
                          <span className="text-sm font-semibold text-black/50">
                            {billingPeriod === "annual" ? "/mo · billed annually" : "/month"}
                          </span>
                        </div>
                        {billingPeriod === "annual" && (
                          <p className="mb-6 text-xs text-black/50">$96 billed once per year</p>
                        )}
                        {billingPeriod === "monthly" && <p className="mb-6 text-xs text-black/50">&nbsp;</p>}
                        <ul className="space-y-3 text-sm text-black/70 flex-1">
                          <li className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-black font-black">✓</span>Everything in the free plan
                          </li>
                          <li className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-black font-black">✓</span>Unlimited rewrites
                          </li>
                        </ul>

                        {subscription.plan === "pro" ? (
                          <div className="mt-6 space-y-2">
                            <div className="w-full rounded-xl border-2 border-black/15 py-3 text-center text-sm font-black text-black/50">
                              {subscription.cancelAtPeriodEnd ? "Cancels soon" : "Active plan ✓"}
                            </div>
                            <button
                              onClick={() => void handleManageBilling()}
                              className="w-full rounded-xl bg-black py-3 text-sm font-bold text-white transition hover:bg-neutral-800"
                            >
                              Manage billing &amp; invoices
                            </button>
                          </div>
                        ) : (
                          <>
                            {checkoutError && (
                              <p className="mt-4 text-xs font-semibold text-red-600">{checkoutError}</p>
                            )}
                            <button
                              onClick={() => void handleUpgradeClick(billingPeriod)}
                              disabled={checkoutLoading}
                              className="mt-4 w-full rounded-xl bg-black py-3.5 text-sm font-black text-white transition hover:bg-neutral-800 disabled:opacity-60"
                            >
                              {checkoutLoading ? "Opening checkout…" : "Get Pro"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Paywall modal ─────────────────────────────────────────────────── */}
      {paywallOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setPaywallOpen(false)}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
            <div className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-3xl border-2 border-black bg-white shadow-2xl">

              {/* Header */}
              <div className="bg-black px-6 py-6">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#fff700]">
                  huumanity Pro
                </p>
                <p className="mt-1 font-display text-3xl text-white leading-tight">
                  Unlimited rewrites.
                </p>
                <p className="mt-2 text-sm text-white/50 leading-6">
                  You&apos;ve hit the free limit of {subscription.limit} rewrites today.
                  Upgrade to keep going without limits.
                </p>
              </div>

              {/* Plan toggle */}
              <div className="p-6 space-y-3">
                <button
                  onClick={() => setSelectedPrice("monthly")}
                  className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-4 transition ${
                    selectedPrice === "monthly"
                      ? "border-black bg-[#fff700]"
                      : "border-black/10 hover:border-black/30"
                  }`}
                >
                  <div className="text-left">
                    <p className="text-sm font-black text-black">Monthly</p>
                    <p className="text-xs text-black/50">Billed every month</p>
                  </div>
                  <p className="text-lg font-black text-black">$10<span className="text-xs font-bold text-black/50">/mo</span></p>
                </button>

                <button
                  onClick={() => setSelectedPrice("annual")}
                  className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-4 transition ${
                    selectedPrice === "annual"
                      ? "border-black bg-[#fff700]"
                      : "border-black/10 hover:border-black/30"
                  }`}
                >
                  <div className="text-left">
                    <p className="text-sm font-black text-black">
                      Annual
                      <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[10px] font-black text-[#fff700]">
                        Save 20%
                      </span>
                    </p>
                    <p className="text-xs text-black/50">Billed once a year</p>
                  </div>
                  <p className="text-lg font-black text-black">$96<span className="text-xs font-bold text-black/50">/yr</span></p>
                </button>

                <button
                  onClick={() => void handleUpgradeClick(selectedPrice)}
                  disabled={checkoutLoading}
                  className="mt-2 w-full rounded-2xl border-2 border-black bg-black py-4 text-sm font-black text-[#fff700] transition hover:bg-neutral-900 disabled:opacity-60"
                >
                  {checkoutLoading ? "Opening checkout…" : "Get Pro →"}
                </button>

                <p className="text-center text-[11px] text-neutral-400">
                  Secure payment via Stripe. Cancel anytime.
                </p>
              </div>

              {/* Close */}
              <button
                onClick={() => setPaywallOpen(false)}
                className="absolute right-4 top-4 rounded-full p-1.5 text-white/40 transition hover:text-white"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
