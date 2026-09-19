import { describe, it, expect } from "vitest";
import type { ApplicationForm, Candidate, Evidence, Job, JobRequirement } from "@/lib/types";
import { buildResumeDocument, relevantEvidence } from "./resumeDoc";

/**
 * Two behaviours here are DELIBERATE, per coder-package, and these tests
 * assert them as intended rather than treat them as bugs to fix:
 *
 *  1. A resume-requesting form always adds a `missing` entry naming that the
 *     package contains a Markdown draft, not a formatted file — so real
 *     packages are "partial" far more often than not, on purpose.
 *  2. Copying distrusted evidence (weak-inference / unknown trust) into the
 *     resume verbatim does NOT launder it into something evidenced. The same
 *     honesty pass that grades the cover letter grades this document.
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
  return { id: "req_1", text: "placeholder requirement", kind: "minimum", ...overrides };
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

function form(overrides: Partial<ApplicationForm> = {}): ApplicationForm {
  return {
    jobId: "job_1",
    source: "fetched",
    adapter: "greenhouse",
    fetchedAt: "2026-09-19T12:00:00.000Z",
    completeness: "complete",
    resume: "required",
    coverLetter: "not-requested",
    portfolio: "not-requested",
    questions: [],
    excludedSections: [],
    unknowns: [],
    warnings: [],
    trust: "source-backed",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Deliberate behavior #1: the "not a real file" disclosure            */
/* ------------------------------------------------------------------ */

