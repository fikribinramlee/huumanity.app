import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/download",
  "/downloads(.*)",
  "/editor",
  "/selector",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/humanize(.*)",
  "/api/stripe/webhook", // Stripe calls this — no user session
  "/api/admin/(.*)",     // protected by x-admin-secret header, not Clerk
  "/payment-success(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
