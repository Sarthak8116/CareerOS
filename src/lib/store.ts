"use client";

import type {
  ApplicationForm,
  Campaign,
  CampaignTask,
  Job,
  ResumeRecommendation,
} from "@/lib/types";
import { Campaign as CampaignSchema } from "@/lib/types";
import { demoCandidate } from "@/lib/demo/candidate";
import { getProfile } from "@/lib/profileStore";
import { demoJob, demoJobs } from "@/lib/demo/job";
import { getCampaignProvider } from "@/lib/providers/ai";
import { sanitizeUntrusted } from "@/lib/security/untrusted";
import { slugId } from "@/lib/utils";
import { resetOutreachStates } from "@/lib/outreachStore";

/**
 * Demo-mode persistence (build directive: campaign persists and reloads, §17
 * P0 #19). Client-only localStorage store, seeded with the deterministic
 * NVIDIA campaign. No database and no keys, the real Supabase-backed store
 * slots in behind the same function signatures later.
 */

const KEY = "careeros:campaigns:v1";
const RETIRED_JOB_ID = "job_quillfeather_founding";
const SEED_STAMP = "2026-07-14T00:00:00.000Z";

function canPersist() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readRaw(): Campaign[] {
  if (!canPersist()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate each; drop anything that no longer matches the schema.
    return parsed
      // A sample company that was removed from the app; drop any campaign a
      // browser still has saved for it.
      .filter((c) => c?.job?.id !== RETIRED_JOB_ID)
      .map((c) => CampaignSchema.safeParse(c))
      .filter((r) => r.success)
      .map((r) => (r as { data: Campaign }).data);
  } catch {
    return [];
  }
}

function writeRaw(campaigns: Campaign[]) {
  if (!canPersist()) return;
  window.localStorage.setItem(KEY, JSON.stringify(campaigns));
}

/** Build (and cache) the deterministic demo campaign. */
async function buildDemoCampaign(): Promise<Campaign> {
  const provider = getCampaignProvider();
  return provider.buildCampaign({
    candidate: demoCandidate,
    job: demoJob,
    createdAt: SEED_STAMP,
  });
}

/**
 * Ensures the seed campaign exists, then returns all campaigns.
 * Idempotent, safe to call on every page mount.
 */
export async function ensureSeededCampaigns(): Promise<Campaign[]> {
  let campaigns = readRaw();
  const hasDemo = campaigns.some((c) => c.isDemo);
  if (!hasDemo) {
    const demo = await buildDemoCampaign();
    campaigns = [demo, ...campaigns.filter((c) => c.id !== demo.id)];
    writeRaw(campaigns);
  }
  return campaigns;
}

export async function getCampaigns(): Promise<Campaign[]> {
  return ensureSeededCampaigns();
}

export async function getCampaign(id: string): Promise<Campaign | undefined> {
  const all = await ensureSeededCampaigns();
  return all.find((c) => c.id === id);
}

/** Create a campaign from a job (uses the provider) and persist it. */
export async function createCampaignFromJob(
  job: Job,
  /**
   * Optional application requirements parsed from the posting (P1 job-link
   * intake). Additive: every existing call site passes only `job` and behaves
   * exactly as before. When present it is stored on the campaign so P2 can
   * build the application package from what the posting actually asks for.
   */
  form?: ApplicationForm,
): Promise<Campaign> {
  const provider = getCampaignProvider();
  const campaign = await provider.buildCampaign({
    /**
     * The USER's profile, not the demo candidate.
     *
     * Everything the campaign asserts, fit dimensions, gaps, tasks,
     * readiness, is computed from this. Passing `demoCandidate` here meant a
     * real user's campaign analysed someone else's evidence and presented the
     * result as being about them, which is the product's central promise
     * inverted rather than a cosmetic mix-up.
     *
     * `getProfile()` falls back to `demoCandidate` when nothing has been
     * imported, so demo mode is unchanged. Do not reintroduce a second copy of
     * that fallback decision here, the store owns it.
     */
    candidate: getProfile(),
    job,
    createdAt: SEED_STAMP,
  });
  const withForm: Campaign = form ? { ...campaign, applicationForm: form } : campaign;
  const all = readRaw();
  const deduped = all.filter((c) => c.id !== withForm.id);
  writeRaw([withForm, ...deduped]);
  return withForm;
}