describe("buildResumeDocument — the Markdown-not-a-file disclosure (intentional)", () => {
  it("always names the gap when the form REQUIRES a resume, even with a full, strong evidence graph", () => {
    const doc = buildResumeDocument({
      candidate: candidate(),
      job: job({ requirements: [requirement({ text: "C or C++ systems programming" })] }),
      form: form({ resume: "required" }),
    });
    expect(doc.missing).toHaveLength(1);
    expect(doc.missing[0]).toMatch(/markdown draft/i);
    expect(doc.missing[0]).toMatch(/not a formatted/i);
  });

  it("also names the gap when the form marks a resume OPTIONAL, not just required", () => {
    const doc = buildResumeDocument({
      candidate: candidate(),
      job: job(),
      form: form({ resume: "optional" }),
    });
    expect(doc.missing).toHaveLength(1);
  });

  it("names NOTHING when the form does not ask for a resume at all", () => {
    const doc = buildResumeDocument({
      candidate: candidate(),
      job: job(),
      form: form({ resume: "not-requested" }),
    });
    expect(doc.status).toBe("not-requested");
    expect(doc.missing).toEqual([]);
    expect(doc.content).toBe("");
    expect(doc.claims).toEqual([]);
  });

  it("names NOTHING when resume status is genuinely unknown (we could not read the form)", () => {
    const doc = buildResumeDocument({
      candidate: candidate(),
      job: job(),
      form: form({ resume: "unknown", completeness: "none" }),
    });
    // "unknown" is an admission about US, not a fact about the form asking
    // for a resume — buildResumeDocument still drafts one (best effort), but
    // must not claim a fact ("this is missing a file") it cannot support.
    expect(doc.missing).toEqual([]);
  });

  it("names NOTHING when no ApplicationForm is available at all", () => {
    const doc = buildResumeDocument({ candidate: candidate(), job: job() });
    expect(doc.missing).toEqual([]);
    expect(doc.status).toBe("drafted");
  });

  it("this is the honest reason 'complete' is hard to reach: a resume-requiring package can never be gap-free while this entry exists", () => {
    // Not asserting deriveCompleteness here (that's build.ts's contract) —
    // just pinning down the fact this module contributes an entry that ANY
    // completeness derivation must count, so "complete" cannot silently
    // ignore an unformatted resume.
    const doc = buildResumeDocument({
      candidate: candidate(),
      job: job(),
      form: form({ resume: "required", completeness: "complete" }),
    });
    expect(doc.missing.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Deliberate behavior #2: distrust survives verbatim copying          */
/* ------------------------------------------------------------------ */

describe("buildResumeDocument — copying evidence does not launder trust (intentional)", () => {
  it("weak-inference evidence, quoted verbatim, still grades unsupported", () => {
    const doc = buildResumeDocument({
      candidate: candidate({
        evidence: [
          evidence({ id: "ev_weak", trust: "weak-inference", claim: "Interested in distributed systems." }),
        ],
      }),
      job: job(),
    });
    expect(doc.content).toContain("Interested in distributed systems.");
    const claim = doc.claims.find((c) => c.text === "Interested in distributed systems.");
    expect(claim?.support).toBe("unsupported");
  });

  it("unknown-trust evidence, quoted verbatim, still grades unsupported", () => {
    const doc = buildResumeDocument({
      candidate: candidate({
        evidence: [evidence({ id: "ev_unknown", trust: "unknown", claim: "Attended a hackathon." })],
      }),
      job: job(),
    });
    const claim = doc.claims.find((c) => c.text === "Attended a hackathon.");
    expect(claim?.support).toBe("unsupported");
  });

  it("verified, source-backed evidence grades evidenced, for contrast", () => {
    const doc = buildResumeDocument({
      candidate: candidate({
        evidence: [evidence({ id: "ev_good", trust: "verified", claim: "Shipped a public compiler pass." })],
      }),
      job: job(),
    });
    const claim = doc.claims.find((c) => c.text === "Shipped a public compiler pass.");
    expect(claim).toEqual({ text: "Shipped a public compiler pass.", support: "evidenced", evidenceId: "ev_good" });
  });
});

/* ------------------------------------------------------------------ */
/* Assembly — nothing rewritten, ordering, structure                   */
/* ------------------------------------------------------------------ */

describe("buildResumeDocument — assembly", () => {
  it("every evidence claim appears in the content VERBATIM — nothing is rewritten", () => {
    const ev = evidence({ claim: "Reduced build time by exactly this exact wording, unaltered." });
    const doc = buildResumeDocument({ candidate: candidate({ evidence: [ev] }), job: job() });
    expect(doc.content).toContain(ev.claim);
  });

  it("relevant-to-the-role evidence is grouped under its own heading, ahead of the rest", () => {
    const relevant = evidence({ id: "ev_rel", claim: "Built a caching layer for backend systems." });
    const other = evidence({ id: "ev_other", claim: "Learned watercolor painting.", category: "achievement" });
    const doc = buildResumeDocument({
      candidate: candidate({ evidence: [other, relevant] }),
      job: job({ requirements: [requirement({ text: "Experience with backend caching systems" })] }),
    });
    expect(doc.content).toContain("## Most relevant to this role");
    const relevantIdx = doc.content.indexOf("Built a caching layer");
    const otherIdx = doc.content.indexOf("Learned watercolor painting");
    expect(relevantIdx).toBeGreaterThan(-1);
    expect(otherIdx).toBeGreaterThan(-1);
    expect(relevantIdx).toBeLessThan(otherIdx);
  });

  it("omits the 'Most relevant' section entirely when nothing overlaps the posting", () => {
    const doc = buildResumeDocument({
      candidate: candidate({ evidence: [evidence({ claim: "Unrelated to anything the posting asks for." })] }),
      job: job({ requirements: [requirement({ text: "Fluency in Mandarin" })] }),
    });
    expect(doc.content).not.toContain("## Most relevant to this role");
  });

  it("includes the source reference only when publicProof is true", () => {
    const withProof = evidence({ id: "ev_a", publicProof: true, sourceReference: "github.com/example/repo" });
    const withoutProof = evidence({ id: "ev_b", publicProof: false, sourceReference: "github.com/example/private" });
    const doc = buildResumeDocument({
      candidate: candidate({ evidence: [withProof, withoutProof] }),
      job: job(),
    });
    expect(doc.content).toContain("(github.com/example/repo)");
    expect(doc.content).not.toContain("(github.com/example/private)");
  });

  it("always includes education, name, and a plain disclosure that nothing was invented", () => {
    const doc = buildResumeDocument({ candidate: candidate({ name: "Priya Raman" }), job: job() });
    expect(doc.content).toContain("# Priya Raman");
    expect(doc.content).toContain("## Education");
    expect(doc.content).toMatch(/nothing was rewritten or added/i);
  });
});

describe("relevantEvidence", () => {
  it("is deterministic: ties break on evidence id", () => {
    const a = evidence({ id: "ev_a", claim: "Backend caching systems experience." });
    const b = evidence({ id: "ev_b", claim: "Backend caching systems expertise." });
    const j = job({ requirements: [requirement({ text: "Backend caching systems" })] });
    const first = relevantEvidence(candidate({ evidence: [b, a] }), j).map((e) => e.id);
    const second = relevantEvidence(candidate({ evidence: [b, a] }), j).map((e) => e.id);
    expect(first).toEqual(second);
  });

  it("excludes evidence with zero overlap with any requirement", () => {
    const ev = evidence({ claim: "Completely unrelated hobby content." });
    const result = relevantEvidence(
      candidate({ evidence: [ev] }),
      job({ requirements: [requirement({ text: "Distributed systems and Go programming" })] }),
    );
    expect(result).toEqual([]);
  });
});
