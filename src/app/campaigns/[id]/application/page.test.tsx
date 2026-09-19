import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJobsPool } from "@/lib/demo/jobsPool";
import { createCampaignFromJob, ensureSeededCampaigns } from "@/lib/store";
import { resetProfile, saveProfile } from "@/lib/profileStore";
import type { ApplicationForm } from "@/lib/types";
import type { CoverLetterDraft } from "@/lib/package/coverLetter";
import ApplicationStudioPage from "./page";

/**
 * THE PACKAGE MUST BE GROUNDED IN THE USER'S OWN PROFILE.
 *
 * This page used to build everything — the cover letter sent for grounding,
 * the resume recommendations, and the claim verification pass — from
 * `demoCandidate`. For a real user that meant the surface whose entire job is
 * "we never assert anything about you we cannot evidence" was asserting things
 * about SOMEONE ELSE and presenting it as their check.
 *
 * The regression is silent by nature: everything renders, nothing errors, and
 * the letter reads fine — it is just about the wrong person. So the guard has
 * to be a test that names a stored profile and looks for it in the output.
 * Without it this comes back the next time a candidate-consuming call is added.
 */

const hoisted = vi.hoisted(() => ({ campaignId: "" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: hoisted.campaignId }),
  /* Shell renders the nav, which reads the current path. */
  usePathname: () => `/campaigns/${hoisted.campaignId}/application`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const STORED_NAME = "Rosalind Ashgrove";

let seededCampaignId = "";

beforeAll(async () => {
  const campaigns = await ensureSeededCampaigns();
  seededCampaignId = campaigns[0].id;
  hoisted.campaignId = seededCampaignId;
});

beforeEach(() => {
  resetProfile();
  /* No key in the test environment, and no network from a test either: the
     503/failure path is the SUPPORTED one and yields the deterministic
     evidence-assembled letter. */
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 503 })),
  );
});

afterEach(() => {
  // A few tests point the page at a DIFFERENT campaign id; restore the
  // shared seeded one so later tests aren't reading another test's state.
  hoisted.campaignId = seededCampaignId;
});

async function buildPackage() {
  render(<ApplicationStudioPage />);
  const button = await screen.findByRole("button", {
    name: /build the application package/i,
  });
  fireEvent.click(button);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /download \.zip/i })).toBeTruthy(),
  );
}

/**
 * The seeded demo candidate/job pair genuinely produces at least one
 * unsupported claim (real behaviour, not a test artifact — confirmed by
 * checking the rendered button's `disabled` state directly), which leaves
 * the download button disabled until the user resolves it. Tests about the
 * DOWNLOAD path itself aren't about that gate, so this clears it by owning
 * every unsupported claim, the same action a user takes.
 */
