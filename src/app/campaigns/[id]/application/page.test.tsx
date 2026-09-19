import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { demoCandidate } from "@/lib/demo/candidate";
import { ensureSeededCampaigns } from "@/lib/store";
import { resetProfile, saveProfile } from "@/lib/profileStore";
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

beforeAll(async () => {
  const campaigns = await ensureSeededCampaigns();
  hoisted.campaignId = campaigns[0].id;
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
