import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Feature-flag, guard, and error-mapping tests.
 *
 * No live Apify calls: `runActor` is only ever reached with the flag OFF, and
 * the client-bundle guard is asserted statically against the module source.
 */

// Resolved from the project root: under jsdom, `import.meta.url` is not a file URL.
const HARVEST_DIR = path.join(process.cwd(), "src", "lib", "harvest");
const read = (file: string) => readFileSync(path.join(HARVEST_DIR, file), "utf8");

describe("server-only guard", () => {
  it("every module that can touch the token imports 'server-only' first", () => {
    for (const file of ["client.ts", "network.ts", "cache.ts"]) {
      const firstLine = read(file).split("\n")[0].trim();
      expect(firstLine, `${file} must open with the server-only guard`).toBe(
        'import "server-only";',
      );
    }
  });

  it("never logs the token or embeds it in a client-visible string", () => {
    const source = read("client.ts");
    expect(source).not.toMatch(/console\.(log|warn|error|info)/);
    // The token is read from the environment only, never inlined.
    expect(source).not.toMatch(/apify_api_[A-Za-z0-9]/);
  });

  it("keeps the pure mapper free of server-only imports so it stays testable", () => {
    expect(read("map.ts")).not.toContain('import "server-only"');
  });
});

describe("feature flag", () => {
  const originalEnabled = process.env.HARVEST_ENABLED;
  const originalToken = process.env.APIFY_TOKEN;

  beforeEach(() => {
    delete process.env.HARVEST_ENABLED;
    delete process.env.APIFY_TOKEN;
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.HARVEST_ENABLED;
    else process.env.HARVEST_ENABLED = originalEnabled;
    if (originalToken === undefined) delete process.env.APIFY_TOKEN;
    else process.env.APIFY_TOKEN = originalToken;
  });

  it("is off with no env vars, demo mode never reaches the network", async () => {
    const { harvestEnabled } = await import("@/lib/harvest/client");
    expect(harvestEnabled()).toBe(false);
  });

  it("stays off when only one of the two vars is set", async () => {
    const { harvestEnabled } = await import("@/lib/harvest/client");

    process.env.HARVEST_ENABLED = "true";
    expect(harvestEnabled()).toBe(false);

    delete process.env.HARVEST_ENABLED;
    process.env.APIFY_TOKEN = "token-value";
    expect(harvestEnabled()).toBe(false);
  });

  it("turns on only when both are set", async () => {
    const { harvestEnabled } = await import("@/lib/harvest/client");
    process.env.HARVEST_ENABLED = "true";
    process.env.APIFY_TOKEN = "token-value";
    expect(harvestEnabled()).toBe(true);
  });

  it("refuses to run an actor while disabled, instead of calling out", async () => {
    const { runActor, HarvestError } = await import("@/lib/harvest/client");
    await expect(runActor("linkedin-company", {})).rejects.toBeInstanceOf(
      HarvestError,
    );
  });

  it("every network helper returns an empty fallback when disabled", async () => {
    const network = await import("@/lib/harvest/network");
    const { demoCandidate } = await import("@/lib/demo/candidate");
    const { demoJob } = await import("@/lib/demo/job");

    await expect(
      network.fetchCompanyFacts({ companyName: "NVIDIA" }),
    ).resolves.toBeUndefined();
    await expect(network.fetchCompanyPosts("x")).resolves.toEqual([]);
    await expect(
      network.fetchTeamContacts({
        candidate: demoCandidate,
        job: demoJob,
        companyLinkedinUrl: "https://www.linkedin.com/company/nvidia",
      }),
    ).resolves.toEqual([]);
    await expect(network.fetchOwnProfile("x")).resolves.toBeUndefined();
    await expect(network.fetchContactPosts("x")).resolves.toEqual([]);
    await expect(network.findContactEmail("x")).resolves.toBeUndefined();
  });
});

describe("harvestSafeMessage", () => {
  it("maps failures to safe text and never leaks the token", async () => {
    const { harvestSafeMessage, HarvestError } = await import(
      "@/lib/harvest/client"
    );
    process.env.APIFY_TOKEN = "super-secret-token";

    expect(harvestSafeMessage(new HarvestError("auth", "x"))).toMatch(
      /APIFY_TOKEN/,
    );
    expect(harvestSafeMessage(new HarvestError("rate-limited", "x"))).toMatch(
      /rate limited/i,
    );

    const leaky = new Error("request failed for token super-secret-token");
    expect(harvestSafeMessage(leaky)).not.toContain("super-secret-token");

    delete process.env.APIFY_TOKEN;
  });
});
