/**
 * Subscription helpers — single source of truth for plan + daily usage.
 *
 * Storage (Clerk metadata):
 *   privateMetadata: { stripeCustomerId, subscriptionId, subscriptionStatus, plan }
 *   publicMetadata:  { usageCount, usageDate }   ← daily, resets each UTC day
 */

import { clerkClient } from "@clerk/nextjs/server";

export const FREE_DAILY_LIMIT = 5;

export type Plan = "free" | "pro";

export type PrivateMeta = {
  stripeCustomerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: string; // "active" | "canceled" | "past_due" | ...
  plan?: Plan;
};

export type PublicMeta = {
  usageCount?: number;
  usageDate?: string; // "YYYY-MM-DD" UTC
};

/** Today's date as YYYY-MM-DD in UTC */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
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

/** Returns today's rewrite count (resets when the date changes) */
export async function getDailyUsage(
  userId: string
): Promise<{ count: number; date: string }> {
  const { publicMeta } = await getUserMeta(userId);
  const today = todayUTC();
  if (publicMeta.usageDate !== today) {
    return { count: 0, date: today };
  }
  return { count: publicMeta.usageCount ?? 0, date: today };
}

/**
 * Atomically increments today's usage count.
 * Resets the counter if the stored date is stale.
 * Returns the new count.
 */
export async function incrementDailyUsage(userId: string): Promise<number> {
  const { clerk, publicMeta } = await getUserMeta(userId);
  const today = todayUTC();
  const currentCount =
    publicMeta.usageDate === today ? (publicMeta.usageCount ?? 0) : 0;
  const newCount = currentCount + 1;
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: { usageCount: newCount, usageDate: today },
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
