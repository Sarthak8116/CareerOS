import { describe, it, expect } from "vitest";
import type { ApplicationForm, ApplicationQuestion, Candidate } from "@/lib/types";
import {
  personalField,
  requestedPersonalKeys,
  buildPersonalInfo,
  PERSONAL_AUTOFILL_KEYS,
  DOCUMENT_AUTOFILL_KEYS,
} from "./personalInfo";

/**
 * The personal-information sheet, the module whose entire job is to NEVER
 * invent a field the profile doesn't hold. Every test here either shows a
 * real value passing through unchanged, or shows a missing value producing a
 * plain note instead of a guess.
 */

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "cand_1",
    name: "Jordan Rivera",
    headline: "Systems Software Engineer",
    location: "Austin, TX",
    university: "UT Austin",
    degree: "BS Computer Science",
    graduationYear: 2026,
    experienceLevel: "student",
    workAuthorization: "US Citizen",
    targetRoles: ["Systems Software Engineer"],
    targetIndustries: ["Semiconductors"],
    links: { github: "https://github.com/jrivera", linkedin: "https://linkedin.com/in/jrivera" },
    evidence: [],
    ...overrides,
  };
}

function question(overrides: Partial<ApplicationQuestion> = {}): ApplicationQuestion {
  return {
    id: "q1",
    prompt: "placeholder",
    kind: "short-text",
    category: "personal-info",
    trust: "source-backed",
    ...overrides,
  };
}

function form(overrides: Partial<ApplicationForm> = {}): ApplicationForm {
  return {
    jobId: "job_1",
    source: "fetched",
    adapter: "greenhouse",
    fetchedAt: "2026-09-01T00:00:00.000Z",
    completeness: "complete",
    resume: "required",
    coverLetter: "required",
    portfolio: "not-requested",
    questions: [],
    excludedSections: [],
    unknowns: [],
    warnings: [],
    trust: "source-backed",
    ...overrides,
  };
}

