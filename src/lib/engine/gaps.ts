import type { Candidate, Job, Gap } from "@/lib/types";
import { matchSkill, LEVEL_RANK } from "@/lib/engine/skills";

/**
 * Gap-to-Action engine (build directive §5.7, Signature Feature 4).
 * Converts every meaningful gap into the single best next action rather than
 * generic criticism. Classification is evidence-aware: a real missing skill is
 * treated differently from a skill that exists but is under-documented.
 */

export function computeGaps(candidate: Candidate, job: Job): Gap[] {
  const gaps: Gap[] = [];

  for (const req of job.requirements) {
    if (!req.skillKey || req.kind === "responsibility") continue;
    const match = matchSkill(req.skillKey, candidate);
    const rank = LEVEL_RANK[match.level];

    const isMinimum = req.kind === "minimum";

    /* --- Debugging: the skill IS demonstrated (cache simulator) but the resume
       frames it as "implemented a simulator", not as low-level debugging. This is
       a framing gap, so it surfaces even when the skill is strongly evidenced —
       checked BEFORE the "comfortably met" skip below. --- */
    if (req.skillKey === "systems_debug" && rank >= 2) {
      gaps.push({
        id: "gap_debug",
        requirement: req.text,
        requirementId: req.id,
        classification: "resume-wording-gap",
        importance: "medium",
        action: {
          kind: "rewrite-bullet",
          summary: "Reframe the cache-simulator bullet around low-level debugging",
          detail:
            "The cache-simulator project already demonstrates debugging across the hardware/software boundary, but the resume describes it as 'implemented a simulator'. Rewriting it to lead with the debugging and correctness work (e.g. 'debugged replacement-policy edge cases against a reference model') maps it directly to this requirement.",
          expectedImpact: "moderate",
          effort: "quick",
        },
        evidenceNote:
          "Strong source-backed evidence exists (cachesim repo) — this is a framing gap, not a skill gap.",
      });
      continue;
    }

    // Requirement is comfortably met — no gap.
    if (rank >= 2 && match.confidence !== "low") continue;

    /* --- CUDA / GPU: a genuine missing skill (the "one true gap"). --- */
    if (req.skillKey === "cuda") {
      gaps.push({
        id: "gap_cuda",
        requirement: req.text,
        requirementId: req.id,
        classification: "true-skill-gap",
        importance: "high",
        action: {
          kind: "build-project",
          summary: "Ship one small CUDA exercise to turn interest into proof",
          detail:
            "The candidate is interested in GPU/parallel work but has no public CUDA artifact. A weekend project — e.g. a CUDA vector-add or tiled matrix-multiply with a short write-up — converts a weak inference into source-backed evidence and directly answers the 'GPU programming a plus' line.",
          expectedImpact: "strong",
          effort: "moderate",
        },
        evidenceNote:
          "Only weak-inference evidence (stated interest) currently supports this.",
      });
      continue;
    }

    /* --- C++ specifically: real but thin and unproven (evidence gap). --- */
    if (req.skillKey === "c_cpp" && rank < 2) {
      gaps.push({
        id: "gap_cpp",
        requirement: req.text,
        requirementId: req.id,
        classification: "evidence-gap",
        importance: isMinimum ? "high" : "medium",
        action: {
          kind: "add-evidence",
          summary: "Make the C/C++ systems work publicly provable",
          detail:
            "C is source-backed via the cache simulator, but C++ is only user-provided with no public artifact. Add a README section or a small C++ component to an existing repo so the C/C++ requirement is backed by public proof rather than a resume line.",
          expectedImpact: "moderate",
          effort: "moderate",
        },
        evidenceNote: "C is proven; C++ exposure is user-provided only.",
      });
      continue;
    }

    /* --- Generic fallback for any other unmet requirement. --- */
    gaps.push({
      id: `gap_${req.id}`,
      requirement: req.text,
      requirementId: req.id,
      classification: isMinimum ? "experience-gap" : "low-priority-gap",
      importance: isMinimum ? "high" : "low",
      action: {
        kind: isMinimum ? "highlight-project" : "apply-anyway",
        summary: isMinimum
          ? "Surface the closest existing evidence for this requirement"
          : "Reasonable to apply despite this preferred item",
        detail: match.note,
        expectedImpact: "limited",
        effort: "quick",
      },
    });
  }

  return gaps;
}
