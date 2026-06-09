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
      {/* Yellow square — large enough that "h" breathes inside it */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          background: "#fff700",
          width: "1.1em",
          height: "1.1em",
          paddingLeft: "0.1em",
          paddingBottom: "0.06em",
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        h
      </span>
      {/* "uu" — transparent, same baseline */}
      <span style={{ lineHeight: 1 }}>uu</span>
    </span>
  );
}
