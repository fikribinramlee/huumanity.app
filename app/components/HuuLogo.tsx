/**
 * Official huumanity wordmark — [h]uu
 *
 * Yellow square sits behind "h". "uu" follows on transparent background.
 * Matches the 500×500 brand asset exactly:
 *   – Yellow box is a proper square (0.82em × 0.82em)
 *   – Baselines of "h" and "uu" are aligned
 *   – No background on "uu" — transparent
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
      {/* Yellow square — proper square via equal width + height */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          background: "#fff700",
          width: "0.82em",
          height: "0.82em",
          paddingLeft: "0.04em",
          paddingBottom: "0.03em",
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
