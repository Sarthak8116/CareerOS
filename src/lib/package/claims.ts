import type { Candidate, Evidence, PackageClaim } from "@/lib/types";
import { verifyClaims } from "@/lib/engine/resume";
import { INVENTED_METRIC_PATTERNS } from "@/lib/demo/resume";

/**
 * Grounding for generated prose, the honesty pass over a cover letter.
 *
 * Free prose about a real person is the riskiest thing this product emits, so
 * every sentence is graded individually and the grading REUSES the existing
 * `verifyClaims` rules rather than inventing softer ones. The only additions
 * here are STRICTER than verifyClaims, never looser:
 *
 *  1. A generated sentence must not add numeric precision its cited evidence
 *     does not contain. verifyClaims lets a metric pass when the evidence has
 *     public proof; a cover letter is prose the model wrote, so "improved
 *     throughput by 40%" is rejected unless "40" appears in the cited claim.
 *  2. A sentence the model labelled as intent or profile is DEMOTED back to a
 *     claim (and therefore needs a citation) the moment it asserts experience
 *     or carries a metric. The role label is a routing hint from the model;
 *     these guards are what stop a mislabelled assertion from slipping into
 *     the "user-provided" bucket unexamined.
 *
 * Pure: no I/O, no Date, no randomness.
 */

/**
 * What a sentence is doing, as declared by the generator.
 *
 *  - "evidence", asserts something about the candidate's work or skills.
 *                 Must cite an Evidence id or it is unsupported.
 *  - "profile" , restates a stored profile field (name, headline, degree).
 *                 Must literally contain one of those values.
 *  - "intent"  , about the role, the company, or the act of applying.
 *                 Must assert nothing about the candidate's background.
 */
export type SentenceRole = "evidence" | "profile" | "intent";

export interface GroundedSentence {
  text: string;
  role: SentenceRole;
  /** An Evidence id from the candidate's graph. Required for "evidence". */
  evidenceId?: string;
}

/**
 * First-person assertions about work history. Used ONLY to demote a sentence
 * into the stricter bucket, it can never promote one, so a phrasing this
 * misses still has to survive the citation check, and a phrasing it catches
 * merely has to be cited. Failing open is therefore not silent leakage.
 */
const ASSERTS_EXPERIENCE =
  /\bI\s+(?:built|wrote|led|shipped|designed|developed|implemented|created|managed|architected|founded|launched|optimi[sz]ed|scaled|delivered|contributed|maintained)\b|\bI(?:'ve|\s+have|\s+had)\b[^.]{0,60}\b(?:years?|experience|expertise|background|internship|degree|shipped|built)\b|\bmy\s+(?:experience|background|work|projects?|role|team|internship|research)\b/i;

function hasMetric(text: string): boolean {
  return INVENTED_METRIC_PATTERNS.some((re) => re.test(text));
}

/** Every digit run in the text, e.g. "by 40% over 3 months" → ["40", "3"]. */
function digitRuns(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}

/**
 * True when the sentence adds numeric precision the cited evidence lacks.
 * Only consulted for sentences that actually read as a performance metric, so
 * "the 2026 internship" (a date from the posting) is not caught.
 */
function addsPrecision(text: string, citedClaim: string): boolean {
  if (!hasMetric(text)) return false;
  return digitRuns(text).some((run) => !citedClaim.includes(run));
}

/**
 * The stored profile values a "profile" sentence is allowed to restate.
 * Anything not in this list is not a profile fact, whatever the model called it.
 */
export function profileValues(candidate: Candidate): string[] {
  return [
    candidate.name,
    candidate.headline,
    candidate.location,
    candidate.university,
    candidate.degree,
    String(candidate.graduationYear),
    candidate.workAuthorization,
    ...candidate.targetRoles,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && value.length >= 3));
}

function restatesProfile(text: string, values: string[]): boolean {
  const lower = text.toLowerCase();
  return values.some((value) => lower.includes(value.toLowerCase()));
}

/**
 * Resolve the declared role into the one we will actually enforce.
 * Only ever moves toward "evidence" (the strictest bucket).
 */
function effectiveRole(
  sentence: GroundedSentence,
  values: string[],
): SentenceRole {
  if (sentence.role === "evidence") return "evidence";
  if (ASSERTS_EXPERIENCE.test(sentence.text) || hasMetric(sentence.text)) {
    return "evidence";
  }
  if (sentence.role === "profile" && !restatesProfile(sentence.text, values)) {
    return "evidence";
  }
  return sentence.role;
}

/** Issues from verifyClaims that mean the sentence must not stand as evidenced. */
const DISQUALIFYING = new Set(["unsupported", "invented-metric"]);

/** `flag_metric_ltr_3` → `ltr_3`. */
const FLAG_ID = /^flag_(?:metric|unsupported|weak|buzz)_(ltr_\d+)$/;

/**
 * Grade every sentence of a generated document against the candidate's
 * evidence graph. Returns one PackageClaim per sentence, in order.
 *
 * Uncited "evidence" sentences are given trust "unknown", which is precisely
 * the condition `verifyClaims` already treats as unsupported, that is the
 * reuse, not a re-implementation of it.
 */
export function groundSentences(
  sentences: GroundedSentence[],
  candidate: Candidate,
): PackageClaim[] {
  const values = profileValues(candidate);
  const byId = new Map(candidate.evidence.map((e) => [e.id, e] as const));

  const roles = sentences.map((s) => effectiveRole(s, values));

  // Build a synthetic candidate whose "evidence" is the sentences themselves,
  // so the existing honesty pass grades the prose with its own rules.
  const synthetic: Evidence[] = [];
  const syntheticIndex = new Map<string, number>();
  sentences.forEach((sentence, index) => {
    if (roles[index] !== "evidence") return;
    const id = `ltr_${index}`;
    syntheticIndex.set(id, index);
    const cited = sentence.evidenceId ? byId.get(sentence.evidenceId) : undefined;
    synthetic.push(
      cited
        ? { ...cited, id, claim: sentence.text }
        : {
            id,
            claim: sentence.text,
            category: "skill",
            sourceType: "resume",
            strength: "none",
            recency: "unknown",
            publicProof: false,
            trust: "unknown",
          },
    );
  });

  const issues = new Map<number, Set<string>>();
  for (const flag of verifyClaims({ ...candidate, evidence: synthetic })) {
    const match = FLAG_ID.exec(flag.id);
    if (!match) continue;
    const index = syntheticIndex.get(match[1]);
    if (index === undefined) continue;
    const set = issues.get(index) ?? new Set<string>();
    set.add(flag.issue);
    issues.set(index, set);
  }

  return sentences.map((sentence, index) => {
    if (roles[index] !== "evidence") {
      // Rests on something the user supplied or will own, not on evidence.
      return { text: sentence.text, support: "user-provided" as const };
    }

    const cited = sentence.evidenceId ? byId.get(sentence.evidenceId) : undefined;
    const flagged = issues.get(index);
    const disqualified =
      !cited ||
      [...(flagged ?? [])].some((issue) => DISQUALIFYING.has(issue)) ||
      addsPrecision(sentence.text, cited.claim);

    if (disqualified) {
      return { text: sentence.text, support: "unsupported" as const };
    }
    return {
      text: sentence.text,
      support: "evidenced" as const,
      evidenceId: cited.id,
    };
  });
}

/** How many claims the user must look at before this is safe to send. */
export function countUnsupported(claims: PackageClaim[]): number {
  return claims.filter((c) => c.support === "unsupported").length;
}
