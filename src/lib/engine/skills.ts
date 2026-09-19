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

/** Which evidence ids support each canonical skill, and how strongly. */
const SKILL_EVIDENCE: Record<string, string[]> = {
  c_cpp: ["ev_c", "ev_cpp"],
  os_arch: ["ev_os_course", "ev_cachesim"],
  systems_debug: ["ev_cachesim", "ev_c"],
  degree: [], // satisfied by profile, not evidence rows
  cuda: ["ev_gpu"],
  python: ["ev_py"],
  parallel: ["ev_gpu"],
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

  const ids = SKILL_EVIDENCE[skillKey] ?? [];
  const evidence = candidate.evidence.filter((e) => ids.includes(e.id));
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

export { LEVEL_RANK };
