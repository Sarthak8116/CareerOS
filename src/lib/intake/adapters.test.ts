import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Job as JobSchema, ApplicationForm as FormSchema } from "@/lib/types";
import { greenhouseAdapter } from "@/lib/intake/adapters/greenhouse";
import { leverAdapter } from "@/lib/intake/adapters/lever";
import { ashbyAdapter } from "@/lib/intake/adapters/ashby";
import { workdayAdapter } from "@/lib/intake/adapters/workday";
import { genericAdapter } from "@/lib/intake/adapters/generic";
import type { AdapterOutput, IntakeAdapter } from "@/lib/intake/types";
import greenhouse from "@/lib/intake/__fixtures__/greenhouse.json";
import lever from "@/lib/intake/__fixtures__/lever.json";
import ashby from "@/lib/intake/__fixtures__/ashby.json";
import workday from "@/lib/intake/__fixtures__/workday.json";
import greenhouseBroken from "@/lib/intake/__fixtures__/greenhouse-broken.json";
import leverBroken from "@/lib/intake/__fixtures__/lever-broken.json";
import workdayBroken from "@/lib/intake/__fixtures__/workday-broken.json";

/**
 * Adapter tests, run entirely against REAL captured responses.
 *
 * No network: every adapter is pure by construction, so a fixture plus an
 * injected `fetchedAt` fully determines its output. These assertions are
 * written against the quirks that actually exist in live data, the leading
 * space in an Ashby title, Lever's epoch timestamps, Workday's relative
 * "Posted Today", because those are the ones that silently corrupt a Job.
 */

const FETCHED_AT = "2026-09-19T12:00:00.000Z";

const FIXTURE_DIR = path.join(process.cwd(), "src", "lib", "intake", "__fixtures__");
const readFixture = (file: string) =>
  readFileSync(path.join(FIXTURE_DIR, file), "utf8");

/** Run an adapter over one JSON body, as the orchestrator would. */
function runJson(
  adapter: IntakeAdapter,
  json: unknown,
  url: string,
): AdapterOutput {
  return adapter.parse({
    responses: [{ kind: "posting", status: 200, contentType: "application/json", json }],
    url,
    fetchedAt: FETCHED_AT,
  });
}

/** Run an adapter over one HTML body. */
function runHtml(adapter: IntakeAdapter, text: string, url: string): AdapterOutput {
  return adapter.parse({
    responses: [{ kind: "posting", status: 200, contentType: "text/html", text }],
    url,
    fetchedAt: FETCHED_AT,
  });
}

const GH_URL = "https://boards.greenhouse.io/robinhood/jobs/8198153";
const LV_URL = "https://jobs.lever.co/leverdemo/ad208490-4052-4f91-a57e-433f2d1e484b";
const AS_URL = "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245";
const WD_URL =
  "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Principal-Block-File-Storage-Software-Engineer--Linux---DGX-Cloud_JR2024421";

/* ------------------------------------------------------------------ */

