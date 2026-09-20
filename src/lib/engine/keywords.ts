import type { Candidate, Confidence, Evidence, Job, JobRequirement, Level } from "@/lib/types";
import { matchSkill, bestLevel, evidenceConfidence, LEVEL_RANK } from "@/lib/engine/skills";
import { overlap, tokenize, MIN_SHARED_TOKENS } from "@/lib/package/match";

/**
 * Keyword & requirement coverage (§5.8).
 *
 * Answers one question per requirement the posting lists: does this
 * candidate's own evidence answer it, and WHICH evidence does?
 *
 * THREE STATES, NOT TWO. "Present but weakly worded" is a different fact from
 * "present" and from "absent", and it is the most actionable one the product
 * has — it is what `gaps.ts` classifies as a `resume-wording-gap` and what
 * `engine/resume.ts` turns into a rewrite. Collapsing it into "covered" throws
 * that away; collapsing it into "missing" tells the user they lack a skill
 * they actually have.
 *
 * Coverage is a fact about TEXT OVERLAP between the posting and the
 * candidate's recorded evidence. It is never a claim about what an applicant
 * tracking system will do with the résumé — we cannot observe that, so we do
 * not say it. See `summarizeCoverage`.
 *
 * Matching is NOT reimplemented here: canonical skills go through
 * `matchSkill` (engine/skills.ts) and text overlap through `overlap`
 * (package/match.ts), the same pass the package builder uses.
 *
 * Pure: no I/O, no Date, no randomness.
 */

export type CoverageState = "covered" | "partially-covered" | "missing";

/** Why a requirement is only partially covered. Absent on the other states. */
export type CoverageWeakness =
  /** The evidence answers it; the candidate's wording never uses its terms. */
  | "wording"
  /** The wording is there; the evidence behind it is thin or unproven. */
  | "evidence-strength";

export interface RequirementCoverage {
  requirementId: string;
  requirement: string;
  kind: JobRequirement["kind"];
  skillKey?: string;
  state: CoverageState;
  weakness?: CoverageWeakness;
  /** Evidence ids belonging to THIS candidate that support the requirement. */
  supportingEvidenceIds: string[];
  /** The subset whose own wording echoes the requirement's terms. */
  wordingEvidenceIds: string[];
  /** Requirement terms the candidate's recorded text already uses. */
  matchedTerms: string[];
  /** Requirement terms it never uses. */
  missingTerms: string[];
  level: Level;
  confidence: Confidence;
  note: string;
}

export interface CoverageSummary {
  total: number;
  covered: number;
  partiallyCovered: number;
  missing: number;
  /** True only when every listed requirement is fully covered. */
  matchesEveryRequirement: boolean;
  /**
   * The sentence the UI may show. The product line is "matches every keyword
   * and requirement the job lists" — NEVER "passes the ATS", which would be a
   * claim about software we cannot observe.
   */
  statement: string;
}

/* ------------------------------------------------------------------ */
/* Candidate vocabulary                                                */
/* ------------------------------------------------------------------ */

/**
 * Every word the candidate's recorded material actually uses. Built from the
 * evidence graph plus the profile lines that reach a résumé, because "does my
 * résumé contain this term" is a question about the whole document, not about
 * one bullet.
 */
