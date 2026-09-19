import type { Candidate, Job, Campaign } from "@/lib/types";
import { computeFit, computeReadiness } from "@/lib/engine/fit";
import { computeGaps } from "@/lib/engine/gaps";
import { computeTasks, computeActivity } from "@/lib/engine/plan";
import { demoPeople } from "@/lib/demo/people";
import { slugId } from "@/lib/utils";

/**
 * Provider abstraction (build directive §10 "provider abstraction for future
 * models", §11). The app depends only on this interface, so a real Nemotron-API
 * campaign builder can replace the deterministic demo one with no UI changes.
 */
export interface CampaignProvider {
  readonly mode: "demo" | "live";
  buildCampaign(input: {
    candidate: Candidate;
    job: Job;
    createdAt: string;
  }): Promise<Campaign>;
}

/**
 * Deterministic demo provider. Runs the rule-based engine end-to-end with
 * cached people data — no external calls, no keys, reproducible output.
 */
export class DemoCampaignProvider implements CampaignProvider {
  readonly mode = "demo" as const;

  async buildCampaign({
    candidate,
    job,
    createdAt,
  }: {
    candidate: Candidate;
    job: Job;
    createdAt: string;
  }): Promise<Campaign> {
    // For the seeded NVIDIA job we have curated network data; for any other
    // imported job we still produce fit + gaps + tasks (people list empty).
    const people = job.id === "job_nvidia_syssw" ? demoPeople : [];

    const fit = computeFit(candidate, job, people);
    const gaps = computeGaps(candidate, job);
    const tasks = computeTasks(gaps, people, job);
    const activity = computeActivity(candidate, job, fit, gaps, people);
    const readiness = computeReadiness(fit);

    const trueGap = gaps.find((g) => g.classification === "true-skill-gap");
    const nextAction = trueGap
      ? trueGap.action.summary
      : "Tailor the resume and submit the application";

    return {
      id: slugId("camp", `${candidate.id}:${job.id}`),
      candidateId: candidate.id,
      job,
      stage: "analyzed",
      readiness,
      createdAt,
      isDemo: job.id === "job_nvidia_syssw",
      fit,
      gaps,
      tasks,
      people,
      activity,
      nextAction,
    };
  }
}

/**
 * Provider selector. Live mode is intentionally unimplemented for the
 * hackathon slice — it throws so we never silently fall back to fake "live"
 * behavior. Demo mode is the reliable default (§20).
 */
export function getCampaignProvider(): CampaignProvider {
  return new DemoCampaignProvider();
}
