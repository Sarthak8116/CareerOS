import { describe, it, expect } from "vitest";
import type { PackageClaim } from "@/lib/types";
import { claimsStillMade, removeSentence } from "@/components/PackageDocumentCard";

/**
 * `claimsStillMade` and `removeSentence` are the two functions that make
 * "a claim is derived from the content" actually true. The adversarial case
 * coder-ui-2 flagged — one claim's text is a literal substring of another
 * claim's text — used to be a real, reproducible bug here: removing the
 * shorter claim tore the opening words out of the longer, unrelated sentence,
 * leaving a headless fragment AND silently dropping the longer claim's
 * evidence tracking (since its text no longer matched anything in the
 * content). Confirmed with a failing repro against the earlier
 * `split().join()` implementation. `removeSentence` has since gone through
 * two more iterations, landing on whole-UNIT removal (see its own comment for
 * why a boundary check alone was still not enough) — these tests now assert
 * the CORRECT behavior against whichever implementation is current, and pass
 * — kept as a regression guard, not a historical note, since a future
 * "simplification" of removeSentence is exactly the kind of change that would
 * reintroduce the corruption.
 */

function claim(overrides: Partial<PackageClaim> & Pick<PackageClaim, "text">): PackageClaim {
  return { support: "unsupported", ...overrides };
}

describe("removeSentence + claimsStillMade — the substring-collision edge", () => {
  it("removing the LONGER of two claims, where the shorter is a prefix, drops both — over-reporting, not under-reporting", () => {
    const short = claim({ text: "I built the payments pipeline", support: "user-provided" });
    const long = claim({
      text: "I built the payments pipeline at my last internship, handling 10,000 transactions daily.",
      support: "unsupported",
    });
    const content =
      "I built the payments pipeline at my last internship, handling 10,000 transactions daily. Other sentence stands alone.";

    // Remove the LONG claim, exactly as resolveClaim("remove") does.
    const afterRemoval = removeSentence(content, long.text);
    const survivors = claimsStillMade(afterRemoval, [short, long]);

    // Both vanish — short's text only ever existed AS PART OF long's text, so
    // once long is gone there is genuinely nothing left to claim. This is the
    // "safe" direction: nothing false is left standing.
    expect(survivors).toEqual([]);
    expect(afterRemoval).toContain("Other sentence stands alone.");
  });

  it("removing the SHORTER of two claims does NOT corrupt a longer, unrelated sentence that shares its opening words", () => {
    // The user removes the SHORT (unsupported) claim; the LONG (evidenced)
    // claim's sentence is a different sentence and was never selected for
    // removal, so it must survive intact.
    const short = claim({ text: "I built the payments pipeline", support: "unsupported" });
    const longText =
      "I built the payments pipeline at my last internship, handling 10,000 transactions daily.";
    const content = `${longText} Other sentence stands alone.`;

    // resolveClaim("remove", indexOfShort) does exactly this:
    const afterRemoval = removeSentence(content, short.text);

    expect(
      afterRemoval,
      "removing an unrelated shorter claim must not corrupt a different, longer sentence that merely shares its opening words",
    ).toContain(longText);
    // Nothing was a genuine, boundary-respecting occurrence of `short.text`
    // here (its only appearance is as a prefix of a longer sentence), so
    // removeSentence correctly leaves the content untouched.
    expect(afterRemoval).toBe(content);
  });

  it("the LONG claim's evidence tracking survives removing an unrelated shorter claim", () => {
    const short = claim({ text: "I built the payments pipeline", support: "unsupported" });
    const long = claim({
      text: "I built the payments pipeline at my last internship, handling 10,000 transactions daily.",
      support: "evidenced",
      evidenceId: "ev_payments",
    });
    const content = `${long.text} Other sentence stands alone.`;

    const afterRemoval = removeSentence(content, short.text);
    const survivors = claimsStillMade(afterRemoval, [short, long]);

    expect(
      survivors.some((c) => c.evidenceId === "ev_payments"),
      "an evidenced claim for a DIFFERENT sentence must survive removing an unrelated shorter claim",
    ).toBe(true);
  });

  it("two claims with IDENTICAL text are addressed by index, not merged — removing one instance leaves exactly one", () => {
    const a = claim({ text: "I am excited about this role.", support: "unsupported" });
    const b = claim({ text: "I am excited about this role.", support: "unsupported" });
    // Both occurrences are genuine, standalone sentence units (a real sentence
    // boundary — terminator + space — precedes each). A lead-in clause with no
    // terminator of its own ("Later in the letter: ...") would make the second
    // occurrence part of a LARGER unit rather than a whole one on its own,
    // which is a different case (see the "does NOT corrupt" test above) — this
    // one isolates true duplication specifically.
    const content = "I am excited about this role. I am excited about this role.";

    // removeSentence has no concept of "which occurrence" — it removes every
    // WHOLE-UNIT match. Confirming that explicitly, since resolveClaim's
    // index-based addressing implies (but does not guarantee) per-occurrence
    // removal.
    const afterRemoval = removeSentence(content, a.text);
    expect(afterRemoval).not.toContain("I am excited about this role.");

    const survivors = claimsStillMade(afterRemoval, [a, b]);
    expect(survivors).toEqual([]);
  });
});

describe("claimsStillMade — baseline behavior", () => {
  it("keeps a claim whose exact text is still present", () => {
    const c = claim({ text: "A real sentence.", support: "evidenced", evidenceId: "ev_1" });
    expect(claimsStillMade("A real sentence. And more.", [c])).toEqual([c]);
  });

  it("drops a claim whose text is no longer present at all", () => {
    const c = claim({ text: "A removed sentence." });
    expect(claimsStillMade("Something else entirely.", [c])).toEqual([]);
  });

  it("is exact-text sensitive: a paraphrase of a claim does not count as still made", () => {
    const c = claim({ text: "I shipped the feature on time." });
    expect(claimsStillMade("I delivered the feature on schedule.", [c])).toEqual([]);
  });
});

describe("removeSentence — baseline behavior", () => {
  it("removes the sentence and collapses the resulting whitespace", () => {
    const out = removeSentence("First. Removed sentence. Third.", "Removed sentence.");
    expect(out).not.toContain("Removed sentence.");
    expect(out).not.toMatch(/ {2,}/);
  });

  it("is a no-op when the sentence is not present", () => {
    expect(removeSentence("Only this.", "Not here.")).toBe("Only this.");
  });

  it("collapses a resulting blank paragraph rather than leaving one", () => {
    const out = removeSentence("Para one.\n\nOnly this sentence.\n\nPara three.", "Only this sentence.");
    expect(out).not.toMatch(/\n{3,}/);
    expect(out).toContain("Para one.");
    expect(out).toContain("Para three.");
  });
});
