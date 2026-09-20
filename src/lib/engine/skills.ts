import type { Candidate, Evidence, Level, Confidence } from "@/lib/types";

/**
 * Maps a job requirement's canonical skillKey to the candidate's supporting
 * evidence, producing a categorical match Level + confidence. Deterministic
 * and evidence-grounded — no invented experience (§5.1, §16).
 */

export interface SkillMatch {
  skillKey: string;
  level: Level;
  confidence: Confidence;
  supportingEvidenceIds: string[];
  note: string;
}

/**
 * Conservative textual signals for the canonical skills used by the demo and
 * deterministic engines.
 *
 * Evidence ids are deliberately absent. Imported profiles assign their own
 * ids, so an id-based map makes the same claim count for the demo candidate
 * and disappear for everybody else. These patterns only recognize terms the
 * candidate actually recorded; an unknown skill remains an honest miss.
 */
const SKILL_SIGNALS: Readonly<Record<string, readonly RegExp[]>> = {
  c_cpp: [
    /(?:^|[^a-z0-9])c\+\+(?=$|[^a-z0-9])/i,
    /(?:^|[^a-z0-9])cpp(?=$|[^a-z0-9])/i,
    /(?:^|[^a-z0-9])c(?=$|[^a-z0-9])/i,
    /\bsystems? programming\b/i,
  ],
  os_arch: [
    /\boperating systems?\b/i,
    /\bcomputer architecture\b/i,
    /\bcache simulator\b/i,
    /\bmemory allocator\b/i,
  ],
  systems_debug: [
    /\bdebug(?:ged|ging)?\b/i,
    /\btroubleshoot(?:ed|ing)?\b/i,
    /\bcache simulator\b/i,
    /\bmemory allocator\b/i,
    /\blow[- ]level\b/i,
    /\bembedded\b/i,
    /\bsystems? programming\b/i,
  ],
  cuda: [/\bcuda\b/i, /\bgpu\b/i],
  backend_api: [/\bapis?\b/i, /\bbackend\b/i, /\bfastapi\b/i, /\bflask\b/i, /\brest\b/i, /\bweb service\b/i],
  shipping: [/\bshipped\b/i, /\blaunched\b/i, /\bdeployed\b/i, /\bused by\b/i, /\bin production\b/i, /\bmerged\b/i],
  ml_basics: [/\bmachine learning\b/i, /\bneural[- ]network\b/i, /\bmodel training\b/i, /\binference\b/i],
  devops: [/\bdocker\b/i, /\bkubernetes\b/i, /\bci\/cd\b/i, /\bgithub actions\b/i, /\baws\b/i, /\bgcp\b/i],
  communication: [/\bteaching assistant\b/i, /\bdocumentation\b/i, /\btechnical writing\b/i, /\bwrote\b.*\bdocs?\b/i],
  python: [/\bpython\b/i],
  parallel: [
    /\bparallel\b/i,
    /\bconcurren(?:cy|t)\b/i,
    /\bmultithread(?:ed|ing)?\b/i,
    /\bcuda\b/i,
    /\bgpu\b/i,
  ],
};

const LEVEL_RANK: Record<Level, number> = {
  strong: 3,
  moderate: 2,
  limited: 1,
  none: 0,
};
const RANK_LEVEL: Level[] = ["none", "limited", "moderate", "strong"];

function bestLevel(evidence: Evidence[]): Level {
  if (evidence.length === 0) return "none";
  const max = Math.max(...evidence.map((e) => LEVEL_RANK[e.strength]));
  return RANK_LEVEL[max];
}

function confidenceFor(evidence: Evidence[]): Confidence {
  if (evidence.length === 0) return "low";
  const hasPublicProof = evidence.some((e) => e.publicProof);
  const hasWeakInference = evidence.every(
    (e) => e.trust === "weak-inference" || e.trust === "unknown",
  );
  if (hasWeakInference) return "low";
  if (hasPublicProof) return "high";
  return "medium";
}

export function matchSkill(
  skillKey: string,
  candidate: Candidate,
): SkillMatch {
  // Degree is verified from the profile, not an evidence row.
  if (skillKey === "degree") {
    return {
      skillKey,
      level: "strong",
      confidence: "high",
      supportingEvidenceIds: [],
      note: `${candidate.degree}, graduating ${candidate.graduationYear} — requirement met.`,
    };
  }

  const signals = SKILL_SIGNALS[skillKey] ?? [];
  const evidence = candidate.evidence.filter((item) =>
    signals.some((signal) => signal.test(item.claim)),
  );
  const level = bestLevel(evidence);
  const confidence = confidenceFor(evidence);

  let note: string;
  if (evidence.length === 0) {
    note = "No supporting candidate evidence found.";
  } else {
    const publicCount = evidence.filter((e) => e.publicProof).length;
    note =
      `${evidence.length} supporting item(s)` +
      (publicCount ? `, ${publicCount} with public proof.` : ", none with public proof.");
  }

  return { skillKey, level, confidence, supportingEvidenceIds: evidence.map((e) => e.id), note };
}

export function matchAll(
  skillKeys: string[],
  candidate: Candidate,
): Record<string, SkillMatch> {
  const out: Record<string, SkillMatch> = {};
  for (const key of skillKeys) out[key] = matchSkill(key, candidate);
  return out;
}

/**
 * Exported so other engines can grade a set of evidence the SAME way this one
 * does instead of keeping a second copy of the rules (engine/keywords.ts).
 * `confidenceFor` is re-exported under a clearer name for external callers.
 */
export { LEVEL_RANK, bestLevel, confidenceFor as evidenceConfidence };
