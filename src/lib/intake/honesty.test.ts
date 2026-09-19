import { describe, it, expect } from "vitest";
import { Job, Campaign, ApplicationForm, ApplicationQuestionCategory } from "@/lib/types";
import { Campaign as CampaignSchema } from "@/lib/types";
import { buildJob } from "@/lib/intake/map";
import type { FieldOrigins } from "@/lib/intake/types";
import { greenhouseAdapter } from "@/lib/intake/adapters/greenhouse";
import { demoCandidate } from "@/lib/demo/candidate";
import { getCampaignProvider } from "@/lib/providers/ai";
import greenhouseJobDetail from "@/lib/intake/__fixtures__/greenhouse-job-detail.json";

/**
 * The intake honesty contract — the claims this app must never make about a
 * job posting it read for the user. Asserted directly against real adapter
 * output and real captured fixtures, the same way `harvest/honesty.test.ts`
 * and `profileStore.test.ts` assert honesty rules rather than only mechanics.
 */

const FETCHED_AT = "2026-09-19T12:00:00.000Z";

/** Real captured Greenhouse response (see src/lib/intake/__fixtures__). */
const GREENHOUSE_URL = "https://boards.greenhouse.io/robinhood/jobs/8198153";

function parseGreenhouse() {
  return greenhouseAdapter.parse({
    responses: [{ kind: "posting", status: 200, json: greenhouseJobDetail }],
    url: GREENHOUSE_URL,
    fetchedAt: FETCHED_AT,
  });
}

/* ------------------------------------------------------------------ */
/* No PERSISTED Job/Campaign ever carries a fieldOrigins key.          */
/*                                                                      */
/* NOTE ON SCOPE: fieldOrigins legitimately crosses the API boundary — */
/* it rides on IntakeResult in the POST /api/intake response body, for */
/* the pre-build review step, before anything is saved. That transport */
/* is correct and this file does NOT test against it. The invariant    */
/* below is narrower: once a Job/Campaign is BUILT and PERSISTED (the  */
/* campaign-build path, localStorage), fieldOrigins must not survive — */
/* Job.unstated is the persisted representation instead.               */
/* ------------------------------------------------------------------ */

describe("no persisted Job or Campaign ever carries a fieldOrigins key", () => {
  it("is not a field on the Job, Campaign, or ApplicationForm schemas", () => {
    // Schema-level: if a future change widens any of these public schemas to
    // include fieldOrigins, this fails loudly and names which one.
    expect(Object.keys(Job.shape), "Job schema must not declare fieldOrigins").not.toContain(
      "fieldOrigins",
    );
    expect(
      Object.keys(Campaign.shape),
      "Campaign schema must not declare fieldOrigins",
    ).not.toContain("fieldOrigins");
    expect(
      Object.keys(ApplicationForm.shape),
      "ApplicationForm schema must not declare fieldOrigins",
    ).not.toContain("fieldOrigins");
  });

  it("a real adapter keeps fieldOrigins as a sibling of job/form, never merged into them", () => {
    const output = parseGreenhouse();
    expect(output.job).toBeDefined();
    // AdapterOutput.fieldOrigins legitimately exists and is meant to travel
    // (it rides on IntakeResult to the review step)...
    expect(output.fieldOrigins).toBeTruthy();
    expect(Object.keys(output.fieldOrigins).length).toBeGreaterThan(0);
    // ...but it must never be a property ON the job or form it describes —
    // it is a sibling on AdapterOutput/IntakeResult, not a merged-in field.
    expect(Object.keys(output.job!)).not.toContain("fieldOrigins");
    expect(Object.keys(output.form)).not.toContain("fieldOrigins");
    expect(JSON.stringify(output.job)).not.toContain("fieldOrigins");
    expect(JSON.stringify(output.form)).not.toContain("fieldOrigins");
  });

  it("Job.parse of an adapter-produced job carries no fieldOrigins key", () => {
    const output = parseGreenhouse();
    const parsed = Job.parse(output.job);
    expect(parsed).toEqual(output.job);
    expect("fieldOrigins" in parsed).toBe(false);
  });

  it("an intake job round-tripped through the real campaign-build + localStorage-persistence path carries no fieldOrigins", async () => {
    const output = parseGreenhouse();
    const job = output.job!;

    // The same pipeline store.ts uses: build a campaign from the job, then run
    // it through exactly the validation store.ts's readRaw() applies to
    // anything coming back out of localStorage (JSON round-trip + safeParse).
    const campaign = await getCampaignProvider().buildCampaign({
      candidate: demoCandidate,
      job,
      createdAt: FETCHED_AT,
    });
    const roundTripped = JSON.parse(JSON.stringify(campaign));
    const result = CampaignSchema.safeParse(roundTripped);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(JSON.stringify(result.data)).not.toContain("fieldOrigins");
    expect(Object.keys(result.data.job)).not.toContain("fieldOrigins");
  });
});

