import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that must be publicly accessible (no Clerk session required)
const isPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/stripe/webhook", // Stripe calls this — no user session
  "/api/humanize",       // called from Tauri app with bearer token
  "/payment-success(.*)",
  "/download(.*)",
  "/downloads(.*)",
]);

export default clerkMiddleware((auth, req) => {
  if (isPublic(req)) return; // let it through
  // All other routes: Clerk handles session resolution automatically.
  // API routes call auth() themselves to check sign-in state.
});

export const config = {
  matcher: [
    // Run middleware on all routes except Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
