import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Job as JobSchema } from "@/lib/types";
import greenhouse from "@/lib/intake/__fixtures__/greenhouse.json";
import greenhouseBroken from "@/lib/intake/__fixtures__/greenhouse-broken.json";

/**
 * End-to-end orchestration, with DNS and fetch both stubbed.
 *
 * This covers the glue `adapters.test.ts` cannot reach: HTTP status mapping,
 * the content-type check that keeps a plain-text 404 from crashing a JSON
 * parse, and the promise that `intakeFromUrl` NEVER throws upward.
 *
 * DNS is mocked so the suite runs with no network at all — otherwise every
 * hostname lookup would be a live call and the tests would fail offline.
 */

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
  },
}));

const GH_URL = "https://boards.greenhouse.io/robinhood/jobs/8198153";
const AS_URL = "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245";

/** Stub every outbound fetch with one canned response. */
function stubFetch(body: string, init: ResponseInit = { status: 200 }) {
  const spy = vi.fn(async () => new Response(body, init));
  vi.stubGlobal("fetch", spy);
  return spy;
}

const json = (value: unknown, status = 200) =>
  stubFetch(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("intakeFromUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads a real posting end to end and reports which adapter did it", async () => {
    json(greenhouse);
    const { intakeFromUrl } = await import("@/lib/intake/intake");

    const result = await intakeFromUrl(GH_URL, () => "2026-09-19T12:00:00.000Z");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.adapter).toBe("greenhouse");
    expect(result.adapterLabel).toBe("Greenhouse");
    expect(result.fetchedAt).toBe("2026-09-19T12:00:00.000Z");
    expect(JobSchema.safeParse(result.job).success).toBe(true);
    expect(result.job.company).toBe("Robinhood");
    // The uncapped description is carried separately for the analyzer.
    expect(result.descriptionFull.length).toBeGreaterThanOrEqual(
      result.job.description.length,
    );
  });

  it("maps each HTTP status onto an honest reason and offers paste", async () => {
    const { intakeFromUrl } = await import("@/lib/intake/intake");
    const cases: [number, string][] = [
      [404, "not-found"],
      [403, "blocked"],
      [401, "blocked"],
      [429, "rate-limited"],
      [500, "upstream"],
    ];

    for (const [status, reason] of cases) {
      json(greenhouseBroken, status);
      const result = await intakeFromUrl(GH_URL);
      expect(result.ok, `${status} must not produce a Job`).toBe(false);
      if (result.ok) continue;
      expect(result.reason, `status ${status}`).toBe(reason);
      expect(result.fallback).toBe("paste-job");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("treats a 200 with an unparseable body as unreadable, not a Job", async () => {
    // A board that answers 200 with its own error envelope must not become a
    // half-invented posting.
    json(greenhouseBroken, 200);
    const { intakeFromUrl } = await import("@/lib/intake/intake");

    const result = await intakeFromUrl(GH_URL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unreadable");
    expect(result.message).toMatch(/paste the details instead/i);
  });

  it("survives a plain-text body where JSON was expected", async () => {
    // Ashby answers a bad slug with the plain text "Not Found" at 200-ish
    // content types. An unconditional res.json() would throw here.
    const text = readFileSync(
      path.join(process.cwd(), "src", "lib", "intake", "__fixtures__", "ashby-broken.txt"),
      "utf8",
    );
    stubFetch(text, { status: 200, headers: { "content-type": "text/plain" } });
    const { intakeFromUrl } = await import("@/lib/intake/intake");

    const result = await intakeFromUrl(AS_URL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unreadable");
  });

  it("reports an empty body honestly rather than as a successful read", async () => {
    stubFetch("", { status: 200, headers: { "content-type": "application/json" } });
    const { intakeFromUrl } = await import("@/lib/intake/intake");

    const result = await intakeFromUrl(GH_URL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unreadable");
  });

  it("refuses a board listing URL instead of guessing a posting id", async () => {
    const spy = json(greenhouse);
    const { intakeFromUrl } = await import("@/lib/intake/intake");

    // A Lever company board carries no posting id.
    const result = await intakeFromUrl("https://jobs.lever.co/leverdemo");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // It falls to the generic adapter, which finds no JSON-LD in the JSON body.
    expect(["unsupported-source", "unreadable"]).toContain(result.reason);
    expect(result.fallback).toBe("paste-job");
    expect(spy).toHaveBeenCalled();
  });

  it("never throws upward, even when the network itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const { intakeFromUrl } = await import("@/lib/intake/intake");

    const result = await intakeFromUrl(GH_URL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream");
    // The user always gets something actionable.
    expect(result.fallback).toBe("paste-job");
  });

  it("rejects an unsafe URL before any fetch is attempted", async () => {
    const spy = json(greenhouse);
    const { intakeFromUrl } = await import("@/lib/intake/intake");

    const result = await intakeFromUrl("http://boards.greenhouse.io/x/jobs/1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unsafe-url");
    expect(spy).not.toHaveBeenCalled();
  });
});
