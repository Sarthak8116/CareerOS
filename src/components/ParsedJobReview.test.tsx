import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Job } from "@/lib/types";
import { ParsedJobReview } from "@/components/ParsedJobReview";

/**
 * The invariant these tests protect: EVERY field in `job.unstated` reaches the
 * user somehow, through its own editable input, or through the catch-all line
 * for fields this card has no input for.
 *
 * The catch-all branch is deliberately expected to be empty in normal operation
 * (every placeholder-bearing field currently has an input), which is exactly
 * why it needs a test: defensive code with no test reads as dead code and gets
 * deleted. If `unstated` ever grows a field nobody renders, the alternative to
 * this branch is the value vanishing silently, which is the failure this whole
 * design exists to prevent.
 */

/*
 * Rendered through `react-dom/server` into a jsdom node rather than through
 * @testing-library/react: the repo ships @testing-library/react but not its
 * required @testing-library/dom peer, so RTL cannot currently load. These are
 * static-output assertions, so nothing here needs RTL's interaction helpers,
 * going through a real DOM node also gets us entity decoding and text
 * extraction for free.
 */

/** A minimally valid parsed Job. Overrides supply whatever the test is about. */
function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-test",
    source: "greenhouse",
    title: "Backend Engineer",
    normalizedTitle: "Backend Engineer",
    company: "Acme",
    location: "Unknown",
    remote: "unknown",
    employmentType: "full-time",
    seniority: "Unknown",
    description: "We are hiring.",
    sponsorship: "unclear",
    requirements: [],
    ...overrides,
  };
}

/** Render the card and return the text a user would actually read. */
function renderReview(j: Job): string {
  const markup = renderToStaticMarkup(
    <ParsedJobReview
      job={j}
      descriptionFull={j.description}
      assumptions={[]}
      warnings={[]}
      adapterLabel="Greenhouse"
      fetchedAt="2026-09-19T12:00:00.000Z"
      disabled={false}
      onChange={() => {}}
    />,
  );
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host.textContent ?? "";
}

describe("ParsedJobReview, every unstated field reaches the user", () => {
  it("surfaces a field that has no input of its own, via the catch-all", () => {
    // `description` has no editable input on this card. Without the catch-all
    // branch it would land in `unstated` and be shown nowhere at all.
    const text = renderReview(job({ unstated: ["description"] }));

    expect(text).toContain(
      "Not stated in the posting: Job description",
    );
  });

  it("names every no-input field, not just the first", () => {
    const text = renderReview(
      job({ unstated: ["description", "requirements"] }),
    );

    expect(text).toContain("Job description");
    expect(text).toContain("Requirements");
  });

  it("marks a field that does have an input inline, without the catch-all", () => {
    const text = renderReview(job({ unstated: ["location"] }));

    // The inline badge on the Location field carries the message.
    expect(text).toContain("Not stated in the posting");
    // …and the catch-all box stays away, since nothing is unaccounted for.
    expect(text).not.toContain("What the posting didn't tell us");
  });

  it("says nothing about unstated fields when the posting stated everything", () => {
    const text = renderReview(job());

    expect(text).not.toContain("Not stated in the posting");
    expect(text).not.toContain("What the posting didn't tell us");
  });
});

describe("ParsedJobReview, silent posting vs. unrepresentable value", () => {
  it("(a) reads as 'not stated' when the posting said nothing", () => {
    const text = renderReview(job({ unstated: ["employmentType"] }));

    expect(text).toContain("Not stated in the posting");
    expect(text).not.toContain("doesn't map to our categories");
  });

  it("(b) quotes the posting when it spoke but we couldn't file it", () => {
    const text = renderReview(
      job({
        unstated: ["employmentType"],
        employmentTypeRaw: "Regular Full Time (Salary)",
      }),
    );

    expect(text).toContain("Regular Full Time (Salary)");
    expect(text).toContain("doesn't map to our categories");
    // Claiming nothing was stated about something plainly stated is the exact
    // lie `employmentTypeRaw` exists to prevent.
    expect(text).not.toContain("Not stated in the posting");
  });

  it("keeps the posting's own wording on screen once the value is confirmed", () => {
    // Not in `unstated`: the user has set it, but the raw string is still a
    // true fact about the posting, so it stays as a plain note.
    const text = renderReview(
      job({ employmentTypeRaw: "Regular Full Time (Salary)" }),
    );

    expect(text).toContain("Regular Full Time (Salary)");
    expect(text).not.toContain("doesn't map to our categories");
    expect(text).not.toContain("Not stated in the posting");
  });
});
