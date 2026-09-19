/**
 * Supporting data for the Resume & Application Studio engine (§5.8).
 *
 * Deterministic, no external calls. These constants back the claim-
 * verification pass: honest resumes should trip *few* flags, so the lists
 * are intentionally conservative — they catch filler language and fabricated
 * performance numbers, not genuine, evidence-backed statements.
 */

/**
 * Empty-calorie resume adjectives. On their own they assert competence
 * without showing it. We only *flag* them (suggest replacing with the
 * concrete evidence that already exists) — we never invent the evidence.
 */
export const BUZZWORD_TERMS: readonly string[] = [
  "proficient",
  "expert",
  "passionate",
  "cutting-edge",
  "world-class",
  "rockstar",
  "guru",
  "ninja",
  "synergy",
  "detail-oriented",
  "team player",
  "self-starter",
  "results-driven",
  "go-getter",
];

/**
 * Patterns for fabricated / unverifiable performance metrics — the classic
 * "improved X by 40%", "10x faster", "reduced latency by 200ms". A student
 * project with no public benchmark backing such a number is almost always
 * inventing precision. Duration statements ("3+ years") are deliberately NOT
 * matched here — those describe experience, not a performance outcome.
 */
export const INVENTED_METRIC_PATTERNS: readonly RegExp[] = [
  /\b\d+(\.\d+)?\s?%/, // "40%", "12.5 %"
  /\b\d+(\.\d+)?\s?x\b/i, // "10x", "2.5x"
  /\b(increased|reduced|improved|boosted|cut|decreased|grew)\b[^.]*\b\d/i,
  /\bby\s+\d+(\.\d+)?\s?(%|x|ms|s|percent)\b/i, // "by 200ms", "by 30%"
];

/**
 * Canonical resume section labels used by the recommendation engine.
 *
 * There is deliberately NO "Summary" member. Recommendations are derived from
 * the category of the evidence they reframe, and no evidence row is a summary
 * — a member for a section nothing can emit is an invitation to fabricate one.
 */
export const RESUME_SECTIONS = {
  skills: "Technical Skills",
  projects: "Projects",
  education: "Education & Coursework",
  experience: "Experience",
} as const;