/* ------------------------------------------------------------------ */
/* fieldOrigins and Job.unstated must never disagree.                  */
/*                                                                      */
/* Two representations of the same fact travel through intake:         */
/*   - fieldOrigins  (transport, to the pre-build review step)         */
/*   - Job.unstated  (persisted, reaches the Campaign and P2)          */
/* If a field is "defaulted" in one but not reflected in the other, a  */
/* consumer of ONE of the two representations sees the wrong answer —  */
/* invisibly, since nothing throws. The invariant: for every field,    */
/* origin === "defaulted"  IFF  that field is in Job.unstated.         */
/* ------------------------------------------------------------------ */

/**
 * Assert the two representations of "we didn't get this from the posting"
 * agree on every field, in both directions.
 */
function assertOriginsAgreeWithUnstated(
  origins: FieldOrigins,
  unstated: string[] | undefined,
) {
  const unstatedSet = new Set(unstated ?? []);

  for (const [field, origin] of Object.entries(origins)) {
    if (origin !== "defaulted") continue;
    expect(
      unstatedSet.has(field),
      `origin["${field}"] is "defaulted" but "${field}" is missing from Job.unstated — ` +
        `a consumer reading fieldOrigins sees a placeholder while a consumer reading ` +
        `Job.unstated sees nothing wrong`,
    ).toBe(true);
  }

  for (const field of unstatedSet) {
    const origin = origins[field as keyof FieldOrigins];
    expect(
      origin,
      `"${field}" is in Job.unstated but origins["${field}"] is ${JSON.stringify(origin)}, ` +
        `not "defaulted" — a consumer reading Job.unstated sees a placeholder while a ` +
        `consumer reading fieldOrigins sees a real, stated value`,
    ).toBe("defaulted");
  }
}

describe("fieldOrigins and Job.unstated agree on every field (no silent drift)", () => {
  const minimalDraft = {
    source: "test-adapter",
    title: "Engineer",
    company: "Acme",
    description: "A real job description.",
    requirements: [],
    origins: {},
  };

  it("a posting that states almost nothing — every defaulted field agrees with unstated", () => {
    const built = buildJob(minimalDraft);
    expect(built).toBeDefined();
    assertOriginsAgreeWithUnstated(built!.fieldOrigins, built!.job.unstated);
  });

  it("a posting that states everything — nothing is defaulted, nothing is unstated", () => {
    const built = buildJob({
      ...minimalDraft,
      location: "Remote",
      remote: "remote" as const,
      employmentType: "full-time" as const,
      seniority: "Senior",
      postedAt: "2026-06-01T00:00:00.000Z",
      deadline: "2026-08-01T00:00:00.000Z",
      sponsorship: "offered" as const,
      origins: {
        location: "stated" as const,
        remote: "stated" as const,
        employmentType: "stated" as const,
      },
    });
    expect(built).toBeDefined();
    assertOriginsAgreeWithUnstated(built!.fieldOrigins, built!.job.unstated);
    expect(built!.job.unstated ?? []).toEqual([]);
  });

  it("postedAt specifically: absent posting date must be 'defaulted' in origins, not just pushed to unstated", () => {
    // src/lib/intake/map.ts: `if (!draft.postedAt) unstated.push("postedAt")`
    // pushes to unstated but never sets origins.postedAt — confirmed live bug.
    const built = buildJob(minimalDraft);
    expect(built).toBeDefined();
    expect(built!.job.unstated ?? []).toContain("postedAt");
    expect(
      built!.fieldOrigins.postedAt,
      "origins.postedAt must be \"defaulted\" whenever postedAt is absent and therefore in Job.unstated",
    ).toBe("defaulted");
  });
});

/* ------------------------------------------------------------------ */
/* employmentTypeRaw — present only when the posting actually said something */
/* ------------------------------------------------------------------ */