function candidateVocabulary(candidate: Candidate): Set<string> {
  const texts = [
    ...candidate.evidence.map((e) => e.claim),
    candidate.headline,
    candidate.degree,
    candidate.university,
    ...candidate.targetRoles,
  ];
  const words = new Set<string>();
  for (const text of texts) for (const token of tokenize(text)) words.add(token);
  return words;
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

/** The bar `gaps.ts` already uses for "comfortably met". Kept identical. */
function isSubstantiated(level: Level, confidence: Confidence): boolean {
  return LEVEL_RANK[level] >= 2 && confidence !== "low";
}

function noteFor(
  state: CoverageState,
  weakness: CoverageWeakness | undefined,
  supporting: Evidence[],
  fromProfile: boolean,
): string {
  if (state === "covered") {
    if (fromProfile) return "Met from your profile rather than an evidence row.";
    return `Answered by ${supporting.length} recorded item(s), in wording the posting also uses.`;
  }
  if (weakness === "wording") {
    return `Answered by ${supporting.length} recorded item(s), but your wording never uses the posting's terms for it.`;
  }
  if (weakness === "evidence-strength") {
    return `Your wording touches this, but the evidence behind it is thin or has no public proof (${supporting.length} item(s)).`;
  }
  return "No recorded evidence of yours answers this requirement.";
}

export function computeRequirementCoverage(
  candidate: Candidate,
  job: Job,
): RequirementCoverage[] {
  const vocabulary = candidateVocabulary(candidate);
  const order = new Map(candidate.evidence.map((e, i) => [e.id, i] as const));

  return job.requirements.map((req) => {
    /* Canonical skill → evidence stays with matchSkill. */
    const skillMatch = req.skillKey ? matchSkill(req.skillKey, candidate) : undefined;

    /* Evidence whose OWN WORDING echoes the requirement. This is also what
       makes the engine work for a real user: `matchSkill`'s skill→evidence map
       is keyed to the demo evidence ids, so for an imported profile it finds
       nothing and text overlap is the only honest signal left. */
    const wordingIds = candidate.evidence
      .filter((e) => overlap(req.text, e.claim).shared >= MIN_SHARED_TOKENS)
      .map((e) => e.id);

    const ids = [...new Set([...(skillMatch?.supportingEvidenceIds ?? []), ...wordingIds])]
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const supporting = candidate.evidence.filter((e) => ids.includes(e.id));

    /* `matchSkill` satisfies a requirement from the PROFILE (the degree line)
       with no evidence row at all — that is a real "covered", not an absence. */
    const fromProfile =
      Boolean(skillMatch) &&
      skillMatch!.supportingEvidenceIds.length === 0 &&
      isSubstantiated(skillMatch!.level, skillMatch!.confidence);

    const level = fromProfile ? skillMatch!.level : bestLevel(supporting);
    const confidence = fromProfile
      ? skillMatch!.confidence
      : evidenceConfidence(supporting);

    let state: CoverageState;
    let weakness: CoverageWeakness | undefined;
    if (isSubstantiated(level, confidence)) {
      if (fromProfile || wordingIds.length > 0) {
        state = "covered";
      } else {
        state = "partially-covered";
        weakness = "wording";
      }
    } else if (supporting.length > 0) {
      state = "partially-covered";
      weakness = "evidence-strength";
    } else {
      state = "missing";
    }

    const terms = [...new Set(tokenize(req.text))];
    const matchedTerms = terms.filter((t) => vocabulary.has(t));
    const missingTerms = terms.filter((t) => !vocabulary.has(t));

    return {
      requirementId: req.id,
      requirement: req.text,
      kind: req.kind,
      ...(req.skillKey ? { skillKey: req.skillKey } : {}),
      state,
      ...(weakness ? { weakness } : {}),
      supportingEvidenceIds: ids,
      wordingEvidenceIds: wordingIds,
      matchedTerms,
      missingTerms,
      level,
      confidence,
      note: noteFor(state, weakness, supporting, fromProfile),
    };
  });
}

export function summarizeCoverage(rows: RequirementCoverage[]): CoverageSummary {
  const covered = rows.filter((r) => r.state === "covered").length;
  const partiallyCovered = rows.filter((r) => r.state === "partially-covered").length;
  const missing = rows.filter((r) => r.state === "missing").length;
  const matchesEveryRequirement = rows.length > 0 && covered === rows.length;

  const statement =
    rows.length === 0
      ? "This posting has no structured requirements to compare."
      : matchesEveryRequirement
        ? "Your evidence matches every keyword and requirement this job lists."
        : `Your evidence matches ${covered} of ${rows.length} requirements this job lists` +
          `${partiallyCovered > 0 ? `, partly matches ${partiallyCovered}` : ""}` +
          `${missing > 0 ? `, and does not answer ${missing}` : ""}.`;

  return { total: rows.length, covered, partiallyCovered, missing, matchesEveryRequirement, statement };
}
