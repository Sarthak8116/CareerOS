import { describe, it, expect } from "vitest";
import { computeRequirementCoverage, summarizeCoverage } from "@/lib/engine/keywords";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";

const coverage = computeRequirementCoverage(demoCandidate, demoJob);
const byId = new Map(coverage.map((c) => [c.requirementId, c]));

describe("computeRequirementCoverage", () => {
  it("reports every requirement the posting lists, in order", () => {
    expect(coverage.map((c) => c.requirementId)).toEqual(
      demoJob.requirements.map((r) => r.id),
    );
  });

  it("THREE states: 'answered but weakly worded' is neither covered nor missing", () => {
    // req_debug is the canonical case: the cache simulator demonstrates
    // low-level debugging, but nothing the candidate recorded uses the word.
    // Collapsing this into "covered" loses the rewrite; collapsing it into
    // "missing" tells the candidate they lack a skill they have.
    const debug = byId.get("req_debug")!;
    expect(debug.state).toBe("partially-covered");
    expect(debug.weakness).toBe("wording");
    expect(debug.supportingEvidenceIds.length).toBeGreaterThan(0);
    expect(debug.missingTerms).toContain("debugging");
  });

  it("distinguishes a wording gap from a thin-evidence gap", () => {
    // CUDA: the words are there ("GPU", "CUDA") but only a stated interest
    // backs them. A rewrite cannot fix that — a project can.
    const cuda = byId.get("req_cuda")!;
    expect(cuda.state).toBe("partially-covered");
    expect(cuda.weakness).toBe("evidence-strength");
  });

  it("covers a requirement the evidence answers in the posting's own language", () => {
    const os = byId.get("req_os")!;
    expect(os.state).toBe("covered");
    expect(os.supportingEvidenceIds).toContain("ev_os_course");
  });

  it("covers a profile-satisfied requirement without inventing an evidence id", () => {
    const degree = byId.get("req_pursuing")!;
    expect(degree.state).toBe("covered");
    expect(degree.supportingEvidenceIds).toEqual([]);
  });

  it("says missing when nothing the candidate recorded answers the requirement", () => {
    expect(byId.get("resp_runtime")!.state).toBe("missing");
    expect(byId.get("resp_runtime")!.supportingEvidenceIds).toEqual([]);
  });

  it("only ever cites evidence ids belonging to THIS candidate", () => {
    const known = new Set(demoCandidate.evidence.map((e) => e.id));
    for (const row of coverage) {
      for (const id of row.supportingEvidenceIds) expect(known.has(id)).toBe(true);
      for (const id of row.wordingEvidenceIds) expect(known.has(id)).toBe(true);
    }
  });

  it("works for a candidate whose evidence ids are NOT the demo ones", () => {
    // matchSkill's skill->evidence map is keyed to the demo ids. A real,
    // imported profile has its own; coverage must still find the evidence by
    // its wording rather than silently reporting everything as missing.
    const imported = {
      ...demoCandidate,
      id: "cand_imported",
      evidence: [
        {
          id: "ev_import_1",
          claim: "Experience debugging low-level systems code in a C runtime",
          category: "experience" as const,
          sourceType: "resume" as const,
          strength: "strong" as const,
          recency: "current" as const,
          publicProof: false,
          trust: "user-provided" as const,
        },
      ],
    };
    const rows = computeRequirementCoverage(imported, demoJob);
    const debug = rows.find((r) => r.requirementId === "req_debug")!;
    expect(debug.supportingEvidenceIds).toEqual(["ev_import_1"]);
    expect(debug.state).toBe("covered");
  });
});

describe("summarizeCoverage", () => {
  it("counts each state and never claims anything about an ATS", () => {
    const summary = summarizeCoverage(coverage);
    expect(summary.total).toBe(demoJob.requirements.length);
    expect(summary.covered + summary.partiallyCovered + summary.missing).toBe(
      summary.total,
    );
    expect(summary.matchesEveryRequirement).toBe(false);
    expect(summary.statement.toLowerCase()).not.toContain("ats");
    expect(summary.statement.toLowerCase()).not.toContain("applicant tracking");
  });

  it("uses the product's wording when everything is covered", () => {
    const allCovered = coverage.map((c) => ({ ...c, state: "covered" as const }));
    expect(summarizeCoverage(allCovered).statement).toBe(
      "Your evidence matches every keyword and requirement this job lists.",
    );
  });
});