describe("Job.employmentTypeRaw — emitted only when the posting stated a type", () => {
  function baseDraft() {
    return {
      source: "test-adapter",
      title: "Engineer",
      company: "Acme",
      description: "A real job description.",
      requirements: [],
      origins: {},
    };
  }

  it("stated and representable — Raw is present, employmentType is NOT recorded as unstated", () => {
    const built = buildJob({
      ...baseDraft(),
      employmentType: "full-time",
      employmentTypeRaw: "Full-time",
      origins: { employmentType: "stated" as const },
    });
    expect(built).toBeDefined();
    expect(built!.job.employmentType).toBe("full-time");
    expect(built!.job.employmentTypeRaw).toBe("Full-time");
    expect(built!.job.unstated ?? []).not.toContain("employmentType");
  });

  it("stated but unrepresentable — Raw is present, employmentType falls back and IS recorded as unstated", () => {
    // "Part time" is real posting text our 3-member enum cannot hold.
    const built = buildJob({
      ...baseDraft(),
      employmentType: undefined,
      employmentTypeRaw: "Part time",
    });
    expect(built).toBeDefined();
    expect(built!.job.employmentTypeRaw).toBe("Part time");
    expect(built!.job.unstated ?? []).toContain("employmentType");
    // Falls back to a real enum member — never invents a 4th category.
    expect(built!.job.employmentType).toBe("full-time");
  });

  it("silent — the posting said nothing, so Raw is entirely absent and employmentType IS unstated", () => {
    const built = buildJob({ ...baseDraft(), employmentType: undefined, employmentTypeRaw: undefined });
    expect(built).toBeDefined();
    // Key must be ABSENT, not present-and-undefined — a reader must be able to
    // tell "said nothing" from "said something we couldn't parse" by presence.
    expect("employmentTypeRaw" in built!.job).toBe(false);
    expect(built!.job.unstated ?? []).toContain("employmentType");
  });
});

/* ------------------------------------------------------------------ */
/* Demographic / EEO questions must never reach ApplicationForm output */
/* ------------------------------------------------------------------ */

describe("demographic/EEO questions never reach ApplicationForm output", () => {
  it("Greenhouse's demographic_questions block is excluded from form.questions", () => {
    // Sanity check the fixture actually exercises this: real Robinhood data
    // does carry a demographic_questions block (EEO race/gender/veteran/
    // disability questions) — if this ever stops being true the test below
    // would pass vacuously, so we assert the input has teeth first.
    const raw = greenhouseJobDetail as { demographic_questions?: { questions?: unknown[] } };
    expect(
      raw.demographic_questions?.questions?.length ?? 0,
      "fixture no longer exercises demographic_questions — this test needs a fixture that does",
    ).toBeGreaterThan(0);

    const output = parseGreenhouse();
    expect(output.job).toBeDefined();

    for (const q of output.form.questions) {
      expect(
        q.category,
        `question "${q.prompt}" must not be categorized/exposed as demographic — CareerOS must never surface or answer protected-characteristic questions on the candidate's behalf`,
      ).not.toBe("demographic");
    }
  });

  it("excludedSections names the section but never carries the actual EEO question wording or options", () => {
    // The exclusion is only as strong as what it DOESN'T copy — naming the
    // section ("Equal employment opportunity questions") is fine; leaking the
    // individual prompts ("What is your gender identity?") or their answer
    // options back out through excludedSections would defeat the whole point.
    const output = parseGreenhouse();
    const raw = greenhouseJobDetail as {
      demographic_questions?: { questions?: { label?: string }[] };
    };
    const demographicPrompts = (raw.demographic_questions?.questions ?? [])
      .map((q) => q.label)
      .filter((label): label is string => !!label);
    expect(demographicPrompts.length).toBeGreaterThan(0);

    const excludedText = output.form.excludedSections.join(" ").toLowerCase();
    for (const prompt of demographicPrompts) {
      expect(
        excludedText,
        `excludedSections must not contain the verbatim EEO question "${prompt}"`,
      ).not.toContain(prompt.toLowerCase());
    }
  });

  it("ApplicationQuestionCategory no longer offers \"demographic\" as a value a question can be tagged with", () => {
    // ApplicationQuestionCategory is NEW in P1 — nothing pre-existing depends
    // on it, so dropping a member is not an additive-only violation the way it
    // would be for Job/Campaign. Keeping the value around is what let the leak
    // above happen in the first place; this stops it being reintroduced by
    // someone reaching for the "obvious" category name later.
    expect(
      ApplicationQuestionCategory.options,
      '"demographic" must be removed from ApplicationQuestionCategory now that demographic questions are excluded rather than categorized',
    ).not.toContain("demographic");
  });

  // Lever's public postings API never exposes application questions at all —
  // src/lib/intake/adapters/lever.ts always returns unreadableForm() with an
  // empty questions array, and there is no card- or type:"survey"-parsing
  // code anywhere in the intake module yet. So a Lever posting trivially
  // satisfies "no demographic leak" today, but NOT because of a designed
  // exclusion — there is nothing yet to exclude FROM. This is left as an
  // explicit todo rather than a fabricated passing assertion: write the real
  // test once Lever (or paste.ts, for a pasted apply-page card list) gains
  // code that turns a `type: "survey"` card into an ApplicationQuestion.
  it.todo(
    "a Lever card tagged type:\"survey\" is excluded from form.questions (no implementation exists yet to test against)",
  );
});
