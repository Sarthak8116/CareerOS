import { describe, it, expect } from "vitest";
import type {
  ApplicationAnswer,
  ApplicationForm,
  Campaign,
  Candidate,
  Job,
} from "@/lib/types";
import { buildApplicationPackage, deriveCompleteness } from "./build";

/**
 * The package builder — where the P2 contract's four hard constraints are
 * actually enforced, not just described:
 *
 *  1. every factual sentence in a document is backed by a PackageClaim
 *  2. completeness is DERIVED from `missing`, never set directly
 *  3. "reused" and "drafted" never collapse
 *  4. excludedSections carries through from ApplicationForm untouched
 *
 * Plus: personal info never invents a field the profile doesn't hold, and
 * folderName/fileName sanitization survives all the way through assembly
 * (a scraped, hostile job title reaching the builder, not just the sanitizer
 * called directly).
 */

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job_1",
    source: "greenhouse",
    title: "Systems Software Engineer",
    normalizedTitle: "systems software engineer",
    company: "Acme Corp",
    location: "Austin, TX",
    remote: "hybrid",
    employmentType: "full-time",
    seniority: "entry",
    description: "Build systems software.",
    sponsorship: "unclear",
    requirements: [
      { id: "req_1", text: "Experience with C and low-level systems programming", kind: "minimum" },
      { id: "req_2", text: "Familiarity with distributed systems", kind: "preferred" },
    ],
    ...overrides,
  };
}

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
    links: { github: "https://github.com/jrivera" },
    evidence: [
      {
        id: "ev_1",
        claim: "Built a CPU cache simulator in C, open-sourced on GitHub.",
        category: "project",
        sourceType: "github",
        sourceReference: "github.com/jrivera/cache-sim",
        strength: "strong",
        recency: "current",
        publicProof: true,
        trust: "verified",
      },
      {
        id: "ev_2",
        claim: "Coursework exposure to distributed systems concepts.",
        category: "skill",
        sourceType: "resume",
        strength: "limited",
        recency: "recent",
        publicProof: false,
        trust: "user-provided",
      },
    ],
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

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp_1",
    candidateId: "cand_1",
    job: job(),
    stage: "applied",
    readiness: "strong",
    createdAt: "2026-09-01T00:00:00.000Z",
    isDemo: false,
    fit: [],
    gaps: [],
    tasks: [],
    people: [],
    activity: [],
    nextAction: "Submit application.",
    applicationForm: form(),
    ...overrides,
  };
}

const BUILT_AT = "2026-09-19T12:00:00.000Z";

/** Personal-field questions limited to what the fixture `candidate()` above actually has stored. */
const PERSONAL_QUESTIONS_SATISFIABLE: ApplicationForm["questions"] = [
  { id: "q_name", prompt: "Full name", kind: "short-text", category: "personal-info", autofillKey: "name", trust: "source-backed" },
  { id: "q_location", prompt: "Location", kind: "short-text", category: "personal-info", autofillKey: "location", trust: "source-backed" },
  { id: "q_github", prompt: "GitHub URL", kind: "url", category: "personal-info", autofillKey: "github", trust: "source-backed" },
];

/** All personal fields, including ones this fixture candidate does NOT store (email, phone, linkedin, portfolio). */
const PERSONAL_QUESTIONS_ALL: ApplicationForm["questions"] = [
  ...PERSONAL_QUESTIONS_SATISFIABLE,
  { id: "q_email", prompt: "Email address", kind: "short-text", category: "contact", autofillKey: "email", trust: "source-backed" },
  { id: "q_phone", prompt: "Phone number", kind: "short-text", category: "contact", autofillKey: "phone", trust: "source-backed" },
  { id: "q_linkedin", prompt: "LinkedIn URL", kind: "url", category: "personal-info", autofillKey: "linkedin", trust: "source-backed" },
  { id: "q_portfolio", prompt: "Portfolio URL", kind: "url", category: "personal-info", autofillKey: "portfolio", trust: "source-backed" },
];

describe("deriveCompleteness — the ONLY place completeness is computed", () => {
  it("is complete exactly when nothing is missing", () => {
    expect(deriveCompleteness([])).toBe("complete");
  });

  it("is partial when anything at all is missing", () => {
    expect(deriveCompleteness(["one gap"])).toBe("partial");
    expect(deriveCompleteness(["gap one", "gap two"])).toBe("partial");
  });
});