describe("personalField, every key reads only the stored profile, never invents", () => {
  it("returns the exact stored value for straightforward fields", () => {
    const cand = candidate();
    expect(personalField("name", cand)).toEqual({ key: "name", label: "Full name", value: "Jordan Rivera" });
    expect(personalField("location", cand)).toEqual({ key: "location", label: "Location", value: "Austin, TX" });
    expect(personalField("university", cand)).toEqual({ key: "university", label: "University", value: "UT Austin" });
    expect(personalField("degree", cand)).toEqual({ key: "degree", label: "Degree", value: "BS Computer Science" });
    expect(personalField("work-authorization", cand)).toEqual({
      key: "work-authorization",
      label: "Work authorization",
      value: "US Citizen",
    });
    expect(personalField("graduation-year", cand)).toEqual({
      key: "graduation-year",
      label: "Graduation year",
      value: "2026",
    });
  });

  it("returns links exactly as stored, and a note (not a guess) when a link is absent", () => {
    const cand = candidate({ links: { github: "https://github.com/jrivera" } });
    expect(personalField("github", cand).value).toBe("https://github.com/jrivera");
    const linkedin = personalField("linkedin", cand);
    expect(linkedin.value).toBeUndefined();
    expect(linkedin.note).toMatch(/not in your careeros profile/i);
    const portfolio = personalField("portfolio", cand);
    expect(portfolio.value).toBeUndefined();
    expect(portfolio.note).toMatch(/not in your careeros profile/i);
  });

  it("email and phone are NEVER returned, regardless of candidate, CareerOS never stores them", () => {
    const cand = candidate();
    const email = personalField("email", cand);
    expect(email.value).toBeUndefined();
    expect(email.note).toBe("CareerOS does not store your email address, add it yourself.");
    const phone = personalField("phone", cand);
    expect(phone.value).toBeUndefined();
    expect(phone.note).toBe("CareerOS does not store your phone number, add it yourself.");
  });

  it("splits a clean two-token name into first/last", () => {
    const cand = candidate({ name: "Jordan Rivera" });
    expect(personalField("first-name", cand).value).toBe("Jordan");
    expect(personalField("last-name", cand).value).toBe("Rivera");
  });

  it("refuses to guess at a single-token name, no invented split", () => {
    const cand = candidate({ name: "Madonna" });
    const first = personalField("first-name", cand);
    const last = personalField("last-name", cand);
    expect(first.value).toBeUndefined();
    expect(last.value).toBeUndefined();
    expect(first.note).toMatch(/does not split cleanly/i);
    expect(last.note).toMatch(/does not split cleanly/i);
  });

  it("refuses to guess at a name with more than two tokens, ambiguous, not ours to resolve", () => {
    const cand = candidate({ name: "Maria del Carmen Gonzalez Ruiz" });
    expect(personalField("first-name", cand).value).toBeUndefined();
    expect(personalField("last-name", cand).value).toBeUndefined();
  });

  it("treats a stored 'Unknown' placeholder the same as absent, never presents it as a real value", () => {
    // `location`/`seniority`-style "Unknown" placeholders exist elsewhere in
    // the schema (see Job.unstated); personalField applies the same rule to
    // whatever it's handed.
    const cand = candidate({ location: "Unknown" });
    const location = personalField("location", cand);
    expect(location.value).toBeUndefined();
    expect(location.note).toMatch(/not in your careeros profile/i);
  });

  it("treats an empty or whitespace-only stored value as absent, not as a blank real value", () => {
    const cand = candidate({ location: "   " });
    expect(personalField("location", cand).value).toBeUndefined();
  });

  it("every PERSONAL_AUTOFILL_KEY resolves to a value drawn from `candidate`, never a literal not present anywhere on it", () => {
    const cand = candidate({
      links: {
        github: "https://github.com/jrivera",
        linkedin: "https://linkedin.com/in/jrivera",
        portfolio: "https://jrivera.dev",
      },
    });
    const candidateStrings = [
      cand.name,
      "Jordan", // valid first-name split of a 2-token name
      "Rivera", // valid last-name split
      cand.location,
      cand.links.github,
      cand.links.linkedin,
      cand.links.portfolio,
      cand.workAuthorization,
      cand.university,
      cand.degree,
      String(cand.graduationYear),
    ];
    for (const key of PERSONAL_AUTOFILL_KEYS) {
      const field = personalField(key, cand);
      if (field.value !== undefined) {
        expect(candidateStrings, `key: ${key}`).toContain(field.value);
      }
    }
  });
});

describe("requestedPersonalKeys", () => {
  it("reads exactly the personal-autofill-key questions the form asks, deduplicated", () => {
    const f = form({
      questions: [
        question({ id: "q1", autofillKey: "name" }),
        question({ id: "q2", autofillKey: "location" }),
        question({ id: "q3", autofillKey: "name" }), // duplicate on purpose
      ],
    });
    const { keys, fromForm } = requestedPersonalKeys(f);
    expect(fromForm).toBe(true);
    expect(keys).toEqual(["name", "location"]);
  });

  it("ignores non-personal autofill keys (resume/cover-letter) and unkeyed questions", () => {
    const f = form({
      questions: [
        question({ id: "q1", autofillKey: "resume" }),
        question({ id: "q2" }), // no autofillKey at all
        question({ id: "q3", autofillKey: "name" }),
      ],
    });
    expect(requestedPersonalKeys(f).keys).toEqual(["name"]);
  });

  it("says so, rather than guessing, when a FULLY read form asks for none of this", () => {
    const f = form({ completeness: "complete", questions: [] });
    expect(requestedPersonalKeys(f)).toEqual({ keys: [], fromForm: true });
  });

  it("falls back to the default key set when the form was not fully read", () => {
    const f = form({ completeness: "partial", questions: [] });
    const { keys, fromForm } = requestedPersonalKeys(f);
    expect(fromForm).toBe(false);
    expect(keys.length).toBeGreaterThan(0);
  });

  it("falls back to the default key set when there is no form at all", () => {
    const { keys, fromForm } = requestedPersonalKeys(undefined);
    expect(fromForm).toBe(false);
    expect(keys.length).toBeGreaterThan(0);
  });
});

