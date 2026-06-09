import Stripe from "stripe";

// Singleton Stripe client — server-side only
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",
});