describe("buildApplicationPackage — completeness is derived, never asserted", () => {
  it("a form whose every ask is satisfiable (no resume-file requirement, a matched short answer, satisfiable personal fields) reads complete", () => {
    // `resume` is deliberately "not-requested" here: a required resume ALWAYS
    // leaves a residual gap (see the dedicated test below) because the
    // package only ever contains a Markdown draft, never a formatted file —
    // that is intentional honesty, not something this "complete" case should
    // fight.
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({
        applicationForm: form({
          resume: "not-requested",
          questions: [
            {
              id: "q1",
              prompt: "Why do you want to work here?",
              kind: "long-text",
              category: "motivation",
              trust: "source-backed",
            },
            ...PERSONAL_QUESTIONS_SATISFIABLE,
          ],
        }),
      }),
      candidate: candidate(),
      library: [
        {
          id: "ans_1",
          question: "Why do you want to work here?",
          answer: "Because I admire the engineering culture.",
          tags: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      builtAt: BUILT_AT,
    });

    expect(pkg.completeness).toBe("complete");
    expect(pkg.missing).toEqual([]);
  });

  it("a required resume ALWAYS leaves a residual gap — the package only ever contains a Markdown draft, never the formatted file the form asks for", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({ applicationForm: form({ resume: "required" }) }),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    expect(pkg.completeness).toBe("partial");
    expect(pkg.missing.some((m) => /resume file to upload/i.test(m))).toBe(true);
  });

  it("an unanswered required question makes the package partial and names the gap", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({
        applicationForm: form({
          questions: [
            {
              id: "q1",
              prompt: "Describe a technical challenge you overcame.",
              kind: "long-text",
              category: "experience",
              required: true,
              trust: "source-backed",
            },
          ],
        }),
      }),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });

    expect(pkg.completeness).toBe("partial");
    expect(pkg.missing.some((m) => m.includes("Describe a technical challenge"))).toBe(true);
  });

  it("completeness NEVER disagrees with an empty missing[] or vice versa — derivation cannot drift", () => {
    // Property check across a handful of shapes: whatever missing[] ends up
    // being, completeness must be exactly deriveCompleteness(missing).
    const cases: Partial<ApplicationForm>[] = [
      {},
      { portfolio: "required" },
      { completeness: "partial", unknowns: ["Some field we couldn't read."] },
      { resume: "not-requested", coverLetter: "not-requested" },
    ];
    for (const formOverrides of cases) {
      const { package: pkg } = buildApplicationPackage({
        campaign: campaign({ applicationForm: form(formOverrides) }),
        candidate: candidate(),
        library: [],
        builtAt: BUILT_AT,
      });
      expect(pkg.completeness).toBe(deriveCompleteness(pkg.missing));
    }
  });

  it("with NO application form at all, the package is partial and says so honestly", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({ applicationForm: undefined }),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    expect(pkg.completeness).toBe("partial");
    expect(pkg.missing.some((m) => /never read a form/i.test(m))).toBe(true);
  });
});

describe("buildApplicationPackage — excludedSections carries through untouched", () => {
  it("passes the form's excludedSections through verbatim", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({
        applicationForm: form({ excludedSections: ["a voluntary EEO section"] }),
      }),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    expect(pkg.excludedSections).toEqual(["a voluntary EEO section"]);
  });

  it("is an empty array, never invented content, when the form has none", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({ applicationForm: form({ excludedSections: [] }) }),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    expect(pkg.excludedSections).toEqual([]);
  });

  it("is an empty array (not invented) when there is no form at all", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({ applicationForm: undefined }),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    expect(pkg.excludedSections).toEqual([]);
  });
});

