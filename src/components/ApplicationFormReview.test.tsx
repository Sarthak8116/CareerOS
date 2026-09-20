import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ApplicationForm, RequirementStatus } from "@/lib/types";
import { ApplicationFormReview } from "@/components/ApplicationFormReview";

/**
 * The invariants coder-ui flagged as the highest-risk part of this card:
 *
 *  1. "not-requested" (a FACT: we read the whole form and it doesn't ask) must
 *     never read like "unknown" (an ADMISSION: we couldn't read the form),
 *     collapsing the two is the worst bug available here, per the component's
 *     own header comment.
 *  2. A complete form that simply doesn't STATE whether a field is mandatory
 *     is a THIRD, distinct case from both of the above, "asked for, but the
 *     form doesn't say whether it's mandatory", and must render differently
 *     depending on `completeness`, not collapse into "unknown".
 *  3. `excludedSections` (a deliberate, disclosed omission) must render in the
 *     neutral box, never alongside `unknowns` (things we failed to read),
 *     conflating the two would make a deliberate privacy choice look like a
 *     parsing failure.
 *  4. `completeness: "none"` is a normal, successful outcome for the FORM
 *     specifically (the JOB still parsed), it gets its own honest header,
 *     not the request-rows a complete/partial form gets.
 *
 * Rendered via `react-dom/server` into a jsdom node, matching
 * ParsedJobReview.test.tsx: @testing-library/dom (RTL's required peer) is not
 * installed, so these are static-output assertions rather than interaction
 * tests, sufficient here since none of the above depends on user input.
 */

