import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * REGRESSION GUARD for jobs/live/page.tsx <-> POST /api/campaign, written
 * while watching this exact contract drift twice in one afternoon during the
 * Nemotron swap (tester-nemotron, P2.5):
 *
 *  1. First, `/api/campaign` switched from `resumePdfBase64` (raw PDF) to
 *     page images: nemotron-parse rejects PDFs outright (MEASURED,
 *     careeros/contract/p2.5-nemotron-provider, 400 on PDF base64), so
 *     pages are now rasterised client-side (src/lib/resume/rasterize.ts)
 *     and never leave the user's machine as a document.
 *  2. Mid-swap, the two sides briefly disagreed on the SHAPE of that change:
 *     page.tsx posted `{ jobText, resume: { pages, totalPages, truncated,
 *     truncatedReason } }` while route.ts still read a flat
 *     `body.resumePages` array, every submission 400'd with "Please
 *     upload your résumé as a PDF" even with a valid key, because the route
 *     never saw a page. That was observed directly (not inferred) and has
 *     since been fixed: route.ts now Zod-validates
 *     `resume.pages: { pageNumber, dataUrl, width, height }[]` matching
 *     `ResumePageImage` from rasterize.ts exactly.
 *
 * The first test below calls the route handler directly with the shape
 * page.tsx currently sends, using a real 1x1 PNG so it clears the PNG-magic-
 * byte check too, and asserts the request gets PAST body validation, i.e.
 * proves the wire shapes agree, behaviorally, rather than trusting a string
 * match on field names that already drifted once. `fetch` is stubbed to
 * reject so this can never make a live call.
 */

const PAGE_SOURCE = readFileSync(
  path.join(process.cwd(), "src", "app", "jobs", "live", "page.tsx"),
  "utf8",
);

// A real, minimal 1x1 PNG, required so the route's PNG-magic-byte check
// (hasPngSignature) passes, not just its regex shape check.
const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const KEY_ENV = "NVIDIA_API_KEY_SUPER";
let originalKey: string | undefined;

beforeEach(() => {
  vi.resetModules();
  originalKey = process.env[KEY_ENV];
  process.env[KEY_ENV] = "test-key-value";
  // Defensive: this test must never make a real network call. Once the
  // request clears body validation it reaches buildLiveCampaign, which would
  // otherwise hit the live NVIDIA endpoint.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("network calls are not allowed in tests")),
  );
});

afterEach(() => {
  if (originalKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = originalKey;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/campaign accepts the exact body jobs/live/page.tsx sends", () => {
  it("clears request validation (reaches buildLiveCampaign, not a 400) for the page's real payload shape", async () => {
    const { POST } = await import("@/app/api/campaign/route");
    // Mirrors page.tsx's `run()` body: { jobText, resume: { pages, totalPages,
    // truncated, truncatedReason } }, with pages shaped like
    // ResumePageImage (rasterize.ts): { pageNumber, dataUrl, width, height }.
    const req = new Request("http://localhost/api/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobText: "A".repeat(50),
        resume: {
          pages: [{ pageNumber: 1, dataUrl: PNG_1PX, width: 1, height: 1 }],
          totalPages: 1,
          truncated: false,
          truncatedReason: null,
        },
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    // It must NOT be rejected at the body-validation gate (400), that would
    // mean the route can't see the pages the page actually sends. Given the
    // network stub, it's expected to fail LATER inside buildLiveCampaign
    // (502, "could not read that résumé", the model call itself failed,
    // which is a legitimate message here, not a validation rejection).
    expect(res.status).not.toBe(400);
    expect(res.status).toBe(502);
  });
});

describe("jobs/live page, stale-copy regressions that are already fixed (guard against reintroduction)", () => {
  it("does not tell the user to set ANTHROPIC_API_KEY", () => {
    expect(PAGE_SOURCE).not.toMatch(/ANTHROPIC_API_KEY/);
    expect(PAGE_SOURCE).not.toMatch(/Anthropic/i);
  });

  it("rasterises the PDF client-side rather than sending raw PDF bytes", () => {
    expect(PAGE_SOURCE).not.toMatch(/resumePdfBase64/);
    expect(PAGE_SOURCE).toMatch(/rasterizeResumePdf|resume\/rasterize/);
  });
});
