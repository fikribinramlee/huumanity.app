/**
 * Ground rules for whether selected text is worth rephrasing with the tone bar.
 *
 * Single-word rules:
 *   – Starts with uppercase  → proper noun / name / place (Dimitri, London) → false
 *   – All letters uppercase  → acronym (USA, CEO)                           → false
 *   – Fewer than 3 letters   → too short (a, ok, hi)                        → false
 *   – Lowercase common word  → rephrashable (brief, potential, research)     → true
 *
 * Multi-word rules (2+ words):
 *   – Must be ≥ 50 % letters (filters pure numbers / gibberish)
 *   – "Best regards", full sentences, paragraphs → all true
 *
 * Examples:
 *   ✗  Dimitri / Alex / London / USA / a / hi
 *   ✓  brief / potential / research / synergies / introduce
 *   ✓  best regards / I am reaching out… / any sentence
 */
export function isRephrashable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);

  // ── Single word ──────────────────────────────────────────────────────────
  if (words.length === 1) {
    const word    = words[0];
    const letters = word.replace(/[^a-zA-Z]/g, "");

    if (letters.length < 3)                        return false; // too short
    if (letters === letters.toUpperCase())          return false; // ALL CAPS / acronym
    if (/^[A-Z]/.test(word))                       return false; // proper noun / name / place
    return true;                                                  // lowercase common word ✓
  }

  // ── Two or more words ────────────────────────────────────────────────────
  const nonSpace    = trimmed.replace(/\s/g, "");
  if (!nonSpace) return false;
  const letterCount = (nonSpace.match(/[a-zA-Z]/g) ?? []).length;
  return letterCount / nonSpace.length >= 0.50;
}