export function saveCampaign(campaign: Campaign) {
  const all = readRaw();
  const next = all.some((c) => c.id === campaign.id)
    ? all.map((c) => (c.id === campaign.id ? campaign : c))
    : [campaign, ...all];
  writeRaw(next);
}

/** Toggle a task's completion (persists). Returns the updated campaign. */
export async function setTaskStatus(
  campaignId: string,
  taskId: string,
  status: CampaignTask["status"],
): Promise<Campaign | undefined> {
  const all = await ensureSeededCampaigns();
  const campaign = all.find((c) => c.id === campaignId);
  if (!campaign) return undefined;
  const updated: Campaign = {
    ...campaign,
    tasks: campaign.tasks.map((t) =>
      t.id === taskId ? { ...t, status } : t,
    ),
  };
  saveCampaign(updated);
  return updated;
}

/**
 * Record the user's accept/reject decision on one resume rewrite (persists).
 * Returns the updated campaign.
 *
 * "You approve or deny each one" is only true if the answer survives a reload,
 * so the decision lives on the campaign rather than in component state. The
 * recommendation itself is not stored, it is recomputed from the candidate's
 * evidence, and only the decision is the user's.
 *
 * Setting a recommendation back to "pending" REMOVES it from the map: pending
 * is the absence of a decision, not a decision to do nothing.
 */
export async function setResumeRecommendationStatus(
  campaignId: string,
  recommendationId: string,
  status: ResumeRecommendation["status"],
): Promise<Campaign | undefined> {
  const all = await ensureSeededCampaigns();
  const campaign = all.find((c) => c.id === campaignId);
  if (!campaign) return undefined;

  const decisions: NonNullable<Campaign["resumeDecisions"]> = {
    ...(campaign.resumeDecisions ?? {}),
  };
  if (status === "pending") delete decisions[recommendationId];
  else decisions[recommendationId] = status;

  const updated: Campaign = { ...campaign, resumeDecisions: decisions };
  saveCampaign(updated);
  return updated;
}

/** Parse a pasted job description into a minimal structured Job (demo heuristic). */
export function jobFromPastedText(title: string, company: string, text: string): Job {
  const id = slugId("job", `${company}:${title}`);
  // Pasted job text is UNTRUSTED (§15). Sanitize it and treat the result purely
  // as DATA, never as instructions. Flags are advisory (surfaced to console).
  const { clean, flags } = sanitizeUntrusted(text);
  if (flags.length > 0 && typeof console !== "undefined") {
    console.warn("[CareerOS] Untrusted job text flagged:", flags);
  }
  return {
    id,
    source: "pasted",
    title: title || "Imported role",
    normalizedTitle: title || "Imported role",
    company: company || "Unknown company",
    location: "Unknown",
    remote: "unknown",
    employmentType: /intern/i.test(clean) ? "internship" : "full-time",
    seniority: "Unknown",
    description: clean.slice(0, 4000),
    sponsorship: "unclear",
    requirements: [],
  };
}

/** Wipe user data and re-seed the demo (for the reset control / §20 demo toggle). */
export async function resetToDemo(): Promise<Campaign[]> {
  if (canPersist()) window.localStorage.removeItem(KEY);
  resetOutreachStates();
  return ensureSeededCampaigns();
}

export const DEMO_CANDIDATE = demoCandidate;
export const DEMO_JOB = demoJob;
/** Every cached sample role. */
export const DEMO_JOBS = demoJobs;
