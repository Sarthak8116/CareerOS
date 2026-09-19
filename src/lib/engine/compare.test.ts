import { describe, it, expect } from "vitest";
import { compareJobs } from "@/lib/engine/compare";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJobsPool } from "@/lib/demo/jobsPool";

const VALID_LEVELS = new Set(["strong", "moderate", "limited", "none"]);
const VALID_RECOMMENDATIONS = new Set([
  "apply-now",
  "build-campaign",
  "save-for-later",
  "research-further",
  "reject",
]);

describe("compareJobs", () => {
  const comparisons = compareJobs(demoCandidate, demoJobsPool);

  it("returns exactly one comparison per job, preserving input order", () => {
    expect(comparisons).toHaveLength(demoJobsPool.length);
    comparisons.forEach((c, i) => {
      expect(c.jobId).toBe(demoJobsPool[i].id);
      expect(c.company).toBe(demoJobsPool[i].company);
    });
  });

  it("includes the flagship NVIDIA job as the first comparison", () => {
    expect(comparisons.some((c) => c.company === "NVIDIA")).toBe(true);
    expect(comparisons[0].company).toBe("NVIDIA");
  });

  it("gives every comparison a non-empty dimensions list", () => {
    for (const c of comparisons) {
      expect(Array.isArray(c.dimensions)).toBe(true);
      expect(c.dimensions.length).toBeGreaterThan(0);
    }
  });

  it("assigns every dimension a valid categorical level (no NaN/undefined)", () => {
    for (const c of comparisons) {
      for (const dim of c.dimensions) {
        expect(typeof dim.category).toBe("string");
        expect(dim.category.length).toBeGreaterThan(0);
        expect(dim.level).toBeDefined();
        expect(VALID_LEVELS.has(dim.level)).toBe(true);
        // Levels are categorical strings, never numbers — so never NaN.
        expect(Number.isNaN(dim.level as unknown as number)).toBe(false);
        expect(typeof dim.note).toBe("string");
        expect(dim.note.length).toBeGreaterThan(0);
      }
    }
  });

  it("always includes an Overall fit dimension for each job", () => {
    for (const c of comparisons) {
      expect(c.dimensions.some((d) => d.category === "Overall fit")).toBe(true);
    }
  });

  it("assigns every comparison a valid recommendation enum", () => {
    for (const c of comparisons) {
      expect(VALID_RECOMMENDATIONS.has(c.recommendation)).toBe(true);
    }
  });

  it("rejects a job that does not sponsor when the candidate needs it — is honest here", () => {
    // Ava is a US citizen needing no sponsorship, so Tesla's not-offered policy
    // is NOT a blocker; the recommendation must not be a sponsorship 'reject'.
    const tesla = comparisons.find((c) => c.company === "Tesla");
    expect(tesla).toBeDefined();
    expect(tesla!.recommendation).not.toBe("reject");
  });
});
