import type { Gap } from "@/lib/types";

export interface ProjectProposal {
  title: string;
  goal: string;
  deliverable: string;
  milestones: string[];
  prompt: string;
  honestyNote: string;
}

/**
 * Turn an existing build-project gap into a small, publishable evidence plan.
 * This is deliberately deterministic and proposal-only: completing a project
 * never becomes candidate evidence until the user imports or confirms it.
 */
export function proposeProject(gap: Gap): ProjectProposal | undefined {
  if (gap.action.kind !== "build-project") return undefined;

  if (/cuda|gpu/i.test(gap.requirement)) {
    return {
      title: "CUDA Vector Add + Tiled Matrix Multiply",
      goal: "Turn GPU programming interest into a small, inspectable artifact.",
      deliverable:
        "A public repository with a CUDA vector-add kernel, a tiled matrix-multiply kernel, correctness checks, and a short README.",
      milestones: [
        "Implement and test a CPU reference version.",
        "Add the CUDA kernels and compare correctness against the reference.",
        "Publish the code, test results, and one reproducible benchmark.",
      ],
      prompt:
        "Build a small, honest CUDA portfolio project: implement a CPU reference " +
        "version, a CUDA vector-add kernel, and a tiled matrix-multiply kernel. " +
        "Add correctness checks against the CPU implementation, explain the " +
        "thread/block and memory-access choices in a README, and include one " +
        "reproducible benchmark. Do not claim performance improvements you did " +
        "not measure.",
      honestyNote:
        "This is a proposed project, not evidence that CUDA work is already complete.",
    };
  }

  return {
    title: `Evidence sprint: ${gap.requirement}`,
    goal: "Build one narrow artifact that directly exercises this requirement.",
    deliverable:
      "A public repository with a runnable example, a README explaining the design, and one reproducible result.",
      milestones: [
        "Choose the smallest testable scope that answers the requirement.",
        "Implement the example with a repeatable validation step.",
        "Publish the artifact and document what it proves and what it does not.",
      ],
      prompt:
        `Build a small portfolio project that directly exercises this requirement: "${gap.requirement}". ` +
        "Keep the scope to a few days, include a runnable example, add a " +
        "repeatable validation step, and write a README that separates measured " +
        "results from future work. Do not invent experience or metrics.",
      honestyNote:
      "This is a proposed project, not evidence that the requirement is already satisfied.",
  };
}