describe("greenhouse", () => {
  const out = runJson(greenhouseAdapter, greenhouse, GH_URL);

  it("produces a schema-valid Job and ApplicationForm", () => {
    expect(out.job).toBeDefined();
    expect(JobSchema.safeParse(out.job).success).toBe(true);
    expect(FormSchema.safeParse(out.form).success).toBe(true);
  });

  it("entity-decodes the description exactly once, no markup survives as text", () => {
    const description = out.job!.description;
    // The raw fixture literally contains "&lt;div class=&quot;...". If the
    // decode is skipped the user reads "&lt;div&gt;" soup; if the decode runs
    // but tags are not stripped, the word "div" survives as visible text.
    expect(description).not.toContain("&lt;");
    expect(description).not.toContain("&quot;");
    expect(description).not.toMatch(/<\/?div/i);
    expect(description).not.toMatch(/\bdiv\b/);
    // And the real content is present.
    expect(description).toContain("Join us in building the future of finance");
  });

  it("reads the stated fields verbatim", () => {
    expect(out.job!.title).toBe("Accounting Intern (Summer 2027)");
    expect(out.job!.company).toBe("Robinhood");
    expect(out.job!.location).toBe("New York, NY");
    expect(out.job!.postedAt).toBe(greenhouse.first_published);
  });

  it("never guesses a deadline when application_deadline is null", () => {
    expect(greenhouse.application_deadline).toBeNull();
    expect(out.job!.deadline).toBeUndefined();
  });

  it("derives internship from the title rather than defaulting to full-time", () => {
    expect(out.job!.employmentType).toBe("internship");
    expect(out.fieldOrigins.employmentType).toBe("derived");
    expect(out.job!.unstated ?? []).not.toContain("employmentType");
  });

  it("drops input_hidden fields, Longitude is not an application question", () => {
    const prompts = out.form.questions.map((q) => q.prompt);
    expect(prompts).not.toContain("Longitude");
    expect(prompts).not.toContain("Latitude");
    expect(prompts.some((p) => /longitude|latitude/i.test(p))).toBe(false);
  });

  it("reads real questions, their options and their required flags", () => {
    const prompts = out.form.questions.map((q) => q.prompt);
    expect(prompts).toContain("First Name");
    expect(prompts).toContain("Are you legally work authorized to work in the US?");

    const workAuth = out.form.questions.find((q) =>
      q.prompt.startsWith("Are you legally work authorized"),
    )!;
    expect(workAuth.kind).toBe("single-select");
    expect(workAuth.options).toEqual(["Yes", "No"]);
    expect(workAuth.required).toBe(true);
    expect(workAuth.category).toBe("work-authorization");
    expect(workAuth.trust).toBe("source-backed");
  });

  it("maps autofill keys from exact field names only", () => {
    const first = out.form.questions.find((q) => q.prompt === "First Name")!;
    expect(first.autofillKey).toBe("first-name");
    // A custom question must never acquire an autofill key by fuzzy matching.
    const custom = out.form.questions.find((q) =>
      q.prompt.startsWith("Are you legally work authorized"),
    )!;
    expect(custom.autofillKey).toBeUndefined();
  });

  it("uses not-requested ONLY because the form is fully enumerated", () => {
    expect(out.form.completeness).toBe("complete");
    expect(out.form.resume).toBe("required");
    // The fixture has no cover_letter field, and the form is complete, so this
    // is a FACT about the employer, not an absence of knowledge.
    expect(out.form.coverLetter).toBe("not-requested");
  });

  it("excludes EEO questions from the form and names the section instead", () => {
    const demographic = greenhouse.demographic_questions.questions;
    expect(demographic.length).toBeGreaterThan(0);

    // None of the demographic wording is carried anywhere in the output.
    const serialized = JSON.stringify(out.form.questions);
    expect(serialized).not.toMatch(/gender identity/i);
    expect(serialized).not.toMatch(/transgender/i);
    expect(serialized).not.toMatch(/veteran|disability/i);
    // Every EEO prompt in the fixture is absent from the output by wording, not
    // merely by category, the category for them no longer exists at all.
    for (const dq of demographic) {
      expect(serialized).not.toContain(dq.label);
    }

    // But the user is told the section exists.
    expect(out.form.excludedSections.length).toBe(1);
    expect(out.form.excludedSections[0]).toMatch(/equal employment opportunity/i);
  });

  it("extracts requirements only under recognised headings", () => {
    for (const requirement of out.job!.requirements) {
      expect(requirement.text.length).toBeGreaterThan(0);
      expect(["minimum", "preferred", "responsibility"]).toContain(requirement.kind);
      // skillKey is the skills engine's job, never intake's.
      expect(requirement.skillKey).toBeUndefined();
    }
  });
});

/* ------------------------------------------------------------------ */

