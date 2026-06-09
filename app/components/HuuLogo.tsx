/**
 * Official huumanity wordmark — [h]uu
 *
 * Yellow square sits behind "h". "uu" follows on transparent background.
 * Matches the 500×500 brand asset:
 *   – Yellow box is a generous square (1.1em × 1.1em) with "h" in the lower-left
 *   – Baselines of "h" and "uu" are aligned
 *   – No background on "uu" — transparent / inherits page bg
 *
 * Usage:
 *   <HuuLogo className="text-3xl" />   ← nav
 *   <HuuLogo className="text-5xl" />   ← hero / login
 */
export function HuuLogo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-display inline-flex items-baseline leading-none select-none ${className}`}
      aria-label="huu"
    >
      {/* Yellow box contains "hu" — both letters sit inside */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "flex-end",
          background: "#fff700",
          paddingTop: "0.2em",
          paddingLeft: "0.08em",
          paddingRight: "0.05em",
          paddingBottom: "0.05em",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        hu
      </span>
      {/* Last "u" — no background, flush against the box */}
      <span style={{ lineHeight: 1 }}>u</span>
    </span>
  );
}
