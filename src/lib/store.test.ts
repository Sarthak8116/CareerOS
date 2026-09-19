import { beforeEach, describe, expect, it } from "vitest";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJobsPool } from "@/lib/demo/jobsPool";
import { resetProfile, saveProfile } from "@/lib/profileStore";
import {
  createCampaignFromJob,
  ensureSeededCampaigns,
  getCampaign,
  setResumeRecommendationStatus,
} from "@/lib/store";

/**
 * THE CAMPAIGN MUST BE GROUNDED IN THE USER'S OWN PROFILE.
 *
 * `createCampaignFromJob` used to build every fit dimension, gap, task, and
 * readiness level from `demoCandidate`. For a real user that meant their
 * campaign — the surface that exists to say "here's how YOUR evidence stacks
 * up against this job" — was actually analysing someone else's evidence and
 * presenting the result as theirs. Same failure class as the application
 * page's regression (src/app/campaigns/[id]/application/page.test.tsx),
 * one layer up: the page consumes the campaign this module builds, so a
 * silent revert here would resurface there even with the page's own guard
 * intact.
 *
 * The regression is silent by construction — nothing errors, the campaign
 * renders fine, it's just about the wrong person — so the guard has to name
 * a stored profile and confirm the campaign is actually built from it.
 */

function distinctiveProfile() {
  return {
    ...demoCandidate,
    id: "cand_stored_test",
    name: "Rosalind Ashgrove",
  };
}

beforeEach(() => {
  resetProfile();
  window.localStorage.removeItem("careeros:campaigns:v1");
});

describe("createCampaignFromJob — whose evidence is this?", () => {
  it("builds the campaign from the STORED profile, not the demo candidate", async () => {
    const stored = distinctiveProfile();
    saveProfile(stored);

    const campaign = await createCampaignFromJob(demoJobsPool[1]);

    expect(campaign.candidateId).toBe(stored.id);
    expect(campaign.candidateId).not.toBe(demoCandidate.id);
  });

  it("falls back to the demo candidate only when nothing has been imported", async () => {
    // getProfile() owns the fallback in one place — this module must not
    // carry a second copy of that decision.
    const campaign = await createCampaignFromJob(demoJobsPool[1]);
    expect(campaign.candidateId).toBe(demoCandidate.id);
  });

  it("two different stored profiles produce campaigns grounded in each, independently", async () => {
    saveProfile(distinctiveProfile());
    const first = await createCampaignFromJob(demoJobsPool[1]);
    expect(first.candidateId).toBe("cand_stored_test");

    saveProfile({ ...demoCandidate, id: "cand_second_test", name: "Kai Nakamura" });
    const second = await createCampaignFromJob(demoJobsPool[2]);
    expect(second.candidateId).toBe("cand_second_test");
  });
});

describe("ensureSeededCampaigns — the fixed demo seed stays the demo candidate, on purpose", () => {
  it("the seeded demo campaign is grounded in demoCandidate regardless of what's stored in the profile", async () => {
    // The seed is a deterministic showcase, not a real user's campaign — it
    // must NOT start reflecting whatever profile happens to be stored, which
    // would be the same bug in the opposite direction.
    saveProfile(distinctiveProfile());
    const campaigns = await ensureSeededCampaigns();
    const demo = campaigns.find((c) => c.isDemo);
    expect(demo).toBeDefined();
    expect(demo!.candidateId).toBe(demoCandidate.id);
  });
});

/**
 * ACCEPT/REJECT MUST SURVIVE A RELOAD.
 *
 * ResumeStudio used to hold the decision in component state, so "you approve
 * or deny each one" lasted exactly as long as the render. The decision is the
 * user's contribution to the document — losing it silently is the same class
 * of failure as showing them someone else's recommendations.
 */
describe("setResumeRecommendationStatus — the decision persists", () => {
  it("stores accept and reject on the campaign, and reads back after a fresh load", async () => {
    const campaigns = await ensureSeededCampaigns();
    const id = campaigns[0].id;

    await setResumeRecommendationStatus(id, "rec_req_debug", "accepted");
    await setResumeRecommendationStatus(id, "rec_req_c", "rejected");

    const reloaded = await getCampaign(id);
    expect(reloaded?.resumeDecisions).toEqual({
      rec_req_debug: "accepted",
      rec_req_c: "rejected",
    });
  });

  it("removes the entry when a decision is taken back, because pending is not a decision", async () => {
    const campaigns = await ensureSeededCampaigns();
    const id = campaigns[0].id;

    await setResumeRecommendationStatus(id, "rec_req_debug", "accepted");
    await setResumeRecommendationStatus(id, "rec_req_debug", "pending");

    const reloaded = await getCampaign(id);
    expect(reloaded?.resumeDecisions).toEqual({});
  });

  it("returns undefined for a campaign that does not exist", async () => {
    expect(
      await setResumeRecommendationStatus("camp_nope", "rec_req_debug", "accepted"),
    ).toBeUndefined();
  });
});
