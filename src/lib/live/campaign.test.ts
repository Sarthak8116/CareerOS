import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computeFit, computeReadiness } from "@/lib/engine/fit";
import { computeGaps } from "@/lib/engine/gaps";
import { computeTasks, computeActivity } from "@/lib/engine/plan";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";
import { demoPeople } from "@/lib/demo/people";

/**
 * buildLiveCampaign — the résumé-truncation provenance behaviour
 * (coder-nemotron's suggestion, worth testing): when fewer résumé pages were
 * sent than the PDF actually has, the campaign's `activity` feed must carry
 * an honest, high-confidence "conflict" entry saying so, positioned BEFORE
 * any conclusion the analysis model drew — a campaign that reads as if it
 * saw the whole résumé when it only saw part of one is exactly the silent
 * dishonesty the honesty contract (careeros/contract/cross-cutting-rules,
 * rule 1-2) forbids.
 *
 * The route (src/app/api/campaign/route.ts) DERIVES `truncated` server-side
 * as `pages.length < totalPages` and never trusts the client's own flag —
 * verified by reading the route directly, a one-line computation not worth a
 * duplicate test. What's tested here is that buildLiveCampaign, GIVEN that
 * derived flag, actually surfaces it honestly rather than dropping it.
 *
 * `fetch` is mocked throughout — fixtures for LiveCandidate/LiveJob/
 * LiveAnalysis are built by running the same PURE demo engine the deterministic
 * path uses (computeFit/computeGaps/computeTasks/computeActivity), since
 * LiveCandidate/LiveJob are exactly Candidate/Job minus `id` (and `source` for
 * Job) — the demo fixtures already satisfy those schemas.
 */

const ENV_KEY = "NVIDIA_API_KEY";
let originalKey: string | undefined;

beforeEach(() => {
  vi.resetModules();
  originalKey = process.env[ENV_KEY];
  process.env[ENV_KEY] = "test-key-value";
});

afterEach(() => {
  if (originalKey === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalKey;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function chatContent(content: string) {
  return jsonResponse({ choices: [{ message: { content } }] });
}

/** LiveCandidate = Candidate.omit({id}).extend({evidence}) — demoCandidate already has evidence. */
function liveCandidateFixture() {
  const { id: _id, ...rest } = demoCandidate;
  return rest;
}

/** LiveJob = Job.omit({id, source}).extend({requirements}) — demoJob already has requirements. */
function liveJobFixture() {
  const { id: _id, source: _source, ...rest } = demoJob;
  return rest;
}

/** LiveAnalysis's arrays, built with the same pure engine the demo path uses. */
function liveAnalysisFixture() {
  const fit = computeFit(demoCandidate, demoJob, demoPeople);
  const gaps = computeGaps(demoCandidate, demoJob);
  const tasks = computeTasks(gaps, demoPeople, demoJob);
  const activity = computeActivity(demoCandidate, demoJob, fit, gaps, demoPeople);
  const readiness = computeReadiness(fit);
  return {
    readiness,
    nextAction: "Tailor the resume and submit the application",
    fit,
    gaps,
    tasks,
    people: demoPeople,
    activity,
  };
}

describe("buildLiveCampaign — résumé-truncation provenance", () => {
  it("puts an honest, high-confidence 'Résumé Reader' conflict entry FIRST in activity when the résumé was truncated, and states the limit in the trusted TASK text (not the untrusted fence)", async () => {
    const fetchMock = vi
      .fn()
      // 1) readDocumentPages: one page, read by PARSE successfully.
      .mockResolvedValueOnce(chatContent("Resume page 1 transcript text."))
      // 2) parseStructured candidate (RESUME_SHAPER = "super").
      .mockResolvedValueOnce(chatContent(JSON.stringify(liveCandidateFixture())))
      // 3) parseStructured job (lightning).
      .mockResolvedValueOnce(chatContent(JSON.stringify(liveJobFixture())))
      // 4) parseStructured analysis (super).
      .mockResolvedValueOnce(chatContent(JSON.stringify(liveAnalysisFixture())));
    vi.stubGlobal("fetch", fetchMock);

    const { buildLiveCampaign } = await import("@/lib/live/campaign");
    const campaign = await buildLiveCampaign({
      resume: {
        pages: ["data:image/png;base64," + "A".repeat(40)],
        totalPages: 12,
        truncated: true,
      },
      jobText: "A".repeat(50),
      createdAt: new Date().toISOString(),
    });

    // Provenance entry first, before whatever the analysis model produced.
    expect(campaign.activity[0]).toMatchObject({
      agent: "Résumé Reader",
      kind: "conflict",
      confidence: "high",
    });
    expect(campaign.activity[0].message).toContain(
      "Read 1 of 12 résumé pages",
    );
    // The analysis model's own activity items still follow it, not replaced.
    expect(campaign.activity.length).toBeGreaterThan(1);

    // The limit must reach the TASK string (trusted), for both calls that
    // could otherwise treat an unread page as evidence of absence: the
    // candidate-shaping call (fetch #2) and the analysis call (fetch #4).
    const candidateBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    );
    const analysisBody = JSON.parse(
      (fetchMock.mock.calls[3][1] as RequestInit).body as string,
    );
    const candidateUserMsg = candidateBody.messages.find(
      (m: { role: string }) => m.role === "user",
    ).content as string;
    const analysisUserMsg = analysisBody.messages.find(
      (m: { role: string }) => m.role === "user",
    ).content as string;
    expect(candidateUserMsg).toContain("Read 1 of 12 résumé pages");
    expect(analysisUserMsg).toContain("Read 1 of 12 résumé pages");
    // And it must NOT be inside the <untrusted_data> fence, which for the
    // candidate call wraps the résumé transcript specifically.
    const untrustedBlock =
      candidateUserMsg.match(/<untrusted_data[^]*?<\/untrusted_data>/)?.[0] ??
      "";
    expect(untrustedBlock).not.toContain("Read 1 of 12 résumé pages");
  });

  it("adds NO provenance entry when the résumé was read in full (truncated: false)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatContent("Resume page 1 transcript text."))
      .mockResolvedValueOnce(chatContent(JSON.stringify(liveCandidateFixture())))
      .mockResolvedValueOnce(chatContent(JSON.stringify(liveJobFixture())))
      .mockResolvedValueOnce(chatContent(JSON.stringify(liveAnalysisFixture())));
    vi.stubGlobal("fetch", fetchMock);

    const { buildLiveCampaign } = await import("@/lib/live/campaign");
    const campaign = await buildLiveCampaign({
      resume: {
        pages: ["data:image/png;base64," + "A".repeat(40)],
        totalPages: 1,
        truncated: false,
      },
      jobText: "A".repeat(50),
      createdAt: new Date().toISOString(),
    });

    expect(
      campaign.activity.some((a) => a.agent === "Résumé Reader"),
    ).toBe(false);
  });
});
