import { describe, it, expect } from "vitest";
import type { Candidate, Evidence, Job, JobRequirement } from "@/lib/types";
import {
  coverLetterClaims,
  deterministicCoverLetter,
  DETERMINISTIC_BODY_SENTENCES,
  letterSentences,
  renderCoverLetter,
  selectEvidenceForJob,
  type CoverLetterDraft,
} from "./coverLetter";

/**
 * The deterministic cover letter's entire honesty argument is that every body
 * sentence QUOTES an evidence claim verbatim, so grounding it can never find
 * anything to object to. These tests hold that argument to account rather
 * than assume it: they run every deterministically-assembled letter through
 * the REAL `groundSentences` pass (the same one the UI gates export on), not
 * a mock, and check what comes back.
 */

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "ev_1",
    claim: "Built a CPU cache simulator in C, open-sourced on GitHub.",
    category: "project",
    sourceType: "github",
    strength: "strong",
    recency: "current",
    publicProof: true,
    trust: "verified",
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
    links: {},
    evidence: [evidence()],
    ...overrides,
  };
}

function requirement(overrides: Partial<JobRequirement> = {}): JobRequirement {
  return {
    id: "req_1",
    text: "placeholder requirement",
    kind: "minimum",
    ...overrides,
  };
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job_1",
    source: "test",
    title: "Systems Software Engineer",
    normalizedTitle: "Systems Software Engineer",
    company: "Acme",
    location: "Austin, TX",
    remote: "onsite",
    employmentType: "full-time",
    seniority: "Entry",
    description: "A systems role.",
    sponsorship: "unclear",
    requirements: [],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* THE CORE HONESTY INVARIANT: a deterministic letter is NEVER unsupported */
/* ------------------------------------------------------------------ */

describe("deterministicCoverLetter, the letter it assembles must always ground as evidenced or user-provided", () => {
  it("a straightforward candidate/job pair produces zero unsupported claims", () => {
    const cand = candidate();
    const j = job({
      requirements: [
        requirement({ id: "r1", text: "Experience with C or C++ systems programming", kind: "minimum" }),
      ],
    });
    const draft = deterministicCoverLetter(cand, j);
    const claims = coverLetterClaims(draft, cand);
    const unsupported = claims.filter((c) => c.support === "unsupported");
    expect(unsupported, JSON.stringify(unsupported, null, 2)).toEqual([]);
  });

  it("REGRESSION CHECK: a requirement whose text itself contains a metric can make an honestly-quoted sentence read as 'unsupported'", () => {
    // The body sentence template appends the REQUIREMENT's own wording after
    // the evidence claim: `${evidence.claim}, which speaks to your
    // requirement, "${requirement.text}".` If the requirement's wording
    // happens to contain something groundSentences' stricter numeric-
    // precision check reads as a metric (a real posting can absolutely say
    // "reduce latency by 30%" as a responsibility), that digit did not come
    // from the candidate's evidence, it came from the EMPLOYER'S posting,
    // and addsPrecision cannot tell the difference. If this test fails
    // (support !== "evidenced"), that is confirmation of a real bug: a
    // sentence quoting real evidence verbatim gets marked as if the
    // candidate invented a number, when the number was the employer's.
    const ev = evidence({
      id: "ev_backend",
      claim: "Reduced backend latency by optimizing systems architecture.",
    });
    const cand = candidate({ evidence: [ev] });
    const req = requirement({
      id: "req_latency",
      kind: "responsibility",
      text:
        "Experience with backend latency and systems at scale, having reduced latency by 30% previously.",
    });
    const j = job({ requirements: [req] });

    const draft = deterministicCoverLetter(cand, j);
    const claims = coverLetterClaims(draft, cand);
    const bodyClaim = claims.find((c) => c.text.includes(ev.claim));

    expect(bodyClaim, "expected the letter to actually cite this evidence").toBeDefined();
    expect(
      bodyClaim!.support,
      `a sentence that verbatim-quotes real evidence must not be marked unsupported just because ` +
        `the REQUIREMENT text it also quotes happens to contain a number: "${bodyClaim!.text}"`,
    ).toBe("evidenced");
  });

  it("a candidate whose evidence claims contain real metrics with public proof still grounds as evidenced", () => {
    const cand = candidate({
      evidence: [
        evidence({
          id: "ev_metric",
          claim: "Cut CI build time by 40% by parallelizing the test suite.",
          publicProof: true,
        }),
      ],
    });
    const j = job({
      requirements: [requirement({ text: "Experience improving build or test infrastructure" })],
    });
    const draft = deterministicCoverLetter(cand, j);
    const claims = coverLetterClaims(draft, cand);
    expect(claims.some((c) => c.support === "unsupported")).toBe(false);
  });

  it("a candidate with no requirement overlap still falls back to strongest evidence and grounds cleanly", () => {
    const cand = candidate({
      evidence: [evidence({ id: "ev_a", strength: "strong", claim: "Wrote a raytracer in Rust." })],
    });
    const j = job({
      requirements: [requirement({ text: "Fluency in Mandarin and experience in retail operations" })],
    });
    const draft = deterministicCoverLetter(cand, j);
    const claims = coverLetterClaims(draft, cand);
    expect(claims.some((c) => c.support === "unsupported")).toBe(false);
    // Fallback path was actually exercised, not skipped.
    expect(draft.paragraphs.flatMap((p) => p.sentences).some((s) => s.role === "evidence")).toBe(
      true,
    );
  });

  it("a candidate with zero evidence produces a letter with no evidence-role sentences at all, never a fabricated one", () => {
    const cand = candidate({ evidence: [] });
    const j = job({ requirements: [requirement({ text: "Anything" })] });
    const draft = deterministicCoverLetter(cand, j);
    const sentences = letterSentences(draft);
    expect(sentences.some((s) => s.role === "evidence")).toBe(false);
    // Every remaining sentence must still ground honestly (intent/profile).
    const claims = coverLetterClaims(draft, cand);
    expect(claims.some((c) => c.support === "unsupported")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* selectEvidenceForJob, deterministic matching and tie-breaking      */
/* ------------------------------------------------------------------ */

describe("selectEvidenceForJob", () => {
  it("visits requirements minimum-first, then preferred, then responsibility", () => {
    const cand = candidate({
      evidence: [
        evidence({ id: "ev_min", claim: "Wrote embedded C firmware for microcontrollers." }),
        evidence({ id: "ev_pref", claim: "Contributed to an open-source Python framework." }),
        evidence({ id: "ev_resp", claim: "Mentored junior engineers on code review practices." }),
      ],
    });
    const j = job({
      requirements: [
        requirement({ id: "r_resp", kind: "responsibility", text: "Mentor junior engineers" }),
        requirement({ id: "r_pref", kind: "preferred", text: "Python framework experience" }),
        requirement({ id: "r_min", kind: "minimum", text: "Embedded C firmware experience" }),
      ],
    });
    const picked = selectEvidenceForJob(cand, j, 3);
    expect(picked.map((p) => p.requirement?.id)).toEqual(["r_min", "r_pref", "r_resp"]);
  });

  it("never selects the same evidence twice for two different requirements", () => {
    const ev = evidence({ id: "ev_shared", claim: "Built distributed systems in Go for a startup." });
    const cand = candidate({ evidence: [ev] });
    const j = job({
      requirements: [
        requirement({ id: "r1", text: "Distributed systems experience" }),
        requirement({ id: "r2", text: "Go programming experience" }),
      ],
    });
    const picked = selectEvidenceForJob(cand, j, 2);
    const ids = picked.map((p) => p.evidence.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("breaks a match-strength tie by evidence strength, then by id", () => {
    const cand = candidate({
      evidence: [
        evidence({ id: "ev_b", claim: "Built a caching layer.", strength: "limited" }),
        evidence({ id: "ev_a", claim: "Built a caching layer.", strength: "strong" }),
      ],
    });
    const j = job({ requirements: [requirement({ text: "Experience building a caching layer" })] });
    const picked = selectEvidenceForJob(cand, j, 1);
    expect(picked[0].evidence.id).toBe("ev_a");
  });

  it("respects the limit even when more requirements could be matched", () => {
    const cand = candidate({
      evidence: [
        evidence({ id: "ev_1", claim: "Wrote a compiler backend in LLVM." }),
        evidence({ id: "ev_2", claim: "Built a database query planner." }),
        evidence({ id: "ev_3", claim: "Shipped a distributed job scheduler." }),
      ],
    });
    const j = job({
      requirements: [
        requirement({ id: "r1", text: "Compiler backend experience" }),
        requirement({ id: "r2", text: "Database query planner experience" }),
        requirement({ id: "r3", text: "Distributed job scheduler experience" }),
      ],
    });
    expect(selectEvidenceForJob(cand, j, 1)).toHaveLength(1);
    expect(selectEvidenceForJob(cand, j, 2)).toHaveLength(2);
  });

  it("falls back to strongest, public-proof-first evidence when nothing overlaps any requirement", () => {
    const cand = candidate({
      evidence: [
        evidence({ id: "ev_weak", strength: "limited", publicProof: true, claim: "Took an online course." }),
        evidence({ id: "ev_strong_private", strength: "strong", publicProof: false, claim: "Led a private project." }),
        evidence({ id: "ev_strong_public", strength: "strong", publicProof: true, claim: "Shipped a public tool." }),
      ],
    });
    const j = job({ requirements: [requirement({ text: "Fluency in Mandarin" })] });
    const picked = selectEvidenceForJob(cand, j, 1);
    expect(picked[0].evidence.id).toBe("ev_strong_public");
  });

  it("the fallback path also respects the limit", () => {
    const cand = candidate({
      evidence: [
        evidence({ id: "ev_1" }),
        evidence({ id: "ev_2", claim: "A second, unrelated claim about robotics." }),
        evidence({ id: "ev_3", claim: "A third, unrelated claim about databases." }),
      ],
    });
    const j = job({ requirements: [] });
    expect(selectEvidenceForJob(cand, j, 2)).toHaveLength(2);
  });

  it("is deterministic: the same candidate and job always produce the same picks in the same order", () => {
    const cand = candidate({
      evidence: [
        evidence({ id: "ev_1", claim: "Built a caching layer in Go." }),
        evidence({ id: "ev_2", claim: "Wrote a caching proxy in Rust." }),
      ],
    });
    const j = job({ requirements: [requirement({ text: "Caching layer or proxy experience" })] });
    const first = selectEvidenceForJob(cand, j, 2).map((p) => p.evidence.id);
    const second = selectEvidenceForJob(cand, j, 2).map((p) => p.evidence.id);
    expect(first).toEqual(second);
  });
});

/* ------------------------------------------------------------------ */
/* deterministicCoverLetter, structure                                */
/* ------------------------------------------------------------------ */

describe("deterministicCoverLetter, structure", () => {
  it("opens by naming the exact job title and company", () => {
    const cand = candidate();
    const j = job({ title: "Backend Intern", company: "Robinhood" });
    const draft = deterministicCoverLetter(cand, j);
    expect(draft.paragraphs[0].sentences[0].text).toContain("Backend Intern");
    expect(draft.paragraphs[0].sentences[0].text).toContain("Robinhood");
  });

  it("includes a profile line only when BOTH headline and location are present", () => {
    const withBoth = deterministicCoverLetter(candidate(), job());
    expect(letterSentences(withBoth).some((s) => s.role === "profile")).toBe(true);

    const withoutLocation = deterministicCoverLetter(candidate({ location: "" }), job());
    expect(letterSentences(withoutLocation).some((s) => s.role === "profile")).toBe(false);

    const withoutHeadline = deterministicCoverLetter(candidate({ headline: "" }), job());
    expect(letterSentences(withoutHeadline).some((s) => s.role === "profile")).toBe(false);
  });

  it("caps the evidence body at DETERMINISTIC_BODY_SENTENCES even with abundant matching evidence", () => {
    const cand = candidate({
      evidence: Array.from({ length: 6 }, (_, i) =>
        evidence({ id: `ev_${i}`, claim: `Shipped feature number ${i} for the platform team.` }),
      ),
    });
    const j = job({
      requirements: Array.from({ length: 6 }, (_, i) =>
        requirement({ id: `r_${i}`, text: `Experience shipping feature number ${i}` }),
      ),
    });
    const draft = deterministicCoverLetter(cand, j);
    const evidenceSentences = letterSentences(draft).filter((s) => s.role === "evidence");
    expect(evidenceSentences.length).toBeLessThanOrEqual(DETERMINISTIC_BODY_SENTENCES);
  });

  it("always discloses that the draft was assembled and must be reviewed", () => {
    const draft = deterministicCoverLetter(candidate(), job());
    const text = letterSentences(draft).map((s) => s.text).join(" ");
    expect(text).toMatch(/reviewed and edited/i);
  });

  it("signs the closing with the candidate's real name", () => {
    const draft = deterministicCoverLetter(candidate({ name: "Priya Raman" }), job());
    expect(draft.closing).toContain("Priya Raman");
  });

  it("never invents a recipient name, greeting is always the generic form", () => {
    const draft = deterministicCoverLetter(candidate(), job());
    expect(draft.greeting).toBe("Dear Hiring Team,");
  });
});

/* ------------------------------------------------------------------ */
/* renderCoverLetter                                                   */
/* ------------------------------------------------------------------ */

describe("renderCoverLetter", () => {
  it("never writes claim labels (evidenced/unsupported/user-provided) into the letter text itself", () => {
    const draft = deterministicCoverLetter(candidate(), job({ requirements: [requirement()] }));
    const text = renderCoverLetter(draft);
    expect(text).not.toMatch(/\b(evidenced|unsupported|user-provided)\b/);
  });

  it("joins sentences within a paragraph with spaces and separates paragraphs with a blank line", () => {
    const draft: CoverLetterDraft = {
      greeting: "Dear Hiring Team,",
      paragraphs: [
        { sentences: [{ text: "First sentence.", role: "intent" }, { text: "Second sentence.", role: "intent" }] },
        { sentences: [{ text: "Third sentence.", role: "intent" }] },
      ],
      closing: "Sincerely,\nA Candidate",
    };
    const text = renderCoverLetter(draft);
    expect(text).toContain("First sentence. Second sentence.");
    expect(text).toContain("First sentence. Second sentence.\n\nThird sentence.");
  });

  it("drops an empty paragraph rather than leaving a stray blank line", () => {
    const draft: CoverLetterDraft = {
      greeting: "Dear Hiring Team,",
      paragraphs: [
        { sentences: [{ text: "  ", role: "intent" }] },
        { sentences: [{ text: "Real content.", role: "intent" }] },
      ],
      closing: "Sincerely,\nA Candidate",
    };
    const text = renderCoverLetter(draft);
    expect(text).not.toMatch(/\n{3,}/);
    expect(text).toContain("Real content.");
  });

  it("ends with the closing and a trailing newline", () => {
    const draft = deterministicCoverLetter(candidate(), job());
    const text = renderCoverLetter(draft);
    expect(text.endsWith(`${draft.closing.trim()}\n`)).toBe(true);
  });
});
