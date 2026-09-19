import { describe, it, expect } from "vitest";
import type { z } from "zod";
import {
  Job,
  Campaign,
  ApplicationPackage,
  PackageDocument,
  PackageClaim,
} from "@/lib/types";
import { demoJob } from "@/lib/demo/job";
import { demoJobsPool } from "@/lib/demo/jobsPool";
import { demoCandidate } from "@/lib/demo/candidate";
import { getCampaignProvider } from "@/lib/providers/ai";

/**
 * SCHEMA-ADDITIVITY REGRESSION (P1 job-link intake).
 *
 * `src/lib/types.ts` is the cross-agent contract every engine, store, and UI
 * component relies on (see its own file header). P1 adds `ApplicationForm`
 * and likely touches `Job` / `Campaign` to attach it. This file freezes
 * TODAY's shape of `Job` and `Campaign` as a baseline so that change is
 * provably additive, not just "still compiles":
 *
 *  - every field that exists today still exists, with the same
 *    required/optional-ness and the same underlying zod type
 *  - every enum keeps exactly its current set of values (no silent rename,
 *    removal, or narrowing)
 *  - any BRAND NEW top-level field must be optional — a new required field
 *    would break every caller that doesn't know about it yet (the store's
 *    localStorage-persisted campaigns, the demo fixtures, etc.)
 *  - every already-committed fixture (the demo jobs, the seeded NVIDIA demo
 *    campaign) still parses to an object identical to its input — nothing is
 *    silently dropped, coerced, or defaulted differently
 *
 * If this file fails after an intake change, the failure IS the finding —
 * report it back to coder-intake rather than editing the baseline to match.
 * The one exception is a deliberate, reviewed contract change to Job/Campaign
 * themselves, in which case the baseline below should be updated in the same
 * change as the schema edit (not silently, and not by the person who broke
 * it grading their own homework).
 */

type FieldShape = {
  optional: boolean;
  typeName: string;
  enumValues?: string[];
};

/** Unwrap Optional/Default/Nullable wrappers to find the innermost real type. */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  const def = (schema as unknown as { _def: { typeName: string; innerType?: z.ZodTypeAny } })._def;
  if (
    (def.typeName === "ZodOptional" || def.typeName === "ZodDefault" || def.typeName === "ZodNullable") &&
    def.innerType
  ) {
    return unwrap(def.innerType);
  }
  return schema;
}

function describeShape(shape: z.ZodRawShape): Record<string, FieldShape> {
  const out: Record<string, FieldShape> = {};
  for (const [key, field] of Object.entries(shape)) {
    const typed = field as z.ZodTypeAny;
    const inner = unwrap(typed);
    const innerDef = (inner as unknown as { _def: { typeName: string; values?: string[] } })._def;
    const entry: FieldShape = {
      optional: typed.isOptional(),
      typeName: innerDef.typeName,
    };
    if (innerDef.typeName === "ZodEnum" && innerDef.values) {
      entry.enumValues = [...innerDef.values].sort();
    }
    out[key] = entry;
  }
  return out;
}

/**
 * Assert `current` differs from `baseline` only by ADDITION:
 *  - every baseline field must still be present in current, unchanged
 *  - any field present in current but absent from baseline must be optional
 */
function assertAdditiveOnly(
  baseline: Record<string, FieldShape>,
  current: Record<string, FieldShape>,
) {
  for (const [key, expected] of Object.entries(baseline)) {
    expect(current, `field "${key}" was removed from the schema`).toHaveProperty(key);
    expect(current[key], `field "${key}" changed shape (renamed, retyped, or required-ness flipped)`).toEqual(
      expected,
    );
  }
  for (const [key, actual] of Object.entries(current)) {
    if (!(key in baseline)) {
      expect(
        actual.optional,
        `new field "${key}" must be optional — a required addition breaks every existing caller`,
      ).toBe(true);
    }
  }
}

describe("Job schema — additivity baseline (frozen from today's types.ts)", () => {
  const jobBaseline: Record<string, FieldShape> = {
    id: { optional: false, typeName: "ZodString" },
    source: { optional: false, typeName: "ZodString" },
    url: { optional: true, typeName: "ZodString" },
    title: { optional: false, typeName: "ZodString" },
    normalizedTitle: { optional: false, typeName: "ZodString" },
    company: { optional: false, typeName: "ZodString" },
    team: { optional: true, typeName: "ZodString" },
    location: { optional: false, typeName: "ZodString" },
    remote: {
      optional: false,
      typeName: "ZodEnum",
      enumValues: ["hybrid", "onsite", "remote", "unknown"],
    },
    employmentType: {
      optional: false,
      typeName: "ZodEnum",
      enumValues: ["contract", "full-time", "internship"],
    },
    seniority: { optional: false, typeName: "ZodString" },
    description: { optional: false, typeName: "ZodString" },
    postedAt: { optional: true, typeName: "ZodString" },
    deadline: { optional: true, typeName: "ZodString" },
    sponsorship: {
      optional: false,
      typeName: "ZodEnum",
      enumValues: ["not-offered", "offered", "unclear"],
    },
    requirements: { optional: false, typeName: "ZodArray" },
  };

  it("every existing field is unchanged; any new field is optional", () => {
    assertAdditiveOnly(jobBaseline, describeShape(Job.shape));
  });
});

