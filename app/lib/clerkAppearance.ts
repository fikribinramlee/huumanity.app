/**
 * Shared Clerk <SignIn> / <SignUp> theming.
 *
 * Goal: a clean, on-brand auth screen (Wispr Flow style) — full-white
 * background, white social buttons with black text, and a chunky yellow
 * primary "Continue" button. Clerk's own header is hidden because each page
 * renders the huu logo + headline itself.
 *
 * Note: which social providers appear (Google, Apple, …) is controlled in the
 * Clerk Dashboard (User & Authentication → SSO connections), NOT here. This
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
    colorDanger: "#dc2626",
    borderRadius: "0.85rem",
    fontFamily: "var(--font-nunito), ui-sans-serif, system-ui, sans-serif",
    fontSize: "0.95rem",
    spacingUnit: "1rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "shadow-none border-none w-full max-w-[400px]",
    card: "shadow-none border-none bg-white p-0 gap-5",
    // Each page renders its own logo + headline, so hide Clerk's.
    header: "hidden",
    // Social (Google / Apple) buttons: white with a subtle black border + lift.
    socialButtonsBlockButton:
      "bg-white text-black border border-black/15 rounded-xl py-3.5 font-semibold hover:bg-neutral-50 hover:border-black/25 transition shadow-[0_1px_0_rgba(0,0,0,0.04)]",
    socialButtonsBlockButtonText: "font-semibold text-black text-[0.95rem]",
    socialButtons: "gap-2.5",
    dividerRow: "my-2",
    dividerLine: "bg-black/10",
    dividerText: "text-neutral-400 text-xs uppercase tracking-wide",
    formFieldLabel: "text-black font-semibold text-sm",
    formFieldInput:
      "border border-black/15 rounded-xl bg-white py-3.5 px-4 focus:border-black focus:ring-0 placeholder:text-neutral-400 transition",
    // Primary "Continue" button: brand yellow, black text, chunky shadow.
    formButtonPrimary:
      "bg-[#fff700] text-black font-black rounded-xl py-3.5 normal-case text-[0.95rem] border border-black/10 shadow-[0_2px_0_rgba(0,0,0,0.14)] hover:brightness-95 active:translate-y-px transition",
    footerAction: "text-sm",
    footerActionText: "text-neutral-500",
    footerActionLink: "text-black font-bold hover:underline underline-offset-2",
    identityPreviewEditButton: "text-black",
    formResendCodeLink: "text-black font-semibold",
    otpCodeFieldInput: "border border-black/15 rounded-xl",
  },
};
