import { z } from "zod";
import {
  Evidence,
  JobRequirement,
  FitDimension,
  Gap,
  CampaignTask,
  Person,
  AgentActivity,
  Candidate,
  Job,
} from "@/lib/types";

/**
 * Lean schemas the live provider asks Claude to fill. Top-level entity ids
 * (candidate, job, campaign) are assigned SERVER-SIDE after validation, so the
 * model never has to invent them. Everything else reuses the app's canonical
 * Zod schemas — the same contract the demo path uses.
 */

export const LiveCandidate = Candidate.omit({ id: true }).extend({
  evidence: z.array(Evidence),
});
export type LiveCandidate = z.infer<typeof LiveCandidate>;

export const LiveJob = Job.omit({ id: true, source: true }).extend({
  requirements: z.array(JobRequirement),
});
export type LiveJob = z.infer<typeof LiveJob>;

export const LiveAnalysis = z.object({
  readiness: z.enum(["strong", "moderate", "limited", "none"]),
  nextAction: z.string(),
  fit: z.array(FitDimension),
  gaps: z.array(Gap),
  tasks: z.array(CampaignTask),
  /** Role-based outreach targets only — never fabricated real identities (§16). */
  people: z.array(Person),
  activity: z.array(AgentActivity),
});
export type LiveAnalysis = z.infer<typeof LiveAnalysis>;
