import type {
  Candidate,
  Evidence,
  EvidenceCategory,
  Job,
  Confidence,
  ResumeRecommendation,
  ClaimFlag,
} from "@/lib/types";
import {
  BUZZWORD_TERMS,
  INVENTED_METRIC_PATTERNS,
  RESUME_SECTIONS,
} from "@/lib/demo/resume";
import { LEVEL_RANK } from "@/lib/engine/skills";
import {
  computeRequirementCoverage,
  type RequirementCoverage,
} from "@/lib/engine/keywords";

export type ResumeStylePreference = "more" | "less" | "neutral";

export interface ResumeStyleMemory {
  proofLinks: ResumeStylePreference;
  mergedBullets: ResumeStylePreference;
}

/**
 * Resume & Application Studio engine (§5.8).
 *
 * Two responsibilities, both strictly evidence-grounded and deterministic
 * (no Math.random, no new Date):
 *
 *  1. getResumeRecommendations, rewrite existing resume bullets so the
 *     candidate's REAL evidence is framed against the job's REQUIREMENTS.
 *     Every `suggested` line is built from Evidence rows belonging to THIS
 *     candidate; nothing is invented, no metrics are added.
 *
 *     This used to be a hardcoded bank of prose keyed to the demo
 *     candidate's evidence ids. For anyone else `citeEvidence` degraded
 *     silently to raw ids and the product emitted confident sentences about
 *     a different person. It is now generated per candidate, per job, and
 *     an empty list is the honest answer when nothing supports a rewrite.
 *
 *  2. verifyClaims, the honesty pass. Flags risky claims (weak evidence,
 *     unsupported assertions, buzzword filler, fabricated metrics) so the
 *     candidate fixes them before an employer does.
 */

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function evidenceById(candidate: Candidate, id: string): Evidence | undefined {
  return candidate.evidence.find((e) => e.id === id);
}

/** Human-readable "evidenceUsed" string, with the public-proof reference. */
function citeEvidence(candidate: Candidate, ids: string[]): string {
  const parts = ids.map((id) => {
    const ev = evidenceById(candidate, id);
    if (!ev) return id;
    const ref = ev.publicProof && ev.sourceReference ? ` (${ev.sourceReference})` : "";
    return `${id}: ${ev.claim}${ref}`;
  });
  return parts.join("; ");
}

/**
 * Confidence in a rewrite = strength of the evidence behind it.
 * Public, source-backed proof → high. User-provided but consistent →
 * medium. Anything resting on weak inference → low.
 */
function confidenceFor(candidate: Candidate, ids: string[]): Confidence {
  const evidence = ids
    .map((id) => evidenceById(candidate, id))
    .filter((e): e is Evidence => Boolean(e));
  if (evidence.length === 0) return "low";
  if (evidence.some((e) => e.trust === "weak-inference" || e.trust === "unknown")) {
    return "low";
  }
  if (evidence.some((e) => e.publicProof)) return "high";
  return "medium";
}

/* ------------------------------------------------------------------ */
/* 1. Resume recommendations                                           */
/* ------------------------------------------------------------------ */

/**
 * A rewrite is a REFRAMING of evidence the candidate already recorded, never
 * an addition to it. Two transformations are allowed, and only these two:
 *
 *  1. attach the public proof reference to the line that answers the
 *     requirement, so the reviewer sees the link beside the claim;
 *  2. group the evidence that answers one requirement into a single bullet,
 *     strongest first.
 *
 * What is DELIBERATELY not done: putting the posting's own language into the
 * candidate's bullet. A posting says "Strong programming skills in C or C++";
 * copying that lead in would assert a strength the evidence may not carry,
 * and "reframe, never add scope" is the line this engine exists to hold. The
 * terms the posting uses and the candidate's evidence does not are reported
 * in `reason` instead, for the candidate to decide about.
 */

/** At most this many evidence rows are merged into one bullet. */
const MAX_MERGED_EVIDENCE = 3;

/** Evidence trust labels that make a claim an interest, not a demonstration. */
const WEAK_TRUST = new Set(["weak-inference", "unknown"]);

/** Flags from verifyClaims that mean a rewrite must not be offered at all. */
const DISQUALIFYING_ISSUES = new Set<ClaimFlag["issue"]>([
  "unsupported",
  "invented-metric",
]);

const SECTION_FOR_CATEGORY: Record<EvidenceCategory, string> = {
  experience: RESUME_SECTIONS.experience,
  project: RESUME_SECTIONS.projects,
  skill: RESUME_SECTIONS.skills,
  education: RESUME_SECTIONS.education,
  achievement: RESUME_SECTIONS.experience,
  leadership: RESUME_SECTIONS.experience,
};

