/**
 * Deterministic text matching used by the package builder.
 *
 * Two places need to ask "do these two pieces of text refer to the same
 * thing?": pairing a saved answer with a form question, and pairing a piece of
 * evidence with a job requirement. Neither is a claim about the world — a miss
 * costs the user a "you must write this" note, which is honest. An over-match
 * is the expensive failure (it would present a stored answer as if it belonged
 * to a question nobody asked), so the thresholds are deliberately strict and
 * every match records WHICH source text it matched, so the user can see it.
 *
 * Pure: no I/O, no Date, no randomness.
 */

/**
 * Words that carry no topical signal. Kept short on purpose: a long list
 * drifts and starts deleting meaning ("work", "role" and "team" all matter
 * here), and every word removed makes over-matching more likely.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "are", "you", "your", "our", "with", "that", "this",
  "have", "has", "had", "was", "were", "will", "would", "can", "could",
  "about", "from", "into", "what", "why", "how", "who", "when", "where",
  "any", "all", "not", "but", "its", "his", "her", "their", "them", "they",
  "please", "describe", "tell", "list", "provide", "give", "share",
]);

/** Lowercase alphanumeric tokens of 3+ characters, stopwords removed. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

/** Whitespace/punctuation-insensitive equality — the unambiguous case. */
export function normalizeForEquality(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export interface Overlap {
  shared: number;
  /** Share of the QUESTION's tokens that the candidate text covers. */
  coverageOfQuery: number;
  /** Share of the CANDIDATE's tokens that the query covers. */
  coverageOfTarget: number;
}

export function overlap(query: string, target: string): Overlap {
  const q = new Set(tokenize(query));
  const t = new Set(tokenize(target));
  if (q.size === 0 || t.size === 0) {
    return { shared: 0, coverageOfQuery: 0, coverageOfTarget: 0 };
  }
  let shared = 0;
  for (const token of q) if (t.has(token)) shared += 1;
  return {
    shared,
    coverageOfQuery: shared / q.size,
    coverageOfTarget: shared / t.size,
  };
}

/** Minimum shared topical words before two texts may be called the same. */
export const MIN_SHARED_TOKENS = 2;

/**
 * Is `target` the same question/requirement as `query`?
 *
 * Either the query is almost entirely covered (0.7), or the target is fully
 * contained in a slightly longer query (the "…work here?" / "…work at Acme?"
 * case, where the extra token is the company name). Anything weaker is a miss
 * and the caller says so out loud.
 */
export function isSameTopic(query: string, target: string): boolean {
  if (normalizeForEquality(query) === normalizeForEquality(target)) return true;
  const { shared, coverageOfQuery, coverageOfTarget } = overlap(query, target);
  if (shared < MIN_SHARED_TOKENS) return false;
  if (coverageOfQuery >= 0.7) return true;
  return coverageOfQuery >= 0.6 && coverageOfTarget >= 0.9;
}
