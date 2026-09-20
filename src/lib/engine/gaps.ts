import type { Candidate, Job, Gap } from "@/lib/types";
import { matchSkill, LEVEL_RANK } from "@/lib/engine/skills";
import { computeRequirementCoverage } from "@/lib/engine/keywords";

/**
 * Gap-to-Action engine (build directive §5.7, Signature Feature 4).
 * Converts every meaningful gap into the single best next action rather than
 * generic criticism. Classification is evidence-aware: a real missing skill is
 * treated differently from a skill that exists but is under-documented.
 */

/** Lines a candidate confirms about themselves; never a skill gap. */
export const ELIGIBILITY =
  /\b\d{2}\s*(?:\+\s*)?years of age\b|\bof legal age\b|authori[sz]ed to work|work authori[sz]ation|\bvisa\b|background check|drug (?:test|screen)/i;

const snippet = (text: string) =>
  text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text;

export function computeGaps(candidate: Candidate, job: Job): Gap[] {
  const gaps: Gap[] = [];

  // Imported postings carry no canonical skill keys. Skipping them meant every
  // real job reported zero gaps; they are judged from coverage instead.
  const coverage = new Map(
    computeRequirementCoverage(candidate, job).map((row) => [row.requirementId, row]),
  );

  for (const req of job.requirements) {
    if (req.kind === "responsibility") continue;
    if (!req.skillKey) {
      // Age and work-eligibility lines are facts only the user can confirm,
      // not skills, and not something evidence could ever "cover".
      if (ELIGIBILITY.test(req.text)) continue;
      const row = coverage.get(req.id);
      if (!row || row.state === "covered") continue;
      const minimum = req.kind === "minimum";
      const wording = row.state === "partially-covered" && row.weakness === "wording";
      const thin = row.state === "partially-covered" && !wording;
      gaps.push({
        id: `gap_${req.id}`,
        requirement: req.text,
        requirementId: req.id,
        classification: wording
          ? "resume-wording-gap"
          : thin
            ? "evidence-gap"
            : minimum
              ? "experience-gap"
              : "low-priority-gap",
        importance: minimum ? "high" : wording || thin ? "medium" : "low",
        action: wording
          ? {
              kind: "rewrite-bullet",
              summary: `Reword existing evidence for: ${snippet(req.text)}`,
              detail: `Your recorded work answers this, but not in the posting's terms${row.missingTerms.length > 0 ? ` (it never says: ${row.missingTerms.slice(0, 4).join(", ")})` : ""}. Reword only where your work genuinely covers it.`,
              expectedImpact: "moderate",
              effort: "quick",
            }
          : thin
            ? {
                kind: "add-evidence",
                summary: `Strengthen the evidence for: ${snippet(req.text)}`,
                detail: "Something you recorded touches this, but it is thin or lacks public proof. Add a concrete artifact or detail that someone can check.",
                expectedImpact: "moderate",
                effort: "moderate",
              }
            : {
                kind: minimum ? "highlight-project" : "apply-anyway",
                summary: minimum
                  ? `No recorded evidence for: ${snippet(req.text)}`
                  : "Reasonable to apply despite this preferred item",
                detail: minimum
                  ? "None of your recorded evidence addresses this. If you have relevant work, add it to your profile; if not, weigh whether this role is the right target."
                  : "None of your recorded evidence addresses this preferred item. It should not block an application.",
                expectedImpact: "limited",
                effort: "quick",
              },
      });
      continue;
    }
    const match = matchSkill(req.skillKey, candidate);
    const rank = LEVEL_RANK[match.level];

    const isMinimum = req.kind === "minimum";

    /* --- Debugging: the skill IS demonstrated (cache simulator) but the resume
       frames it as "implemented a simulator", not as low-level debugging. This is
       a framing gap, so it surfaces even when the skill is strongly evidenced,
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
          "Strong source-backed evidence exists (cachesim repo), this is a framing gap, not a skill gap.",
      });
      continue;
    }

    // Requirement is comfortably met, no gap.
    if (rank >= 2 && match.confidence !== "low") continue;

    /* --- Docker / CI / cloud: on a team with no DevOps, this IS the job. --- */
    if (req.skillKey === "devops") {
      gaps.push({
        id: "gap_devops",
        requirement: req.text,
        requirementId: req.id,
        classification: "true-skill-gap",
        importance: "high",
        action: {
          kind: "build-project",
          summary: "Containerize a project you already shipped and add CI to it",
          detail:
            "Nothing recorded shows Docker, CI/CD or cloud deployment. The fastest honest fix is to add it to work that already exists: write a Dockerfile for an existing project, add a CI workflow that runs its tests on every push, and note the deploy steps in the README. That turns a missing skill into public proof without inventing a new project.",
          expectedImpact: "strong",
          effort: "moderate",
        },
        evidenceNote: "No recorded evidence mentions containers, CI or deployment.",
      });
      continue;
    }

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
            "The candidate is interested in GPU/parallel work but has no public CUDA artifact. A weekend project, e.g. a CUDA vector-add or tiled matrix-multiply with a short write-up, converts a weak inference into source-backed evidence and directly answers the 'GPU programming a plus' line.",
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
