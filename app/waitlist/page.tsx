/**
 * /waitlist — same landing page as `/`, but with every download/sign-up CTA
 * swapped to "Join the Waitlist". This route exists for the pre-launch /
 * MVP phase: share huumanity.app/waitlist instead of huumanity.app to collect
 * emails via Clerk's waitlist mode (Clerk Dashboard → Restrictions → Waitlist).
 *
 * Implementation note: this route renders the exact same component as `/`.
 * The component detects the pathname via `usePathname()` — when it's
 * `/waitlist` it flips into waitlist mode. Zero duplicated JSX, so the two
 * routes can never drift out of sync.
 */
export { default } from "../page";

export const metadata = {
  title: "huumanity: Join the Waitlist",
  description:
    "Stop writing like a robot. Join the huumanity waitlist for early access.",
};