/** The public proof reference for a row, when it has one that can be linked. */
function proofReference(evidence: Evidence): string | undefined {
  return evidence.publicProof && evidence.sourceReference
    ? evidence.sourceReference
    : undefined;
}

/**
 * The merged bullet: each claim VERBATIM, each followed by its proof the
 * first time that proof appears. Two rows often share one repo, and printing
 * the same link twice in one line reads as padding rather than as evidence.
 */
function mergeBullet(
  cited: Evidence[],
  styleMemory?: ResumeStyleMemory,
): string {
  const seen = new Set<string>();
  return cited
    .map((evidence) => {
      const ref = proofReference(evidence);
      if (
        styleMemory?.proofLinks === "less" ||
        !ref ||
        seen.has(ref)
      ) {
        return evidence.claim;
      }
      seen.add(ref);
      return `${evidence.claim} (${ref})`;
    })
    .join("; ");
}

/** Strongest and most provable first; ties break on id so output is stable. */
function orderForBullet(evidence: Evidence[]): Evidence[] {
  return [...evidence].sort((a, b) => {
    const strength = LEVEL_RANK[b.strength] - LEVEL_RANK[a.strength];
    if (strength !== 0) return strength;
    if (a.publicProof !== b.publicProof) return a.publicProof ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/** A merged bullet is only as trustworthy as its weakest line. */
function weakestOf(evidence: Evidence[]): Evidence {
  return [...evidence].sort((a, b) => {
    const at = WEAK_TRUST.has(a.trust) ? 0 : 1;
    const bt = WEAK_TRUST.has(b.trust) ? 0 : 1;
    if (at !== bt) return at - bt;
    const strength = LEVEL_RANK[a.strength] - LEVEL_RANK[b.strength];
    if (strength !== 0) return strength;
    if (a.publicProof !== b.publicProof) return a.publicProof ? 1 : -1;
    return a.id.localeCompare(b.id);
  })[0];
}

/**
 * Confidence in a MERGED rewrite. `confidenceFor` calls a set high when any
 * member has public proof; a bullet that also carries an unproven line is not
 * as good as its best half, so it is capped.
 */
function rewriteConfidence(candidate: Candidate, cited: Evidence[]): Confidence {
  const base = confidenceFor(candidate, cited.map((e) => e.id));
  if (base === "high" && cited.some((e) => !e.publicProof)) return "medium";
  return base;
}

/**
 * The honesty gate on a generated rewrite.
 *
 * REUSES `verifyClaims` rather than writing softer rules: the rewrite is run
 * through it carrying the WEAKEST cited row's trust, strength and proof, so a
 * sentence resting on an interest or an unbacked metric is rejected exactly
 * as that row would be. One rule is added, and it is stricter, never looser:
 * a rewrite may not contain a digit its source claims do not contain.
 */
function isGrounded(candidate: Candidate, suggested: string, cited: Evidence[]): boolean {
  if (cited.length === 0) return false;

  const carrier = weakestOf(cited);
  const probe: Evidence = { ...carrier, id: "rec_probe", claim: suggested };
  const flags = verifyClaims({ ...candidate, evidence: [probe] });
  if (flags.some((f) => DISQUALIFYING_ISSUES.has(f.issue))) return false;

  const source = cited.map((e) => e.claim).join(" ");
  return (suggested.match(/\d+/g) ?? []).every((run) => source.includes(run));
}

function reasonFor(row: RequirementCoverage, merged: boolean): string {
  const base = merged
    ? "Groups the evidence that answers this requirement into one bullet, strongest first, with your public links attached, the reviewer sees the proof beside the claim instead of hunting for it."
    : "Attaches your public proof to the line that answers this requirement, so the claim arrives with its source.";

  if (row.missingTerms.length === 0) return base;

  const terms = row.missingTerms.slice(0, 5).map((t) => `"${t}"`).join(", ");
  return (
    `${base} The posting words this requirement as "${row.requirement}", and your recorded evidence never uses ${terms}. ` +
    "Add those words yourself only where your work genuinely covers them, CareerOS will not put a skill, a metric, or a scope in your resume that your evidence does not back."
  );
}

/**
 * Rewrites for THIS candidate against THIS job.
 *
 * Only requirements the candidate's evidence already answers but does not
 * WORD like the posting produce a rewrite, that is the one gap a rewrite can
 * actually close. A missing requirement needs evidence, not prose, and a thin
 * one needs a project (both are `gaps.ts`'s job). A requirement whose rewrite
 * would be identical to what the candidate already recorded produces nothing.
 */
export function getResumeRecommendations(
  candidate: Candidate,
  job: Job,
  styleMemory?: ResumeStyleMemory,
): ResumeRecommendation[] {
  const recommendations: ResumeRecommendation[] = [];

  for (const row of computeRequirementCoverage(candidate, job)) {
    if (row.state !== "partially-covered" || row.weakness !== "wording") continue;

    const supporting = candidate.evidence.filter((e) =>
      row.supportingEvidenceIds.includes(e.id),
    );
    const cited = orderForBullet(supporting).slice(0, MAX_MERGED_EVIDENCE);
    const bulletEvidence =
      styleMemory?.mergedBullets === "less" ? cited.slice(0, 1) : cited;
    if (bulletEvidence.length === 0) continue;

    const original = bulletEvidence[0].claim;
    const suggested = mergeBullet(bulletEvidence, styleMemory);
    // Nothing to change is not a recommendation.
    if (suggested === original) continue;
    if (!isGrounded(candidate, suggested, bulletEvidence)) continue;

    recommendations.push({
      id: `rec_${row.requirementId}`,
      section: SECTION_FOR_CATEGORY[bulletEvidence[0].category],
      original,
      suggested,
      reason: reasonFor(row, bulletEvidence.length > 1),
      requirementAddressed: row.requirement,
      evidenceUsed: citeEvidence(candidate, bulletEvidence.map((e) => e.id)),
      confidence: rewriteConfidence(candidate, bulletEvidence),
      status: "pending" as const,
    });
  }

  return recommendations;
}

/* ------------------------------------------------------------------ */
/* 2. Claim verification (the honesty pass)                            */
/* ------------------------------------------------------------------ */

function findBuzzword(text: string): string | undefined {
  const lower = text.toLowerCase();
  return BUZZWORD_TERMS.find((term) => lower.includes(term));
}

function hasInventedMetric(text: string): boolean {
  return INVENTED_METRIC_PATTERNS.some((re) => re.test(text));
}

/**
 * Flags risky claims per §5.8. Deterministic scan over the candidate's own
 * evidence, the flags are advisory ("fix this before an employer notices"),
 * never fabrications. On honest, evidence-labelled data most claims pass:
 * that clean result is itself the point.
 */
export function verifyClaims(candidate: Candidate): ClaimFlag[] {
  const flags: ClaimFlag[] = [];

  for (const ev of candidate.evidence) {
    // Fabricated / unverifiable performance metric with no public proof.
    if (hasInventedMetric(ev.claim) && !ev.publicProof) {
      flags.push({
        id: `flag_metric_${ev.id}`,
        text: ev.claim,
        issue: "invented-metric",
        severity: "strong",
        note: "Contains a performance figure with no public benchmark or source to back it. Remove the number or link the proof, invented metrics are the fastest way to lose credibility in a screen.",
      });
      continue; // one primary flag per claim keeps the list actionable
    }

    // Unsupported: interest/aspiration presented without any shipped proof.
    if (ev.trust === "weak-inference" || ev.trust === "unknown") {
      flags.push({
        id: `flag_unsupported_${ev.id}`,
        text: ev.claim,
        issue: "unsupported",
        severity: "moderate",
        note: "No shipped artifact backs this yet, it is an interest, not a demonstrated skill. Keep it phrased as interest (as written) or close the gap with a small public project before claiming competence.",
      });
      continue;
    }

    // Weak evidence: user-provided, limited strength, nothing public.
    if (ev.trust === "user-provided" && !ev.publicProof && ev.strength === "limited") {
      flags.push({
        id: `flag_weak_${ev.id}`,
        text: ev.claim,
        issue: "weak-evidence",
        severity: "limited",
        note: "Self-reported, limited, and unverifiable publicly. Fine to keep if phrased honestly (e.g. 'coursework exposure'); do not upgrade it to a strong proficiency claim.",
      });
      continue;
    }

    // Buzzword filler: an empty intensifier the evidence could replace.
    const buzz = findBuzzword(ev.claim);
    if (buzz) {
      flags.push({
        id: `flag_buzz_${ev.id}`,
        text: ev.claim,
        issue: "vague-buzzword",
        severity: "limited",
        note: `Uses the filler word "${buzz}". Swap it for the concrete evidence you already have (projects, repos), show the skill instead of asserting it.`,
      });
    }
  }

  return flags;
}