function form(overrides: Partial<ApplicationForm> = {}): ApplicationForm {
  return {
    jobId: "job-test",
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

function renderReview(f: ApplicationForm): string {
  const markup = renderToStaticMarkup(
    <ApplicationFormReview form={f} disabled={false} onChange={() => {}} />,
  );
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host.textContent ?? "";
}

/** Text of just the "Résumé" requirement row, the other rows (cover letter,
 *  portfolio) legitimately carry different statuses and must not pollute the
 *  assertion for this one. */
function resumeRowText(f: ApplicationForm): string {
  const markup = renderToStaticMarkup(
    <ApplicationFormReview form={f} disabled={false} onChange={() => {}} />,
  );
  const host = document.createElement("div");
  host.innerHTML = markup;
  const rows = Array.from(host.querySelectorAll("dl > div"));
  const row = rows.find((r) => r.textContent?.startsWith("Résumé"));
  return row?.textContent ?? "";
}

describe("ApplicationFormReview, not-requested vs unknown vs asked-but-unstated", () => {
  const cases: {
    status: RequirementStatus;
    completeness: ApplicationForm["completeness"];
    expectedText: string;
    forbiddenText: string[];
  }[] = [
    {
      status: "not-requested",
      completeness: "complete",
      expectedText: "Not requested",
      forbiddenText: ["Unknown", "doesn't say whether"],
    },
    {
      status: "unknown",
      completeness: "partial",
      expectedText: "Unknown, we couldn't read the form",
      forbiddenText: ["Not requested", "doesn't say whether"],
    },
    {
      // The form was fully enumerated but is silent on THIS field's
      // requiredness, a claim about the field, not about our ability to read.
      status: "unknown",
      completeness: "complete",
      expectedText: "Asked for, the form doesn't say whether it's mandatory",
      forbiddenText: ["Not requested", "we couldn't read the form"],
    },
    {
      status: "required",
      completeness: "complete",
      expectedText: "Required",
      forbiddenText: ["Unknown", "Not requested"],
    },
    {
      status: "optional",
      completeness: "complete",
      expectedText: "Optional",
      forbiddenText: ["Unknown", "Not requested"],
    },
  ];

  for (const { status, completeness, expectedText, forbiddenText } of cases) {
    it(`résumé status "${status}" at completeness "${completeness}" reads as "${expectedText}"`, () => {
      const rowText = resumeRowText(form({ resume: status, completeness }));
      expect(rowText).toContain(expectedText);
      for (const forbidden of forbiddenText) {
        expect(rowText).not.toContain(forbidden);
      }
    });
  }

  it("the SAME status string renders two different sentences depending only on completeness", () => {
    // This is the case most likely to get collapsed by accident: identical
    // `status: "unknown"`, different meaning entirely.
    const partial = renderReview(form({ resume: "unknown", completeness: "partial" }));
    const complete = renderReview(form({ resume: "unknown", completeness: "complete" }));
    expect(partial).toContain("Unknown, we couldn't read the form");
    expect(complete).toContain("Asked for, the form doesn't say whether it's mandatory");
    expect(partial).not.toContain("Asked for");
    expect(complete).not.toContain("we couldn't read the form");
  });
});

describe("ApplicationFormReview, excludedSections vs unknowns", () => {
  it("names an excluded section without treating it as something we failed to read", () => {
    const text = renderReview(
      form({ excludedSections: ["Equal employment opportunity questions"] }),
    );
    expect(text).toContain("Equal employment opportunity questions");
    expect(text).toContain("CareerOS doesn't read or pre-fill those questions");
    // It must not also appear tagged as an unknown/failure.
    expect(text).not.toContain("What we don't know");
  });

  it("excludedSections and unknowns can appear together without merging into one box", () => {
    const markup = renderToStaticMarkup(
      <ApplicationFormReview
        form={form({
          excludedSections: ["Equal employment opportunity questions"],
          unknowns: ["We could not confirm whether a writing sample is required."],
        })}
        disabled={false}
        onChange={() => {}}
      />,
    );
    const host = document.createElement("div");
    host.innerHTML = markup;

    // Two distinct blocks, not one conflated list.
    const excludedBlock = host.querySelector(".bg-slate-50");
    const unknownsBlock = host.querySelector(".bg-amber-50");
    expect(excludedBlock?.textContent).toContain("Equal employment opportunity");
    expect(excludedBlock?.textContent).not.toContain("writing sample");
    expect(unknownsBlock?.textContent).toContain("writing sample");
    expect(unknownsBlock?.textContent).not.toContain("Equal employment opportunity");
  });

  it("renders nothing extra when there are no excluded sections", () => {
    const text = renderReview(form({ excludedSections: [] }));
    expect(text).not.toContain("CareerOS doesn't read or pre-fill");
  });
});

describe("ApplicationFormReview, completeness: \"none\" is a successful, honest outcome, not an error state", () => {
  it("shows the honest 'could not read' header without implying the JOB itself failed", () => {
    const text = renderReview(
      form({
        completeness: "none",
        resume: "unknown",
        coverLetter: "unknown",
        portfolio: "unknown",
        unknowns: ["We could not read this posting's application questions."],
      }),
    );
    expect(text).toContain("We couldn't read the application form");
    expect(text).toContain("The job itself parsed fine");
  });

  it("does not render requirement rows at all when the form is unreadable, showing 'Unknown' three times would overstate what we know", () => {
    const markup = renderToStaticMarkup(
      <ApplicationFormReview
        form={form({ completeness: "none", resume: "unknown", coverLetter: "unknown", portfolio: "unknown" })}
        disabled={false}
        onChange={() => {}}
      />,
    );
    const host = document.createElement("div");
    host.innerHTML = markup;
    expect(host.querySelector("dl")).toBeNull();
  });

  it("still offers the paste-questions fallback for an unreadable FETCHED form", () => {
    const text = renderReview(
      form({ source: "fetched", completeness: "none", adapter: "lever" }),
    );
    expect(text).toContain("Paste the application questions");
  });

  it("does NOT offer paste-questions when the user already pasted (would just loop)", () => {
    const text = renderReview(form({ source: "pasted", completeness: "partial" }));
    expect(text).not.toContain("Paste the application questions");
  });
});
