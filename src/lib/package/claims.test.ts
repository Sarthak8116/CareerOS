import { describe, it, expect } from "vitest";
import type { Candidate, Evidence } from "@/lib/types";
import { groundSentences, profileValues, countUnsupported, type GroundedSentence } from "./claims";

/**
 * The cover letter is the highest-risk generation in this product, free
 * prose about a real person (see `careeros/contract/p2-application-package`).
 * `groundSentences` is the mechanism that stops an unsupported sentence from
 * reaching the document unflagged, and it does it by REUSING
 * `engine/resume.ts`'s `verifyClaims` rather than inventing softer rules,
 * these tests exercise that reuse directly, plus the two additions the
 * module makes on top of it (numeric-precision and role-demotion), which the
 * module's own header says must only ever be STRICTER, never looser.
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

function sentence(overrides: Partial<GroundedSentence>): GroundedSentence {
  return { text: "placeholder", role: "intent", ...overrides };
}

describe("groundSentences, evidence-role sentences", () => {
  it("marks a cited, unembellished evidence sentence as evidenced", () => {
    const cand = candidate();
    const claims = groundSentences(
      [sentence({ text: "I built a CPU cache simulator in C.", role: "evidence", evidenceId: "ev_1" })],
      cand,
    );
    expect(claims).toEqual([
      { text: "I built a CPU cache simulator in C.", support: "evidenced", evidenceId: "ev_1" },
    ]);
  });

  it("marks an evidence sentence with NO citation as unsupported", () => {
    const claims = groundSentences(
      [sentence({ text: "I led the backend team to a major rewrite.", role: "evidence" })],
      candidate(),
    );
    expect(claims).toEqual([
      { text: "I led the backend team to a major rewrite.", support: "unsupported" },
    ]);
  });

  it("marks an evidence sentence citing a NONEXISTENT evidence id as unsupported", () => {
    const claims = groundSentences(
      [sentence({ text: "I shipped the payments pipeline.", role: "evidence", evidenceId: "ev_ghost" })],
      candidate(),
    );
    expect(claims[0].support).toBe("unsupported");
    expect(claims[0]).not.toHaveProperty("evidenceId");
  });

  it("REUSES verifyClaims: citing weak-inference/unknown-trust evidence is unsupported", () => {
    const cand = candidate({
      evidence: [evidence({ id: "ev_2", trust: "weak-inference", claim: "Interested in distributed systems." })],
    });
    const claims = groundSentences(
      [sentence({ text: "Interested in distributed systems.", role: "evidence", evidenceId: "ev_2" })],
      cand,
    );
    expect(claims[0].support).toBe("unsupported");
  });

  it("REUSES verifyClaims: citing a self-reported invented-metric claim with no public proof is unsupported", () => {
    const cand = candidate({
      evidence: [
        evidence({
          id: "ev_3",
          claim: "Improved query latency by 90%.",
          trust: "user-provided",
          publicProof: false,
        }),
      ],
    });
    const claims = groundSentences(
      [sentence({ text: "Improved query latency by 90%.", role: "evidence", evidenceId: "ev_3" })],
      cand,
    );
    expect(claims[0].support).toBe("unsupported");
  });

  it("STRICTER THAN verifyClaims: a sentence adds numeric precision the cited (public-proof) evidence does not contain, unsupported", () => {
    // verifyClaims alone would not flag this evidence (publicProof: true means
    // hasInventedMetric's `!ev.publicProof` guard never fires), this is the
    // module's OWN, stricter addition on top of the reused pass.
    const cand = candidate({
      evidence: [evidence({ id: "ev_4", claim: "Built a caching layer for the checkout service.", publicProof: true })],
    });
    const claims = groundSentences(
      [
        sentence({
          text: "I built a caching layer for the checkout service, cutting latency by 40%.",
          role: "evidence",
          evidenceId: "ev_4",
        }),
      ],
      cand,
    );
    expect(claims[0].support).toBe("unsupported");
  });

  it("a metric that already appears verbatim in the cited claim is NOT treated as added precision", () => {
    const cand = candidate({
      evidence: [evidence({ id: "ev_5", claim: "Reduced build time by 40% per internal benchmark.", publicProof: true })],
    });
    const claims = groundSentences(
      [
        sentence({
          text: "I reduced build time by 40%.",
          role: "evidence",
          evidenceId: "ev_5",
        }),
      ],
      cand,
    );
    expect(claims[0]).toEqual({
      text: "I reduced build time by 40%.",
      support: "evidenced",
      evidenceId: "ev_5",
    });
  });
});

describe("groundSentences, role demotion (mislabelled sentences cannot slip through)", () => {
  it("a 'profile' sentence that actually restates a stored profile value is user-provided", () => {
    const claims = groundSentences(
      [sentence({ text: "I'm based in Austin, TX.", role: "profile" })],
      candidate(),
    );
    expect(claims[0]).toEqual({ text: "I'm based in Austin, TX.", support: "user-provided" });
  });

  it("a 'profile' sentence that does NOT restate a profile value is demoted to evidence and, uncited, is unsupported", () => {
    // Deliberately free of any first-person experience verb or metric, so
    // this isolates the THIRD demotion branch (profile mismatch alone),
    // not the ASSERTS_EXPERIENCE / hasMetric branches exercised elsewhere.
    const claims = groundSentences(
      [sentence({ text: "I studied at Cambridge.", role: "profile" })],
      candidate(), // candidate's real university is "UT Austin", not Cambridge
    );
    // The role label said "profile"; the content restates nothing the
    // candidate's stored profile actually contains, and demotion is a
    // ONE-WAY street, it must not be trusted merely because the generator
    // called it a profile fact.
    expect(claims[0].support).toBe("unsupported");
  });

  it("confirms the profile-mismatch branch specifically: the same sentence WOULD be user-provided if it matched the real profile", () => {
    const claims = groundSentences(
      [sentence({ text: "I studied at UT Austin.", role: "profile" })],
      candidate(),
    );
    expect(claims[0]).toEqual({ text: "I studied at UT Austin.", support: "user-provided" });
  });

  it("an 'intent' sentence asserting no candidate background stays user-provided", () => {
    const claims = groundSentences(
      [sentence({ text: "I'm excited about the team's work on distributed storage.", role: "intent" })],
      candidate(),
    );
    expect(claims[0]).toEqual({
      text: "I'm excited about the team's work on distributed storage.",
      support: "user-provided",
    });
  });

  it("an 'intent' sentence that actually asserts first-person experience is demoted to evidence", () => {
    const claims = groundSentences(
      [sentence({ text: "I led three major launches at my last internship.", role: "intent" })],
      candidate(),
    );
    // No evidenceId was ever attached, because the generator thought this was
    // safe "intent" prose, demotion is exactly what catches that.
    expect(claims[0].support).toBe("unsupported");
  });

  it("an 'intent' sentence carrying a bare metric is demoted to evidence and unsupported", () => {
    const claims = groundSentences(
      [sentence({ text: "That kind of impact, a 25% lift, is what excites me.", role: "intent" })],
      candidate(),
    );
    expect(claims[0].support).toBe("unsupported");
  });

  it("demotion can only tighten: a genuine 'evidence' role sentence is never loosened by the demotion checks", () => {
    const cand = candidate();
    const claims = groundSentences(
      [sentence({ text: "Austin is a great tech hub.", role: "evidence" })], // no metric, no first-person assertion, no citation
      cand,
    );
    expect(claims[0].support).toBe("unsupported"); // still evidence-strict: uncited → unsupported
  });
});

describe("groundSentences, ordering, multiplicity, and independence from doc order", () => {
  it("returns exactly one PackageClaim per input sentence, in the same order", () => {
    const cand = candidate();
    const sentences = [
      sentence({ text: "A.", role: "intent" }),
      sentence({ text: "B.", role: "evidence", evidenceId: "ev_1" }),
      sentence({ text: "C.", role: "profile" }),
    ];
    const claims = groundSentences(sentences, cand);
    expect(claims.map((c) => c.text)).toEqual(["A.", "B.", "C."]);
    expect(claims).toHaveLength(3);
  });

  it("the same evidence id cited by two different sentences grades each independently", () => {
    const cand = candidate();
    const claims = groundSentences(
      [
        sentence({ text: "I built a CPU cache simulator in C.", role: "evidence", evidenceId: "ev_1" }),
        sentence({ text: "I built a CPU cache simulator in C, boosting throughput by 500%.", role: "evidence", evidenceId: "ev_1" }),
      ],
      cand,
    );
    expect(claims[0].support).toBe("evidenced");
    expect(claims[1].support).toBe("unsupported"); // added precision not in the cited claim
  });
});

describe("profileValues", () => {
  it("includes the candidate's identifying fields and target roles", () => {
    const values = profileValues(candidate());
    expect(values).toContain("Jordan Rivera");
    expect(values).toContain("Austin, TX");
    expect(values).toContain("UT Austin");
    expect(values).toContain("Systems Software Engineer");
    expect(values).toContain("2026");
  });

  it("drops values shorter than 3 characters so short/empty fields cannot false-match everything", () => {
    const cand = candidate({ degree: "MS", location: "" });
    const values = profileValues(cand);
    expect(values).not.toContain("MS");
    expect(values).not.toContain("");
  });
});

describe("countUnsupported", () => {
  it("counts only unsupported claims", () => {
    const claims = groundSentences(
      [
        sentence({ text: "I built a CPU cache simulator in C.", role: "evidence", evidenceId: "ev_1" }),
        sentence({ text: "I led a total department overhaul.", role: "evidence" }),
        sentence({ text: "I'm based in Austin, TX.", role: "profile" }),
      ],
      candidate(),
    );
    expect(countUnsupported(claims)).toBe(1);
  });

  it("is zero for an empty claim list", () => {
    expect(countUnsupported([])).toBe(0);
  });
});
