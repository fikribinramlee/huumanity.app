import Stripe from "stripe";

// Lazy singleton — switches between test and live key based on STRIPE_TEST_MODE
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const isTestMode = process.env.STRIPE_TEST_MODE === "true";
  const key = isTestMode
    ? process.env.STRIPE_SECRET_KEY_TEST
    : process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error(
      isTestMode
        ? "STRIPE_SECRET_KEY_TEST is not set"
        : "STRIPE_SECRET_KEY is not set"
    );
  }

  _stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
  return _stripe;
}
