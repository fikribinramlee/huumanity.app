import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/download(.*)",
  "/waitlist(.*)",
  "/payment-success(.*)",
  "/api/humanize(.*)",
  "/api/stripe/(.*)",
  "/api/desktop/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Protect non-public routes — Clerk will redirect to sign-in automatically
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