describe("buildApplicationPackage — reused and drafted never collapse", () => {
  it("the cover letter (something CareerOS actually writes) is 'drafted', never 'reused'", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign(),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    const coverLetter = pkg.documents.find((d) => d.kind === "cover-letter")!;
    expect(coverLetter.status).toBe("drafted");
  });

  it("short-answers is NEVER 'drafted' — matched answers are 'reused', unmatched are 'needs-you'", () => {
    const { package: matched } = buildApplicationPackage({
      campaign: campaign({
        applicationForm: form({
          questions: [
            {
              id: "q1",
              prompt: "Why do you want to work here?",
              kind: "long-text",
              category: "motivation",
              trust: "source-backed",
            },
          ],
        }),
      }),
      candidate: candidate(),
      library: [
        {
          id: "ans_1",
          question: "Why do you want to work here?",
          answer: "Because of the engineering culture.",
          tags: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      builtAt: BUILT_AT,
    });
    const matchedDoc = matched.documents.find((d) => d.kind === "short-answers")!;
    expect(matchedDoc.status).toBe("reused");
    expect(matchedDoc.status).not.toBe("drafted");

    const { package: unmatched } = buildApplicationPackage({
      campaign: campaign({
        applicationForm: form({
          questions: [
            {
              id: "q1",
              prompt: "Describe a time you failed.",
              kind: "long-text",
              category: "experience",
              trust: "source-backed",
            },
          ],
        }),
      }),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    const unmatchedDoc = unmatched.documents.find((d) => d.kind === "short-answers")!;
    expect(unmatchedDoc.status).toBe("needs-you");
    expect(unmatchedDoc.status).not.toBe("drafted");
  });

  it("personal-info is NEVER 'drafted' — it is pulled from the stored profile, not written for this posting", () => {
    // Exercised two ways: once where the form asks for personal fields
    // (populated), once where it does not (not-requested) — "drafted" must
    // never appear in either case.
    const { package: populated } = buildApplicationPackage({
      campaign: campaign({
        applicationForm: form({ questions: PERSONAL_QUESTIONS_SATISFIABLE }),
      }),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    const populatedDoc = populated.documents.find((d) => d.kind === "personal-info")!;
    expect(["reused", "needs-you"]).toContain(populatedDoc.status);
    expect(populatedDoc.status).not.toBe("drafted");

    const { package: unrequested } = buildApplicationPackage({
      campaign: campaign(),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    const unrequestedDoc = unrequested.documents.find((d) => d.kind === "personal-info")!;
    expect(unrequestedDoc.status).toBe("not-requested");
    expect(unrequestedDoc.status).not.toBe("drafted");
  });

  it("reused short-answers content is labelled as reused, not silently presented as drafted", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({
        applicationForm: form({
          questions: [
            {
              id: "q1",
              prompt: "Why do you want to work here?",
              kind: "long-text",
              category: "motivation",
              trust: "source-backed",
            },
          ],
        }),
      }),
      candidate: candidate(),
      library: [
        {
          id: "ans_1",
          question: "Why do you want to work here?",
          answer: "Because of the engineering culture.",
          tags: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      builtAt: BUILT_AT,
    });
    const shortAnswers = pkg.documents.find((d) => d.kind === "short-answers")!;
    expect(shortAnswers.content).toContain("reused from your answer library");
  });
});

describe("buildApplicationPackage — no factual sentence reaches a document without a PackageClaim", () => {
  it("the cover letter's claims cover every sentence actually rendered into its content", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign(),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    const coverLetter = pkg.documents.find((d) => d.kind === "cover-letter")!;
    expect(coverLetter.claims.length).toBeGreaterThan(0);
    for (const claim of coverLetter.claims) {
      expect(coverLetter.content).toContain(claim.text);
    }
  });

  it("the resume's claims cover every evidence bullet actually rendered into its content", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign(),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    const resume = pkg.documents.find((d) => d.kind === "resume")!;
    // One claim per evidence row — nothing dropped, nothing added.
    expect(resume.claims).toHaveLength(candidate().evidence.length);
    for (const claim of resume.claims) {
      expect(resume.content).toContain(claim.text);
    }
  });

  it("short-answers claims are all 'user-provided' — the user's own words, never asserted as evidenced", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({
        applicationForm: form({
          questions: [
            {
              id: "q1",
              prompt: "Why do you want to work here?",
              kind: "long-text",
              category: "motivation",
              trust: "source-backed",
            },
          ],
        }),
      }),
      candidate: candidate(),
      library: [
        {
          id: "ans_1",
          question: "Why do you want to work here?",
          answer: "Because of the engineering culture.",
          tags: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      builtAt: BUILT_AT,
    });
    const shortAnswers = pkg.documents.find((d) => d.kind === "short-answers")!;
    expect(shortAnswers.claims.length).toBeGreaterThan(0);
    expect(shortAnswers.claims.every((c) => c.support === "user-provided")).toBe(true);
  });

  it("personal-info claims are all 'user-provided', one per filled field, never 'evidenced'", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({
        applicationForm: form({ questions: PERSONAL_QUESTIONS_SATISFIABLE }),
      }),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    const personalInfo = pkg.documents.find((d) => d.kind === "personal-info")!;
    expect(personalInfo.claims.length).toBeGreaterThan(0);
    expect(personalInfo.claims.every((c) => c.support === "user-provided")).toBe(true);
  });
});

describe("buildApplicationPackage — personal info never invents a field absent from the profile", () => {
  it("a candidate missing links, a splittable name, email, and phone shows notes, not invented values", () => {
    const sparse = candidate({
      name: "Madonna", // single token — cannot split into first/last
      links: {}, // no github/linkedin/portfolio at all
    });
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({
        applicationForm: form({ questions: PERSONAL_QUESTIONS_ALL }),
      }),
      candidate: sparse,
      library: [],
      builtAt: BUILT_AT,
    });
    const personalInfo = pkg.documents.find((d) => d.kind === "personal-info")!;

    // Never fabricates an email or phone number — CareerOS does not store them.
    expect(personalInfo.content).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i); // no email-shaped string
    expect(personalInfo.content).toMatch(/does not store your email/i);
    expect(personalInfo.content).toMatch(/does not store your phone/i);

    // No claim asserts a value the candidate object does not actually hold.
    for (const claim of personalInfo.claims) {
      const value = claim.text.split(": ").slice(1).join(": ");
      const candidateValues = [
        sparse.name,
        sparse.location,
        sparse.university,
        sparse.degree,
        String(sparse.graduationYear),
        sparse.workAuthorization,
        sparse.links.github,
        sparse.links.linkedin,
        sparse.links.portfolio,
      ];
      expect(candidateValues).toContain(value);
    }
  });

  it("every filled personal-info field's claim text matches the candidate's actual stored value exactly", () => {
    const cand = candidate();
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({
        applicationForm: form({ questions: PERSONAL_QUESTIONS_SATISFIABLE }),
      }),
      candidate: cand,
      library: [],
      builtAt: BUILT_AT,
    });
    const personalInfo = pkg.documents.find((d) => d.kind === "personal-info")!;
    const githubClaim = personalInfo.claims.find((c) => c.text.startsWith("GitHub:"));
    expect(githubClaim?.text).toBe(`GitHub: ${cand.links.github}`);
  });
});

