import { describe, it, expect } from "vitest";
import { getResumeRecommendations } from "@/lib/engine/resume";
import { computeRequirementCoverage } from "@/lib/engine/keywords";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";

describe("probe", () => {
  it("other candidate recs length + coverage states", () => {
    const other = {
      ...demoCandidate,
      id: "cand_other",
      name: "Rosalind Ashgrove",
      evidence: [
        {
          id: "ev_other_c",
          claim: "Strong programming work in C on an embedded flight controller",
          category: "experience" as const,
          sourceType: "github" as const,
          sourceReference: "github.com/rashgrove/fc",
          strength: "strong" as const,
          recency: "current" as const,
          publicProof: true,
          trust: "source-backed" as const,
        },
      ],
    };
    const recs = getResumeRecommendations(other, demoJob);
    console.log("OTHER RECS LENGTH:", recs.length, JSON.stringify(recs, null, 2));
    const cov = computeRequirementCoverage(other, demoJob);
    console.log("OTHER COVERAGE:", cov.map(c => ({id: c.requirementId, state: c.state, weakness: c.weakness, supporting: c.supportingEvidenceIds})));

    // Also: same content as demo, but with RENAMED (non-colliding) evidence ids.
    const renamed = {
      ...demoCandidate,
      evidence: demoCandidate.evidence.map((e, i) => ({ ...e, id: `renamed_${i}` })),
    };
    const renamedRecs = getResumeRecommendations(renamed, demoJob);
    console.log("RENAMED RECS LENGTH:", renamedRecs.length);
    const renamedCov = computeRequirementCoverage(renamed, demoJob);
    console.log("RENAMED COVERAGE:", renamedCov.map(c => ({id: c.requirementId, state: c.state, weakness: c.weakness})));

    const demoRecs = getResumeRecommendations(demoCandidate, demoJob);
    console.log("DEMO RECS LENGTH:", demoRecs.length);
    expect(true).toBe(true);
  });
});
