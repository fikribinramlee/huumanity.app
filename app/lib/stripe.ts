import Stripe from "stripe";

// Lazy singleton — not initialized at module load time so Next.js build
// doesn't fail when STRIPE_SECRET_KEY isn't available in the build env.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  _stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
  return _stripe;
}