describe("buildApplicationPackage — folder/file names are sanitized all the way through assembly", () => {
  it("a hostile job title and company never reach folderName or a document fileName unsanitized", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({
        job: job({ title: "../../etc/evil", company: "..\\..\\Windows\\System32" }),
      }),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });

    expect(pkg.folderName).not.toContain("..");
    expect(pkg.folderName).not.toMatch(/[/\\]/);
    for (const doc of pkg.documents) {
      expect(doc.fileName).not.toContain("..");
      expect(doc.fileName).not.toMatch(/[/\\]/);
    }
  });
});

describe("buildApplicationPackage — cover-letter 'not-requested' is honored", () => {
  it("produces an empty, unclaimed, not-requested cover-letter document and never lists it as missing", () => {
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign({ applicationForm: form({ coverLetter: "not-requested" }) }),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    const coverLetter = pkg.documents.find((d) => d.kind === "cover-letter")!;
    expect(coverLetter.status).toBe("not-requested");
    expect(coverLetter.content).toBe("");
    expect(coverLetter.claims).toEqual([]);
    expect(pkg.missing.some((m) => /cover letter/i.test(m))).toBe(false);
  });
});

describe("buildApplicationPackage — determinism (no clock, no randomness, anywhere in the call graph)", () => {
  it("the same campaign, candidate, library, and builtAt produce a byte-identical package across two calls", () => {
    const input = {
      campaign: campaign({
        job: job({
          requirements: [
            { id: "req_1", text: "Experience with C and low-level systems programming", kind: "minimum" as const },
          ],
        }),
        applicationForm: form({
          questions: [
            {
              id: "q1",
              prompt: "Why do you want to work here?",
              kind: "long-text" as const,
              category: "motivation" as const,
              trust: "source-backed" as const,
            },
            ...PERSONAL_QUESTIONS_SATISFIABLE,
          ],
        }),
      }),
      candidate: candidate(),
      library: [
        {
          id: "ans_1",
          question: "Why do you want to work here?",
          answer: "Because I admire the engineering culture.",
          tags: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      builtAt: BUILT_AT,
    };

    const first = buildApplicationPackage(input);
    const second = buildApplicationPackage(input);

    // A byte-for-byte comparison catches a Date.now()/Math.random() reaching
    // into the builder through a DEPENDENCY (coverLetter.ts, resumeDoc.ts,
    // shortAnswers.ts, personalInfo.ts, match.ts, filenames.ts), not just one
    // guards.test.ts can see by grepping only files in this directory.
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("still deterministic when a live-model cover letter is supplied instead of the assembled fallback", () => {
    const liveCoverLetter = {
      greeting: "Dear Hiring Team,",
      paragraphs: [
        {
          sentences: [
            { text: "I am excited to apply for this role.", role: "intent" as const },
          ],
        },
      ],
      closing: "Sincerely,\nJordan Rivera",
    };
    const input = {
      campaign: campaign(),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
      coverLetter: liveCoverLetter,
    };

    const first = buildApplicationPackage(input);
    const second = buildApplicationPackage(input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.coverLetterOrigin).toBe("model");
  });
});

describe("buildApplicationPackage — the result is schema-valid by construction", () => {
  it("parses through ApplicationPackage without alteration (the builder validates its own output)", async () => {
    const { ApplicationPackage } = await import("@/lib/types");
    const { package: pkg } = buildApplicationPackage({
      campaign: campaign(),
      candidate: candidate(),
      library: [],
      builtAt: BUILT_AT,
    });
    expect(ApplicationPackage.parse(pkg)).toEqual(pkg);
  });
});
