/**
 * Shared Clerk <SignIn> / <SignUp> theming.
 *
 * Goal: a clean, on-brand auth screen (Wispr Flow style) — white background,
 * white social buttons with black text, and a yellow primary "Continue" button.
 * Clerk's own header is hidden because each page renders the huu logo + headline
 * itself (see the sign-in / sign-up pages).
 *
 * Note: which social providers appear (Google, Apple, …) is controlled in the
 * Clerk Dashboard (User & Authentication → Social connections), NOT here. This
 * config only styles whatever providers are enabled.
 */
export const clerkAppearance = {
  layout: {
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
    logoPlacement: "none" as const,
    showOptionalFields: true,
  },
  variables: {
    colorPrimary: "#000000",
    colorText: "#000000",
    colorTextSecondary: "#6b7280",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#000000",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-nunito), ui-sans-serif, system-ui, sans-serif",
    fontSize: "0.95rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "shadow-none border-none w-full max-w-[400px]",
    card: "shadow-none border-none bg-white p-0",
    // Each page renders its own logo + "Get started" headline, so hide Clerk's.
    header: "hidden",
    // Social (Google / Apple) buttons: white with a subtle black border.
    socialButtonsBlockButton:
      "bg-white text-black border border-black/15 rounded-xl py-3 hover:bg-neutral-50 transition shadow-none",
    socialButtonsBlockButtonText: "font-semibold text-black",
    dividerLine: "bg-black/10",
    dividerText: "text-neutral-400",
    formFieldLabel: "text-black font-semibold",
    formFieldInput:
      "border border-black/15 rounded-xl bg-white focus:border-black focus:ring-0",
    // Primary "Continue" button: brand yellow with black text.
    formButtonPrimary:
      "bg-[#fff700] text-black font-bold rounded-xl py-3 border border-black/10 shadow-none hover:brightness-95 transition",
    footerActionLink: "text-black font-bold hover:underline",
    identityPreviewEditButton: "text-black",
  },
};