describe("Campaign schema — additivity baseline (frozen from today's types.ts)", () => {
  const campaignBaseline: Record<string, FieldShape> = {
    id: { optional: false, typeName: "ZodString" },
    candidateId: { optional: false, typeName: "ZodString" },
    job: { optional: false, typeName: "ZodObject" },
    stage: {
      optional: false,
      typeName: "ZodEnum",
      enumValues: ["analyzed", "applied", "closed", "created", "interviewing", "outreach", "researching"],
    },
    readiness: {
      optional: false,
      typeName: "ZodEnum",
      enumValues: ["limited", "moderate", "none", "strong"],
    },
    createdAt: { optional: false, typeName: "ZodString" },
    isDemo: { optional: true, typeName: "ZodBoolean" },
    fit: { optional: false, typeName: "ZodArray" },
    gaps: { optional: false, typeName: "ZodArray" },
    tasks: { optional: false, typeName: "ZodArray" },
    people: { optional: false, typeName: "ZodArray" },
    activity: { optional: false, typeName: "ZodArray" },
    nextAction: { optional: false, typeName: "ZodString" },
    harvest: { optional: true, typeName: "ZodObject" },
  };

  it("every existing field is unchanged; any new field is optional", () => {
    assertAdditiveOnly(campaignBaseline, describeShape(Campaign.shape));
  });
});

/**
 * P2 APPLICATION PACKAGE — additivity baseline, frozen from the shape landed
 * for P2 (see `careeros/contract/p2-application-package`). `ApplicationPackage`,
 * `PackageDocument`, and `PackageClaim` are brand new in this phase, so there
 * is nothing from an EARLIER phase to protect here — this baseline instead
 * protects P3 and onward from silently renaming, retyping, or narrowing what
 * P2 shipped. The same additive-only rule applies: a new top-level field must
 * be optional; nothing already here may be renamed, removed, or retyped.
 */
describe("PackageClaim schema — additivity baseline (frozen from P2)", () => {
  const packageClaimBaseline: Record<string, FieldShape> = {
    text: { optional: false, typeName: "ZodString" },
    support: {
      optional: false,
      typeName: "ZodEnum",
      enumValues: ["evidenced", "unsupported", "user-provided"],
    },
    evidenceId: { optional: true, typeName: "ZodString" },
  };

  it("every existing field is unchanged; any new field is optional", () => {
    assertAdditiveOnly(packageClaimBaseline, describeShape(PackageClaim.shape));
  });
});

describe("PackageDocument schema — additivity baseline (frozen from P2)", () => {
  const packageDocumentBaseline: Record<string, FieldShape> = {
    kind: {
      optional: false,
      typeName: "ZodEnum",
      enumValues: ["cover-letter", "personal-info", "resume", "short-answers"],
    },
    fileName: { optional: false, typeName: "ZodString" },
    status: {
      optional: false,
      typeName: "ZodEnum",
      enumValues: ["drafted", "needs-you", "not-requested", "reused"],
    },
    content: { optional: false, typeName: "ZodString" },
    claims: { optional: false, typeName: "ZodArray" },
  };

  it("every existing field is unchanged; any new field is optional", () => {
    assertAdditiveOnly(packageDocumentBaseline, describeShape(PackageDocument.shape));
  });
});

describe("ApplicationPackage schema — additivity baseline (frozen from P2)", () => {
  const applicationPackageBaseline: Record<string, FieldShape> = {
    campaignId: { optional: false, typeName: "ZodString" },
    jobId: { optional: false, typeName: "ZodString" },
    builtAt: { optional: false, typeName: "ZodString" },
    folderName: { optional: false, typeName: "ZodString" },
    documents: { optional: false, typeName: "ZodArray" },
    completeness: {
      optional: false,
      typeName: "ZodEnum",
      enumValues: ["complete", "partial"],
    },
    missing: { optional: false, typeName: "ZodArray" },
    excludedSections: { optional: false, typeName: "ZodArray" },
  };

  it("every existing field is unchanged; any new field is optional", () => {
    assertAdditiveOnly(applicationPackageBaseline, describeShape(ApplicationPackage.shape));
  });

  it("completeness is restricted to 'complete' | 'partial' — never a broader label", () => {
    // `completeness` is DERIVED (see the P2 contract) and must never widen to
    // include e.g. an asserted "done" state that bypasses derivation. Locking
    // the enum here means a loosened definition fails this file, not silently
    // ships.
    expect(ApplicationPackage.shape.completeness._def.typeName).toBe("ZodEnum");
    expect([...ApplicationPackage.shape.completeness._def.values].sort()).toEqual([
      "complete",
      "partial",
    ]);
  });
});

describe("existing fixtures still parse identically", () => {
  it("every demo job (NVIDIA + comparison pool) round-trips through Job.parse unchanged", () => {
    expect(demoJobsPool.length).toBeGreaterThanOrEqual(4);
    for (const job of demoJobsPool) {
      expect(Job.parse(job)).toEqual(job);
    }
  });

  it("the seeded NVIDIA demo campaign round-trips through Campaign.parse unchanged", async () => {
    const campaign = await getCampaignProvider().buildCampaign({
      candidate: demoCandidate,
      job: demoJob,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    expect(Campaign.parse(campaign)).toEqual(campaign);
  });
});
