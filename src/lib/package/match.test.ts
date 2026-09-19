import { describe, it, expect } from "vitest";
import { tokenize, normalizeForEquality, overlap, isSameTopic, MIN_SHARED_TOKENS } from "./match";

/**
 * `isSameTopic` decides whether a saved answer / evidence item may stand in
 * for a form question / job requirement. Per the module's own header, an
 * OVER-match is the expensive failure — it presents a stored answer as if it
 * belonged to a question nobody asked — so these tests lean on cases that
 * ought to miss, not just ones that ought to hit.
 *
 * One documented exception: see "deliberate over-match (ruled acceptable,
 * not a bug)" below — a short query matching a longer, topically-broader
 * target is a RULED product decision, not an oversight, because the
 * resulting "reused" answer names the library question it came from rather
 * than silently claiming to be a clean match.
 */

describe("tokenize", () => {
  it("lowercases, strips punctuation, and drops short/stop words", () => {
    expect(tokenize("Why do YOU want to work here?")).toEqual(["want", "work", "here"]);
  });

  it("drops words shorter than 3 characters", () => {
    expect(tokenize("Is C++ a fit for you?")).not.toContain("is");
  });

  it("returns an empty array for empty or stopword-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("the and for")).toEqual([]);
  });
});

describe("normalizeForEquality", () => {
  it("treats punctuation and case differences as equal", () => {
    expect(normalizeForEquality("Why do you want to work here?")).toBe(
      normalizeForEquality("why do you want to work here"),
    );
  });
});

describe("overlap", () => {
  it("returns zero overlap when either side tokenizes to nothing", () => {
    expect(overlap("", "why do you want to work here")).toEqual({
      shared: 0,
      coverageOfQuery: 0,
      coverageOfTarget: 0,
    });
  });

  it("computes coverage relative to each side's own token count", () => {
    const result = overlap("Why do you want to work here", "You want to work here at Acme");
    expect(result.shared).toBeGreaterThan(0);
    expect(result.coverageOfQuery).toBeGreaterThan(0);
    expect(result.coverageOfTarget).toBeGreaterThan(0);
  });
});

describe("isSameTopic — matches", () => {
  it("matches on exact normalized equality regardless of punctuation/case", () => {
    expect(isSameTopic("Why do you want to work here?", "why do you want to work here")).toBe(true);
  });

  it("matches when the target is the query plus a trailing company name (the documented case)", () => {
    expect(
      isSameTopic("Why do you want to work here?", "Why do you want to work here at Acme Corp?"),
    ).toBe(true);
  });

  it("matches near-paraphrases with strong token overlap", () => {
    expect(
      isSameTopic(
        "Describe a time you resolved a conflict with a teammate",
        "Tell us about a time you resolved a conflict with a teammate",
      ),
    ).toBe(true);
  });
});

describe("isSameTopic — deliberate misses (over-matching is the expensive failure)", () => {
  it("does not match two short questions sharing only stopwords/one topical word", () => {
    expect(isSameTopic("Are you authorized to work?", "Do you want this job?")).toBe(false);
  });

  it("does not match unrelated questions about different topics", () => {
    expect(
      isSameTopic(
        "What is your expected salary?",
        "Describe your experience with distributed systems.",
      ),
    ).toBe(false);
  });

  it("does not match when shared tokens fall below MIN_SHARED_TOKENS even with high coverage of a very short query", () => {
    // A one-token query trivially has 100% coverage of itself once matched,
    // but a single shared token must never be enough on its own.
    expect(isSameTopic("Location?", "What location and salary do you expect?")).toBe(false);
    expect(MIN_SHARED_TOKENS).toBeGreaterThanOrEqual(2);
  });

  it("does not match empty strings against real content", () => {
    expect(isSameTopic("", "Why do you want to work here?")).toBe(false);
    expect(isSameTopic("Why do you want to work here?", "")).toBe(false);
  });
});

/**
 * RULED, PINNED (not a bug) — coder-package's decision, made deliberately
 * rather than reverse-engineered from a test case.
 *
 * `coverageOfQuery >= 0.7` has no ceiling on how much EXTRA content the
 * target carries, so a short current question CAN match a longer saved
 * library question that also covers other topics. coder-package chose not
 * to tighten this: the failure mode of matching is a user handed their OWN
 * saved answer, labelled "reused", with the library question it came from
 * printed alongside it (`matchAnswers` / `buildShortAnswers` — see
 * shortAnswers.test.ts) — visible over-answering, not a misleading claim.
 * The failure mode of NOT matching is a silent "needs-you" on the single
 * most common application question ("Why do you want to work here?"),
 * defeating the point of having an answer library at all. Between visible
 * over-answering and silent missing, this module chooses to over-answer
 * visibly. Flagged to 'main' as a product call, not a defect — asserted here
 * so a future edit that tightens branch 1 does so on purpose, with this test
 * as the thing it must consciously change, not by accident.
 */
describe("isSameTopic — deliberate over-match (ruled acceptable, not a bug)", () => {
  it("a short query DOES match a longer target that also covers substantial unrelated topics — by design", () => {
    expect(
      isSameTopic(
        "Why do you want to work here?",
        "Why do you want to work here, and separately, what is your greatest weakness and how do you handle failure?",
      ),
    ).toBe(true);
  });
});