describe("lever", () => {
  const out = runJson(leverAdapter, lever, LV_URL);

  it("produces a schema-valid Job", () => {
    expect(JobSchema.safeParse(out.job).success).toBe(true);
  });

  it("converts the epoch-millisecond createdAt into an ISO date", () => {
    expect(typeof lever.createdAt).toBe("number");
    expect(out.job!.postedAt).toBe(new Date(lever.createdAt).toISOString());
    expect(out.job!.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reads workplaceType straight from the stated lowercase value", () => {
    expect(lever.workplaceType).toBe("hybrid");
    expect(out.job!.remote).toBe("hybrid");
    expect(out.fieldOrigins.remote).toBe("stated");
  });

  it("builds requirements from the real lists[] structure", () => {
    expect(lever.lists.length).toBeGreaterThan(0);
    const skillSet = out.job!.requirements.filter((r) => r.kind === "minimum");
    // "Skill Set:" is a recognised minimum heading; the month-milestone lists
    // ("Within 1 Month You'll:") are responsibilities.
    expect(skillSet.length).toBeGreaterThan(0);
    expect(
      out.job!.requirements.some((r) => r.kind === "responsibility"),
    ).toBe(true);
  });

  it("says UNKNOWN about the application form, never not-requested", () => {
    expect(out.form.completeness).toBe("none");
    expect(out.form.resume).toBe("unknown");
    expect(out.form.coverLetter).toBe("unknown");
    expect(out.form.portfolio).toBe("unknown");
    expect(out.form.questions).toEqual([]);
    expect(out.form.unknowns.join(" ")).toMatch(/paste/i);
  });

  it("flags that the company name came from the URL, not the posting", () => {
    expect(out.job!.company).toBe("Leverdemo");
    expect(out.fieldOrigins.company).toBe("derived");
    expect(out.assumptions.join(" ")).toMatch(/company name comes from the job board URL/i);
  });
});

/* ------------------------------------------------------------------ */

describe("ashby", () => {
  // The fixture is a single posting; the live board endpoint wraps postings in
  // `{ jobs: [...] }` and has no single-job route, so the adapter is exercised
  // against the envelope it will actually receive.
  const board = { jobs: [ashby], apiVersion: "1" };
  const out = runJson(ashbyAdapter, board, AS_URL);

  it("produces a schema-valid Job", () => {
    expect(JobSchema.safeParse(out.job).success).toBe(true);
  });

  it("trims the leading space real Ashby titles ship with", () => {
    expect(ashby.title).toMatch(/^\s/);
    expect(out.job!.title).toBe("Security Engineer, Cloud");
    expect(out.job!.title).not.toMatch(/^\s/);
    expect(out.job!.normalizedTitle).toBe("Security Engineer, Cloud");
  });

  it("maps the capitalised workplaceType and employmentType", () => {
    expect(out.job!.remote).toBe("hybrid");
    expect(out.job!.employmentType).toBe("full-time");
    expect(out.job!.employmentTypeRaw).toBe("FullTime");
  });

  it("uses the ISO publishedAt as-is", () => {
    expect(out.job!.postedAt).toBe(ashby.publishedAt);
  });

  it("falls back to paste for the application form", () => {
    expect(out.form.completeness).toBe("none");
    expect(out.form.resume).toBe("unknown");
    expect(out.form.applyUrl).toBe(ashby.applyUrl);
  });

  it("returns no Job for an id that isn't on the board", () => {
    const missing = runJson(
      ashbyAdapter,
      board,
      "https://jobs.ashbyhq.com/ramp/00000000-0000-0000-0000-000000000000",
    );
    expect(missing.job).toBeUndefined();
    expect(missing.partial?.url).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */

describe("workday", () => {
  const out = runJson(workdayAdapter, workday, WD_URL);

  it("produces a schema-valid Job", () => {
    expect(JobSchema.safeParse(out.job).success).toBe(true);
  });

  it("NEVER stores the relative postedOn text as a date", () => {
    expect(workday.jobPostingInfo.postedOn).toBe("Posted Today");
    expect(out.job!.postedAt).toBeUndefined();
    // The wording is preserved as an assumption rather than silently dropped.
    expect(out.assumptions.join(" ")).toContain("Posted Today");
    // `postedAt` is optional and simply ABSENT, it holds no placeholder, so
    // there is no false impression to correct and it belongs in neither map
    // (same treatment as `deadline`). The fact the user needs reaches them
    // through `assumptions`, which is the channel for notes that are not about
    // a substituted value.
    expect(out.job!.unstated ?? []).not.toContain("postedAt");
    expect(out.fieldOrigins.postedAt).toBeUndefined();
  });

  it("keeps the legal-entity company name verbatim and says where it came from", () => {
    expect(out.job!.company).toBe("2100 NVIDIA USA");
    expect(out.fieldOrigins.company).toBe("derived");
    expect(out.assumptions.join(" ")).toMatch(/legal entity name/i);
  });

  it("maps timeType and records that remoteness is unstated", () => {
    expect(out.job!.employmentType).toBe("full-time");
    expect(out.job!.employmentTypeRaw).toBe("Full time");
    expect(out.job!.remote).toBe("unknown");
    expect(out.job!.unstated).toContain("remote");
  });
});

/* ------------------------------------------------------------------ */

describe("generic (JSON-LD)", () => {
  it("reads a real server-rendered JobPosting out of a captured page", () => {
    const html = readFixture("ashby-apply-page.html");
    const out = runHtml(genericAdapter, html, AS_URL);

    expect(out.job).toBeDefined();
    expect(JobSchema.safeParse(out.job).success).toBe(true);
    expect(out.job!.title).toBe("Security Engineer, Cloud");
    expect(out.job!.company).toBe("Ramp");
    expect(out.job!.employmentType).toBe("full-time");
    expect(out.job!.employmentTypeRaw).toBe("FULL_TIME");
    expect(out.job!.location).toBe("New York City, NY");
    expect(out.job!.postedAt).toBe("2026-04-07");
    expect(out.job!.description).not.toMatch(/<\/?p>/);
  });

  it("fails honestly on a page with no JSON-LD rather than scraping headings", () => {
    const html = readFixture("lever-apply-page.html");
    const out = runHtml(genericAdapter, html, LV_URL);

    expect(out.job).toBeUndefined();
    expect(out.form.completeness).toBe("none");
    // A page title may be offered as PREFILL, but never as a parsed Job.
    expect(out.partial?.url).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */

describe("captured error bodies never become a Job", () => {
  it("handles each board's real 404 payload without inventing a posting", () => {
    const cases: [IntakeAdapter, unknown, string][] = [
      [greenhouseAdapter, greenhouseBroken, GH_URL],
      [leverAdapter, leverBroken, LV_URL],
      [workdayAdapter, workdayBroken, WD_URL],
    ];
    for (const [adapter, body, url] of cases) {
      const out = runJson(adapter, body, url);
      expect(out.job, `${adapter.key} must not build a Job from an error body`).toBeUndefined();
      expect(FormSchema.safeParse(out.form).success).toBe(true);
      expect(out.form.resume).toBe("unknown");
    }
  });

  it("survives Ashby's plain-text 404, which is not JSON at all", () => {
    const text = readFixture("ashby-broken.txt");
    expect(text.trim()).toBe("Not Found");
    // The orchestrator passes `json: undefined` when the body isn't JSON.
    const out = ashbyAdapter.parse({
      responses: [{ kind: "posting", status: 404, contentType: "text/plain", text }],
      url: AS_URL,
      fetchedAt: FETCHED_AT,
    });
    expect(out.job).toBeUndefined();
    expect(out.form.completeness).toBe("none");
  });
});
