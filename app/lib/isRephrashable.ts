/**
 * Ground rules for whether a text selection is worth showing the rephrase
 * (yellow) button for. Shared by the website demo, the editor, the desktop
 * selector overlay, and the scratchpad — and MIRRORED in Rust at
 * `src-tauri/src/lib.rs` (`is_rephrashable`). Keep the two in sync.
 *
 * The button is for rephrasing NATURAL-LANGUAGE PROSE — sentences, emails,
 * DMs, posts. It must NOT appear on things that aren't prose:
 *   – code / markup            (const x = 5;  <div className=…>  foo.bar())
 *   – math / formulas          (2 + 2 = 4   E = mc^2   x = (a+b)/c)
 *   – numbers / data           (42   3.14   1,000,000   10:30   12/05/2024)
 *   – design tokens            (#fff700   12px   rgba(255,0,0,1)   margin: 0;)
 *   – names / acronyms / stubs (Dimitri   USA   ok)
 *
 * Examples:
 *   ✗  Dimitri / USA / ok / 42 / #fff700 / const x = 5; / 2+2=4 / 12px
 *   ✓  brief / research / "best regards" / any real sentence or paragraph
 */

/**
 * Strong "this is not prose" signals: code, math, data, or design tokens.
 * Returns true when the selection looks like one of those rather than words.
 */
function looksLikeCodeOrData(s: string): boolean {
  const nonSpace = s.replace(/\s/g, "");
  if (!nonSpace) return true;
  const len = nonSpace.length;

  const digits = (nonSpace.match(/[0-9]/g) ?? []).length;
  const letters = (nonSpace.match(/[a-zA-Z]/g) ?? []).length;
  // Characters that are common in code / math / design but rare in prose.
  // (Note: . , ! ? ' " : ; - – — … and parentheses-light prose are tolerated
  //  via the ratio thresholds below; these are the genuinely "techy" ones.)
  const codeSymbols = (nonSpace.match(/[{}[\]()<>=+*/\\|^~%$@#_`]/g) ?? []).length;

  // 1. Symbol-dense → code / formula / design token.
  if (codeSymbols / len > 0.12) return true;
  // 2. Digit-dense → number / calculation / data.
  if (digits / len > 0.3) return true;
  // 3. Letter-sparse → not prose.
  if (letters / len < 0.45) return true;

  // 4. Explicit code / markup token patterns.
  if (/=>|===|!==|==|!=|<=|>=|&&|\|\||::|\/>|<\/|<\w|\/\*|\*\//.test(s)) return true;
  if (/;\s*$|^\s*[{}[\]]|[{}[\]]\s*$/.test(s)) return true;
  if (
    /\b(function|const|let|var|return|import|export|class|def|public|private|static|void|null|undefined|async|await|elif|println|console|printf)\b/.test(
      s
    )
  ) {
    return true;
  }

  // 5. Arithmetic / equations: "number op number", or any "=" (assignment /
  //    equation — essentially never appears in prose worth rephrasing).
  if (/[0-9]\s*[-+*/=^×÷]\s*[0-9]/.test(s)) return true;
  if (/=/.test(s)) return true;

  // 6. Design tokens: hex colors, CSS units, color / transform functions.
  if (/#[0-9a-fA-F]{3,8}\b/.test(s)) return true;
  if (/\b\d+(\.\d+)?(px|rem|em|vh|vw|vmin|vmax|pt|pc|mm|cm|ch|fr|deg|ms)\b/.test(s)) return true;
  if (
    /\b(rgb|rgba|hsl|hsla|hwb|var|calc|url|translate|translatex|translatey|rotate|scale|matrix|linear-gradient|radial-gradient)\s*\(/i.test(
      s
    )
  ) {
    return true;
  }

  return false;
}

export function isRephrashable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Hard reject anything that reads as code / math / data / design.
  if (looksLikeCodeOrData(trimmed)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);

  // ── Single word ──────────────────────────────────────────────────────────
  if (words.length === 1) {
    const word = words[0];
    const letters = word.replace(/[^a-zA-Z]/g, "");

    if (letters.length < 3) return false; // too short (a, ok, hi) / pure number
    // Must be essentially all letters — rejects stubs like "v2", "x5", "px",
    // "h1", "n_count" that slipped past the length check.
    if (letters.length / word.length < 0.8) return false;
    if (letters === letters.toUpperCase()) return false; // ALL CAPS / acronym
    if (/^[A-Z]/.test(word)) return false; // proper noun / name / place
    return true; // lowercase common word ✓
  }

  // ── Two or more words ────────────────────────────────────────────────────
  const nonSpace = trimmed.replace(/\s/g, "");
  if (!nonSpace) return false;
  const letterCount = (nonSpace.match(/[a-zA-Z]/g) ?? []).length;
  // Prose is letter-dominated.
  if (letterCount / nonSpace.length < 0.55) return false;
  // Needs at least two real alphabetic words (≥2 letters each) so a couple of
  // numbers/symbols glued together can't masquerade as a phrase.
  const wordyCount = words.filter(
    (w) => (w.match(/[a-zA-Z]/g) ?? []).length >= 2
  ).length;
  if (wordyCount < 2) return false;

  return true;
}
