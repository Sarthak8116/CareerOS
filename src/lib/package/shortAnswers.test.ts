import { describe, it, expect } from "vitest";
import type { ApplicationAnswer, ApplicationForm, ApplicationQuestion } from "@/lib/types";
import { matchAnswers, shortAnswerQuestions, buildShortAnswers } from "./shortAnswers";

/**
 * Short answers — the module whose entire job is to keep "reused" and
 * "drafted" from ever collapsing (nothing here drafts, ever) and to be
 * honest about a near-miss: an unmatched question costs the user a note, a
 * WRONG "reused" match costs them the application.
 */

function q(overrides: Partial<ApplicationQuestion> = {}): ApplicationQuestion {
  return {
    id: "q1",
    prompt: "placeholder",
    kind: "long-text",
    category: "other",
    trust: "source-backed",
    ...overrides,
  };
}

function answer(overrides: Partial<ApplicationAnswer> = {}): ApplicationAnswer {
  return {
    id: "ans_1",
    question: "placeholder",
    answer: "placeholder answer",
    tags: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
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

describe("matchAnswers", () => {
  it("pairs a question with the library entry that reads as the same topic", () => {
    const result = matchAnswers(
      [q({ id: "q1", prompt: "Why do you want to work here?" })],
      [answer({ question: "Why do you want to work here?", answer: "The engineering culture." })],
    );
    expect(result).toHaveLength(1);
    expect(result[0].source?.answer).toBe("The engineering culture.");
  });

  it("leaves a question unmatched (not force-matched) when nothing in the library is close", () => {
    const result = matchAnswers(
      [q({ id: "q1", prompt: "Describe a time you failed." })],
      [answer({ question: "What is your expected salary?", answer: "$120k" })],
    );
    expect(result[0].source).toBeUndefined();
  });

  it("returns a question with no source when the library is empty", () => {
    const result = matchAnswers([q({ id: "q1", prompt: "Why do you want to work here?" })], []);
    expect(result[0]).toEqual({ question: result[0].question });
  });

  it("the FIRST matching library entry wins, in library order — stable and explicable", () => {
    const question = q({ id: "q1", prompt: "Why do you want to work here?" });
    const first = answer({ id: "ans_first", question: "Why do you want to work here?", answer: "First answer." });
    const second = answer({ id: "ans_second", question: "Why do you want to work here?", answer: "Second answer." });
    const result = matchAnswers([question], [first, second]);
    expect(result[0].source?.id).toBe("ans_first");
  });

  it("preserves question order and pairs each question independently", () => {
    const q1 = q({ id: "q1", prompt: "Why do you want to work here?" });
    const q2 = q({ id: "q2", prompt: "What is your expected salary?" });
    const lib = [answer({ question: "Why do you want to work here?", answer: "Culture." })];
    const result = matchAnswers([q1, q2], lib);
    expect(result.map((r) => r.question.id)).toEqual(["q1", "q2"]);
    expect(result[0].source).toBeDefined();
    expect(result[1].source).toBeUndefined();
  });
});

describe("shortAnswerQuestions — routes personal-info and document questions elsewhere exactly once", () => {
  it("keeps a question with no autofillKey at all", () => {
    const question = q({ id: "q1", autofillKey: undefined });
    expect(shortAnswerQuestions(form({ questions: [question] }))).toEqual([question]);
  });

  it("drops a question whose autofillKey belongs to the personal-info sheet", () => {
    const question = q({ id: "q1", autofillKey: "email" });
    expect(shortAnswerQuestions(form({ questions: [question] }))).toEqual([]);
  });

  it("drops a question whose autofillKey belongs to the resume/cover-letter documents", () => {
    const resumeQ = q({ id: "q1", autofillKey: "resume" });
    const coverQ = q({ id: "q2", autofillKey: "cover-letter" });
    expect(shortAnswerQuestions(form({ questions: [resumeQ, coverQ] }))).toEqual([]);
  });

  it("a question is routed to exactly one place — never both short-answers and personal-info", () => {
    const personalQ = q({ id: "q1", autofillKey: "location" });
    const genericQ = q({ id: "q2", autofillKey: undefined });
    const kept = shortAnswerQuestions(form({ questions: [personalQ, genericQ] }));
    expect(kept.map((k) => k.id)).toEqual(["q2"]);
  });

  it("returns an empty array when there is no form", () => {
    expect(shortAnswerQuestions(undefined)).toEqual([]);
  });
});

describe("buildShortAnswers — no questions", () => {
  it("is 'not-requested' when the form was read in full and asks nothing here", () => {
    const doc = buildShortAnswers({
      form: form({ completeness: "complete", questions: [] }),
      library: [],
      jobTitle: "Systems Software Engineer",
      company: "Acme Corp",
    });
    expect(doc.status).toBe("not-requested");
    expect(doc.content).toBe("");
    expect(doc.claims).toEqual([]);
    expect(doc.missing).toEqual([]);
  });

  it("is 'needs-you' — not 'not-requested' — when the form could not be fully read, even with zero questions", () => {
    const doc = buildShortAnswers({
      form: form({ completeness: "partial", questions: [] }),
      library: [],
      jobTitle: "Systems Software Engineer",
      company: "Acme Corp",
    });
    expect(doc.status).toBe("needs-you");
    expect(doc.missing).toHaveLength(1);
    expect(doc.missing[0]).toMatch(/could not read the form/i);
  });

  it("is 'needs-you' when there is no application form at all", () => {
    const doc = buildShortAnswers({
      form: undefined,
      library: [],
      jobTitle: "Systems Software Engineer",
      company: "Acme Corp",
    });
    expect(doc.status).toBe("needs-you");
    expect(doc.missing).toHaveLength(1);
  });
});

describe("buildShortAnswers — never 'drafted', only 'reused' or 'needs-you'", () => {
  it("is 'reused' when every question is matched, and content names the library question it came from", () => {
    const doc = buildShortAnswers({
      form: form({
        questions: [q({ id: "q1", prompt: "Why do you want to work here?" })],
      }),
      library: [answer({ question: "Why do you want to work here?", answer: "Culture and mission." })],
      jobTitle: "Systems Software Engineer",
      company: "Acme Corp",
    });
    expect(doc.status).toBe("reused");
    expect(doc.status).not.toBe("drafted");
    expect(doc.content).toContain("reused from your answer library");
    expect(doc.content).toContain('saved as: "Why do you want to work here?"');
    expect(doc.content).toContain("Culture and mission.");
  });

  it("is 'needs-you' when even one question is unmatched, and never silently drops it", () => {
    const doc = buildShortAnswers({
      form: form({
        questions: [
          q({ id: "q1", prompt: "Why do you want to work here?" }),
          q({ id: "q2", prompt: "Describe your biggest failure." }),
        ],
      }),
      library: [answer({ question: "Why do you want to work here?", answer: "Culture." })],
      jobTitle: "Systems Software Engineer",
      company: "Acme Corp",
    });
    expect(doc.status).toBe("needs-you");
    expect(doc.status).not.toBe("drafted");
    expect(doc.content).toContain("YOU MUST WRITE THIS");
    expect(doc.missing).toEqual([
      'An answer to "Describe your biggest failure." — no saved answer matched, so you must write it.',
    ]);
  });

  it("claims are exactly one per MATCHED answer, all 'user-provided' with the user's own text — never 'evidenced'", () => {
    const doc = buildShortAnswers({
      form: form({
        questions: [
          q({ id: "q1", prompt: "Why do you want to work here?" }),
          q({ id: "q2", prompt: "Describe your biggest failure." }), // unmatched
        ],
      }),
      library: [answer({ question: "Why do you want to work here?", answer: "Culture." })],
      jobTitle: "Systems Software Engineer",
      company: "Acme Corp",
    });
    expect(doc.claims).toEqual([{ text: "Culture.", support: "user-provided" }]);
  });

  it("an unmatched question produces NO claim — nothing is asserted about an answer that doesn't exist yet", () => {
    const doc = buildShortAnswers({
      form: form({ questions: [q({ id: "q1", prompt: "Describe your biggest failure." })] }),
      library: [],
      jobTitle: "Systems Software Engineer",
      company: "Acme Corp",
    });
    expect(doc.claims).toEqual([]);
  });
});

describe("buildShortAnswers — required/optional framing never invents what we didn't read", () => {
  it("labels a question the form marked required as 'Required'", () => {
    const doc = buildShortAnswers({
      form: form({ questions: [q({ id: "q1", prompt: "Why us?", required: true })] }),
      library: [],
      jobTitle: "X",
      company: "Y",
    });
    expect(doc.content).toContain("*Required ·");
  });

  it("labels a question the form marked optional as 'Optional'", () => {
    const doc = buildShortAnswers({
      form: form({ questions: [q({ id: "q1", prompt: "Why us?", required: false })] }),
      library: [],
      jobTitle: "X",
      company: "Y",
    });
    expect(doc.content).toContain("*Optional ·");
  });

  it("labels a question whose required-ness we never read honestly, not as a guessed default", () => {
    const doc = buildShortAnswers({
      form: form({ questions: [q({ id: "q1", prompt: "Why us?", required: undefined })] }),
      library: [],
      jobTitle: "X",
      company: "Y",
    });
    expect(doc.content).toContain("CareerOS could not read whether this is required");
    expect(doc.content).not.toContain("*Required ·");
    expect(doc.content).not.toContain("*Optional ·");
  });
});

/**
 * OPEN FINDING (ruled a real bug by team-lead, assigned to coder-package —
 * see the message thread and match.test.ts). `matchAnswers` calls
 * `isSameTopic(question.prompt, entry.question)` directly: the CURRENT
 * form's question is the query, a SAVED library question is the target.
 * `isSameTopic`'s `coverageOfQuery >= 0.7` branch has no ceiling on how much
 * EXTRA content the target carries, so a short current question can match a
 * verbose old saved question and pull in an answer that also covers material
 * nobody asked this time — labelled "reused" (truthfully, as far as the
 * schema goes) but not actually a clean answer to just this question.
 *
 * This is left as it.todo, not asserted either way, until match.ts's fix
 * lands — flip it to a real assertion once coverage is required in both
 * directions.
 */
it.todo(
  "matchAnswers does not pair a short current question with a saved library question that covers substantial unrelated extra topics — BLOCKED on match.ts fix (coverageOfQuery/coverageOfTarget symmetry)",
);
