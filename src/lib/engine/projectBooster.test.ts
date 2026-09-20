import { describe, expect, it } from "vitest";
import { computeGaps } from "@/lib/engine/gaps";
import { proposeProject } from "@/lib/engine/projectBooster";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";

describe("proposeProject", () => {
  it("turns the demo CUDA gap into a concrete evidence plan", () => {
    const cudaGap = computeGaps(demoCandidate, demoJob).find(
      (gap) => gap.requirementId === "req_cuda",
    )!;
    const proposal = proposeProject(cudaGap);

    expect(proposal?.title).toContain("CUDA");
    expect(proposal?.milestones).toHaveLength(3);
    expect(proposal?.deliverable).toContain("public repository");
    expect(proposal?.honestyNote).toContain("not evidence");
  });

  it("returns nothing for gaps whose action is not a project", () => {
    const gap = computeGaps(demoCandidate, demoJob).find(
      (candidateGap) => candidateGap.requirementId === "req_debug",
    )!;
    expect(proposeProject(gap)).toBeUndefined();
  });
});
