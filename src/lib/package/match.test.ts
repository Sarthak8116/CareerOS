import { describe, it, expect } from "vitest";
import { tokenize, normalizeForEquality, overlap, isSameTopic, MIN_SHARED_TOKENS } from "./match";

/**
 * `isSameTopic` decides whether a saved answer / evidence item may stand in
 * for a form question / job requirement. Per the module's own header, an
 * OVER-match is the expensive failure — it presents a stored answer as if it
 * belonged to a question nobody asked — so these tests lean on cases that
 * ought to miss, not just ones that ought to hit.
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

  // FINDING (flagged to coder-package, not softened): the `coverageOfQuery
  // >= 0.7` branch has no ceiling on how much EXTRA topical content the
  // target may carry, so a short query is matched against a much longer
  // compound question as long as the query's own tokens are all present.
  // Concretely, "Why do you want to work here?" (tokens: want/work/here)
  // matches a compound question that ALSO asks about greatest weakness and
  // handling failure, because coverageOfQuery is still 100% — even though
  // 5 of the target's 8 topical tokens are unrelated new content. That is
  // exactly the "over-match" shape this module's own header calls the
  // expensive failure: a saved "why us" answer would get reused for a
  // multi-part question it does not actually finish answering. Left as
  // it.todo (not deleted, not asserted as passing) until coder-package
  // decides whether branch 1 needs a coverageOfTarget floor — see the
  // message sent alongside this file.
  it.todo(
    "a superset target that adds substantial NEW topical content, not just a trailing company name, does not match — OPEN FINDING, see message to coder-package",
  );

  it("does not match empty strings against real content", () => {
    expect(isSameTopic("", "Why do you want to work here?")).toBe(false);
    expect(isSameTopic("Why do you want to work here?", "")).toBe(false);
  });
});