describe("buildPersonalInfo, status, claims, and missing all trace back to what requestedPersonalKeys asked for", () => {
  it("is 'not-requested' with no content, claims, or missing when the form asks for nothing here", () => {
    const doc = buildPersonalInfo({
      candidate: candidate(),
      form: form({ completeness: "complete", questions: [] }),
    });
    expect(doc).toEqual({ status: "not-requested", content: "", claims: [], missing: [] });
  });

  it("is 'reused' (never 'drafted') when every requested field is filled", () => {
    const doc = buildPersonalInfo({
      candidate: candidate(),
      form: form({
        questions: [question({ id: "q1", autofillKey: "name" }), question({ id: "q2", autofillKey: "location" })],
      }),
    });
    expect(doc.status).toBe("reused");
  });

  it("is 'needs-you' when any requested field is blank, and names exactly which", () => {
    const doc = buildPersonalInfo({
      candidate: candidate(),
      form: form({
        questions: [
          question({ id: "q1", autofillKey: "name" }),
          question({ id: "q2", autofillKey: "email" }), // never stored
        ],
      }),
    });
    expect(doc.status).toBe("needs-you");
    expect(doc.missing).toHaveLength(1);
    expect(doc.missing[0]).toMatch(/email address/i);
  });

  it("claims are exactly one per FILLED field, all 'user-provided', text exactly 'Label: value'", () => {
    const cand = candidate();
    const doc = buildPersonalInfo({
      candidate: cand,
      form: form({
        questions: [question({ id: "q1", autofillKey: "name" }), question({ id: "q2", autofillKey: "location" })],
      }),
    });
    expect(doc.claims).toEqual([
      { text: `Full name: ${cand.name}`, support: "user-provided" },
      { text: `Location: ${cand.location}`, support: "user-provided" },
    ]);
  });

  it("a blank field produces NO claim, nothing is asserted about a value that doesn't exist", () => {
    const doc = buildPersonalInfo({
      candidate: candidate(),
      form: form({ questions: [question({ id: "q1", autofillKey: "email" })] }),
    });
    expect(doc.claims).toEqual([]);
    expect(doc.missing).toHaveLength(1);
  });

  it("content states plainly when the form itself asked, vs. when defaults were guessed", () => {
    const fromFormDoc = buildPersonalInfo({
      candidate: candidate(),
      form: form({ questions: [question({ id: "q1", autofillKey: "name" })] }),
    });
    expect(fromFormDoc.content).toMatch(/the fields this application asks for/i);

    const defaultedDoc = buildPersonalInfo({
      candidate: candidate(),
      form: form({ completeness: "partial", questions: [] }),
    });
    expect(defaultedDoc.content).toMatch(/could not read this application's own fields/i);
  });

  it("with no form at all, still never invents, falls back to defaults and flags blanks the same way", () => {
    const doc = buildPersonalInfo({ candidate: candidate(), form: undefined });
    expect(doc.status).not.toBe("not-requested");
    // email/phone are always in DEFAULT_KEYS and never stored, so always blank.
    expect(doc.missing.some((m) => /email/i.test(m))).toBe(true);
    expect(doc.claims.every((c) => c.support === "user-provided")).toBe(true);
  });
});

describe("PERSONAL_AUTOFILL_KEYS / DOCUMENT_AUTOFILL_KEYS, no overlap", () => {
  it("a key belongs to exactly one of the two sets, never both", () => {
    for (const key of PERSONAL_AUTOFILL_KEYS) {
      expect(DOCUMENT_AUTOFILL_KEYS.has(key)).toBe(false);
    }
  });
});
