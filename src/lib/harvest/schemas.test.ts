import { describe, it, expect } from "vitest";
import {
  HarvestCompany,
  HarvestPost,
  HarvestProfile,
  parseItems,
} from "@/lib/harvest/schemas";
import employees from "@/lib/harvest/__fixtures__/employees.json";
import company from "@/lib/harvest/__fixtures__/company.json";
import companyLive from "@/lib/harvest/__fixtures__/company-live.json";
import posts from "@/lib/harvest/__fixtures__/posts.json";

/**
 * Boundary-validation tests. No live calls, everything runs off recorded
 * fixtures that include deliberately malformed records.
 */

describe("parseItems, boundary validation", () => {
  it("keeps well-formed profiles and drops records with no linkedinUrl", () => {
    const { valid, dropped } = parseItems(HarvestProfile, employees);

    // The fixture has 5 records; exactly one is missing `linkedinUrl`.
    expect(employees).toHaveLength(5);
    expect(valid).toHaveLength(4);
    expect(dropped).toBe(1);
    expect(valid.every((p) => !!p.linkedinUrl)).toBe(true);
    expect(valid.some((p) => p.publicIdentifier === "missing-url-profile")).toBe(
      false,
    );
  });

  it("does not throw on malformed input, invalid records are dropped", () => {
    expect(() =>
      parseItems(HarvestProfile, [null, 42, "nope", {}, { linkedinUrl: "" }]),
    ).not.toThrow();

    const { valid, dropped } = parseItems(HarvestProfile, [
      null,
      42,
      "nope",
      {},
      { linkedinUrl: "" },
    ]);
    expect(valid).toHaveLength(0);
    expect(dropped).toBe(5);
  });

  it("tolerates unknown extra fields so a provider change cannot break parsing", () => {
    const { valid, dropped } = parseItems(HarvestProfile, [
      {
        linkedinUrl: "https://www.linkedin.com/in/someone",
        firstName: "Sam",
        brandNewFieldTheProviderAdded: { nested: true },
      },
    ]);
    expect(dropped).toBe(0);
    expect(valid[0].firstName).toBe("Sam");
  });

  it("parses the company fixture and drops the record with no linkedinUrl", () => {
    const { valid, dropped } = parseItems(HarvestCompany, company);
    expect(valid).toHaveLength(1);
    expect(dropped).toBe(1);
    expect(valid[0].name).toBe("NVIDIA");
    expect(valid[0].employeeCount).toBe(31000);
    // `phone: null` must be tolerated, not rejected.
    expect(valid[0].phone).toBeNull();
  });

  it("drops posts with empty content, nothing to ground on", () => {
    const { valid, dropped } = parseItems(HarvestPost, posts);
    expect(valid).toHaveLength(2);
    expect(dropped).toBe(1);
    expect(valid.every((p) => p.content.length > 0)).toBe(true);
  });
});

/**
 * REGRESSION, captured from a real `linkedin-company` response on 2026-09-19.
 *
 * The published docs are wrong in two ways that silently dropped 100% of
 * records until a live smoke test caught it:
 *   1. empty fields arrive as `null`, not absent
 *   2. `industries` is an array of objects, not strings
 *
 * These assertions run against the real payload, so neither can regress.
 */
describe("real captured company payload", () => {
  it("validates against the schema", () => {
    const { valid, dropped } = parseItems(HarvestCompany, companyLive);
    expect(dropped).toBe(0);
    expect(valid).toHaveLength(1);
    expect(valid[0].name).toBe("NVIDIA");
  });

  it("still validates with nulls in every nullable position", () => {
    const record = { ...(companyLive[0] as Record<string, unknown>) };
    record.tagline = null;
    record.description = null;
    record.website = null;
    record.employeeCount = null;
    record.phone = null;
    record.locations = null;
    record.specialities = null;
    record.industries = null;
    record.foundedOn = null;

    const { valid, dropped } = parseItems(HarvestCompany, [record]);
    expect(dropped, "nulls must be tolerated, not dropped").toBe(0);
    expect(valid[0].name).toBe("NVIDIA");
  });

  it("accepts industries as objects AND as strings", () => {
    const asObjects = parseItems(HarvestCompany, companyLive);
    expect(asObjects.dropped).toBe(0);

    const record = { ...(companyLive[0] as Record<string, unknown>) };
    record.industries = ["Semiconductors"];
    expect(parseItems(HarvestCompany, [record]).dropped).toBe(0);
  });

  it("drops a record only when identity is genuinely missing", () => {
    const record = { ...(companyLive[0] as Record<string, unknown>) };
    delete record.linkedinUrl;
    expect(parseItems(HarvestCompany, [record]).dropped).toBe(1);
  });
});