function resolveAllUnsupportedClaims() {
  // Bounded rather than a bare while(true): if attestation itself were
  // broken this fails loudly with a clear cause instead of hanging the run.
  for (let guard = 0; guard < 50; guard += 1) {
    const ownButtons = screen.queryAllByRole("button", { name: /this is true.*it's mine/i });
    if (ownButtons.length === 0) return;
    fireEvent.click(ownButtons[0]);
  }
  throw new Error("unsupported claims never cleared — is attestation broken?");
}

describe("Application studio page — whose evidence is this?", () => {
  it("builds the package from the STORED profile, not the demo candidate", async () => {
    saveProfile({ ...demoCandidate, id: "cand_stored", name: STORED_NAME });

    await buildPackage();

    expect(document.body.textContent).toContain(STORED_NAME);
    expect(document.body.textContent).not.toContain(demoCandidate.name);
  });

  it("falls back to the demo candidate only when nothing has been imported", async () => {
    /* getProfile() owns that fallback, in one place. The page must not carry
       a second copy of the decision. */
    await buildPackage();

    expect(document.body.textContent).toContain(demoCandidate.name);
  });
});

/* ------------------------------------------------------------------ */
/* coverLetterOrigin disclosure                                        */
/* ------------------------------------------------------------------ */

const MODEL_SENTENCE = /drafted by the model, then every sentence was graded/i;
const DETERMINISTIC_SENTENCE = /assembled from your evidence rather than written by a model/i;

const VALID_MODEL_DRAFT: CoverLetterDraft = {
  greeting: "Dear Hiring Team,",
  paragraphs: [
    { sentences: [{ text: "I am excited to apply for this role.", role: "intent" }] },
  ],
  closing: "Sincerely,\nCandidate",
};

describe("Application studio page — coverLetterOrigin disclosure", () => {
  it("says the model drafted it when the live call succeeds with a valid draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ draft: VALID_MODEL_DRAFT }), { status: 200 })),
    );
    await buildPackage();
    expect(screen.getByText(MODEL_SENTENCE)).toBeTruthy();
    expect(screen.queryByText(DETERMINISTIC_SENTENCE)).toBeNull();
  });

  it("says it was assembled from evidence on the supported no-key path (503)", async () => {
    // beforeEach's default stub already returns 503 — exercised explicitly
    // here so this test states its own precondition rather than borrowing it.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    await buildPackage();
    expect(screen.getByText(DETERMINISTIC_SENTENCE)).toBeTruthy();
    expect(screen.queryByText(MODEL_SENTENCE)).toBeNull();
  });

  it("falls back to the deterministic letter when the response is 200 but the draft fails schema validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ draft: { not: "a draft" } }), { status: 200 })),
    );
    await buildPackage();
    expect(screen.getByText(DETERMINISTIC_SENTENCE)).toBeTruthy();
  });

  it("falls back to the deterministic letter on a 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 502 })));
    await buildPackage();
    expect(screen.getByText(DETERMINISTIC_SENTENCE)).toBeTruthy();
  });

  it("falls back to the deterministic letter when fetch itself throws (offline / route unreachable)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await buildPackage();
    expect(screen.getByText(DETERMINISTIC_SENTENCE)).toBeTruthy();
  });

  it("says NOTHING about how the letter was written when the posting doesn't ask for one (origin: none)", async () => {
    // A job DIFFERENT from the seeded demo one, so this doesn't overwrite the
    // shared demo campaign other tests in this file depend on.
    const job = demoJobsPool[1];
    const form: ApplicationForm = {
      jobId: job.id,
      source: "fetched",
      adapter: "greenhouse",
      fetchedAt: "2026-09-19T12:00:00.000Z",
      completeness: "complete",
      resume: "not-requested",
      coverLetter: "not-requested",
      portfolio: "not-requested",
      questions: [],
      excludedSections: [],
      unknowns: [],
      warnings: [],
      trust: "source-backed",
    };
    const campaign = await createCampaignFromJob(job, form);
    hoisted.campaignId = campaign.id;

    await buildPackage();
    // "Describing how a non-existent document was written is a claim about
    // nothing" — neither sentence, and no mention of a cover letter at all.
    expect(screen.queryByText(MODEL_SENTENCE)).toBeNull();
    expect(screen.queryByText(DETERMINISTIC_SENTENCE)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Campaign lookup failure                                             */
/* ------------------------------------------------------------------ */

describe("Application studio page — campaign not found", () => {
  it("shows an honest not-found state rather than a blank or crashed page", async () => {
    hoisted.campaignId = "camp_does_not_exist";
    render(<ApplicationStudioPage />);
    expect(await screen.findByText(/campaign not found/i)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* Download / export                                                   */
/* ------------------------------------------------------------------ */

describe("Application studio page — download", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("creates and revokes exactly one object URL, and clicks a real download link, on a successful export", async () => {
    const createSpy = vi.fn(() => "blob:mock-package-url");
    const revokeSpy = vi.fn();
    URL.createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await buildPackage();
    resolveAllUnsupportedClaims();
    const downloadButton = screen.getByRole("button", { name: /download \.zip/i });
    expect((downloadButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(downloadButton);

    // Real zip assembly (jszip is dynamically imported inside buildPackageZip)
    // is slower than the default 1s waitFor window under test-environment
    // overhead — generous but bounded timeouts rather than a flaky default.
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1), { timeout: 8000 });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(revokeSpy).toHaveBeenCalledWith("blob:mock-package-url"), {
      timeout: 8000,
    });

    clickSpy.mockRestore();
  }, 15000);

  it("shows an honest error and downloads nothing when the archive cannot be built", async () => {
    // buildPackageZip throws when JSZip itself fails; simulate that at the
    // boundary this page actually calls through — a poisoned createObjectURL
    // that throws stands in for any failure inside the export path, since the
    // page's try/catch around exportZip doesn't distinguish the source.
    URL.createObjectURL = vi.fn(() => {
      throw new Error("zip failed");
    }) as unknown as typeof URL.createObjectURL;

    await buildPackage();
    resolveAllUnsupportedClaims();
    const downloadButton = screen.getByRole("button", { name: /download \.zip/i });
    expect((downloadButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(downloadButton);

    expect(
      await screen.findByText(/archive could not be created\. nothing was downloaded/i, {}, { timeout: 8000 }),
    ).toBeTruthy();
  }, 15000);
});
