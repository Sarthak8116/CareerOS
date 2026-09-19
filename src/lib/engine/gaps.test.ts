import { describe, it, expect } from "vitest";
import { computeGaps } from "@/lib/engine/gaps";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";

/**
 * The gap-to-action engine (§5.7) turns every meaningful gap into a single best
 * next action. Traced from Ava Chen's demo data: CUDA is the one genuine skill
 * gap; the debugging requirement is a resume-WORDING gap (the skill is proven by
 * the cache simulator, but the resume doesn't frame it that way); the "parallel
 * computing" preferred item falls through to the low-priority path.
 */

describe("computeGaps (demoCandidate x demoJob)", () => {
  const gaps = computeGaps(demoCandidate, demoJob);

  it("classifies exactly one requirement as a true-skill-gap (the CUDA gap)", () => {
    const trueSkillGaps = gaps.filter((g) => g.classification === "true-skill-gap");
    expect(trueSkillGaps).toHaveLength(1);
    expect(trueSkillGaps[0].id).toBe("gap_cuda");
    expect(trueSkillGaps[0].requirementId).toBe("req_cuda");
    expect(trueSkillGaps[0].action.kind).toBe("build-project");
  });

  it("surfaces a resume-wording-gap for the debugging requirement (framing, not skill)", () => {
    const wording = gaps.filter((g) => g.classification === "resume-wording-gap");
    expect(wording).toHaveLength(1);
    expect(wording[0].requirementId).toBe("req_debug");
    expect(wording[0].action.kind).toBe("rewrite-bullet");
  });

  it("gives every gap an action with a non-empty summary and detail", () => {
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(gap.action.summary.trim().length).toBeGreaterThan(0);
      expect(gap.action.detail.trim().length).toBeGreaterThan(0);
    }
  });

  it("routes the parallel-computing preferred item to the low-priority path", () => {
    const perf = gaps.find((g) => g.requirementId === "req_perf");
    expect(perf).toBeDefined();
    expect(perf!.classification).toBe("low-priority-gap");
    expect(perf!.action.kind).toBe("apply-anyway");
  });

  it("does not raise gaps for comfortably-met requirements (os/arch, degree, python)", () => {
    const ids = gaps.map((g) => g.requirementId);
    expect(ids).not.toContain("req_os");
    expect(ids).not.toContain("req_pursuing");
    expect(ids).not.toContain("req_python");
  });
});
