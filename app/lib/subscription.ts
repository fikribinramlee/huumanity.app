/**
 * Subscription helpers — single source of truth for plan + daily usage.
 *
 * Storage (Clerk metadata):
 *   privateMetadata: { stripeCustomerId, subscriptionId, subscriptionStatus, plan }
 *   publicMetadata:  { usageCount, usageDate }   ← daily, resets each UTC day
 */

import { clerkClient } from "@clerk/nextjs/server";

export const FREE_DAILY_LIMIT = Number(process.env.FREE_DAILY_LIMIT ?? 10);

// Rolling 24-hour window. The free quota is anchored to the FIRST rewrite of a
// window, not to the calendar day: a user who runs out at 10am gets a fresh
// allowance exactly 24h later (10am the next day), independent of timezone or
// UTC midnight. Partial use resets the same way — 24h after the first rewrite.
export const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type Plan = "free" | "pro";

export type PrivateMeta = {
  stripeCustomerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: string; // "active" | "canceled" | "past_due" | ...
  plan?: Plan;
  cancelAtPeriodEnd?: boolean;   // true when user cancelled but period hasn't ended
  currentPeriodEnd?: string;     // ISO date string, e.g. "2026-07-10"
};

export type PublicMeta = {
  usageCount?: number;
  windowStart?: string; // ISO timestamp when the current 24h window began
  usageDate?: string;   // legacy (calendar-day model) — ignored, kept for back-compat
};

/** Today's date as YYYY-MM-DD in UTC (legacy; retained for any other callers) */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pure helper: given a user's public metadata, compute their usage within the
 * current rolling 24h window. If the window has elapsed (or never started), the
 * count is 0 and a fresh window will begin on the next rewrite.
 */
export function windowedUsage(publicMeta: PublicMeta): {
  count: number;
  windowStart: string | null;
  resetsAt: string | null;
} {
  const now = Date.now();
  const startMs = publicMeta.windowStart
    ? Date.parse(publicMeta.windowStart)
    : NaN;
  const active = Number.isFinite(startMs) && now - startMs < USAGE_WINDOW_MS;
  if (!active) {
    return { count: 0, windowStart: null, resetsAt: null };
  }
  return {
    count: publicMeta.usageCount ?? 0,
    windowStart: publicMeta.windowStart ?? null,
    resetsAt: new Date(startMs + USAGE_WINDOW_MS).toISOString(),
  };
}

/** Fetch both metadata blobs for a user in one API call */
export async function getUserMeta(userId: string) {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  return {
    clerk,
    user,
    privateMeta: (user.privateMetadata ?? {}) as PrivateMeta,
    publicMeta: (user.publicMetadata ?? {}) as PublicMeta,
  };
}

/** Returns true only when the user has an active Pro subscription */
export async function isPro(userId: string): Promise<boolean> {
  const { privateMeta } = await getUserMeta(userId);
  return (
    privateMeta.plan === "pro" && privateMeta.subscriptionStatus === "active"
  );
}

/** Returns the rewrite count within the current rolling 24h window (0 if elapsed). */
export async function getDailyUsage(
  userId: string
): Promise<{ count: number; windowStart: string | null; resetsAt: string | null }> {
  const { publicMeta } = await getUserMeta(userId);
  return windowedUsage(publicMeta);
}

/**
 * Increments usage within the rolling 24h window. If the previous window has
 * elapsed (or none exists), a fresh window is started — anchored to NOW (this
 * first rewrite) — and the count resets to 1. Returns the new count.
 */
export async function incrementDailyUsage(userId: string): Promise<number> {
  const { clerk, publicMeta } = await getUserMeta(userId);
  const now = Date.now();
  const startMs = publicMeta.windowStart
    ? Date.parse(publicMeta.windowStart)
    : NaN;
  const active = Number.isFinite(startMs) && now - startMs < USAGE_WINDOW_MS;

  const newCount = active ? (publicMeta.usageCount ?? 0) + 1 : 1;
  const windowStart = active
    ? (publicMeta.windowStart as string)
    : new Date(now).toISOString();

  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: { usageCount: newCount, windowStart },
  });
  return newCount;
}

/**
 * Upgrades a user to Pro in Clerk metadata.
 * Called from the Stripe webhook after a successful checkout.
 */
export async function upgradeUserToPro(
  userId: string,
  opts: {
    stripeCustomerId: string;
    subscriptionId: string;
    subscriptionStatus: string;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: string;
  }
): Promise<void> {
  const { clerk, privateMeta } = await getUserMeta(userId);
  await clerk.users.updateUserMetadata(userId, {
    privateMetadata: {
      ...privateMeta,
      stripeCustomerId: opts.stripeCustomerId,
      subscriptionId: opts.subscriptionId,
      subscriptionStatus: opts.subscriptionStatus,
      plan: opts.subscriptionStatus === "active" ? "pro" : "free",
      cancelAtPeriodEnd: opts.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: opts.currentPeriodEnd ?? null,
    },
    publicMetadata: {
      plan: opts.subscriptionStatus === "active" ? "pro" : "free",
    },
  });
}

/**
 * Downgrades a user to Free (called on subscription cancellation/deletion).
 */
export async function downgradeUserToFree(
  userId: string,
  subscriptionId: string,
  status: string
): Promise<void> {
  const { clerk, privateMeta } = await getUserMeta(userId);
  await clerk.users.updateUserMetadata(userId, {
    privateMetadata: {
      ...privateMeta,
      subscriptionId,
      subscriptionStatus: status,
      plan: "free",
    },
    publicMetadata: { plan: "free" },
  });
}
