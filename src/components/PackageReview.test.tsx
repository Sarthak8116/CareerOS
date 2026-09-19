import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  ApplicationPackage,
  PackageClaim,
  PackageDocument,
} from "@/lib/types";
import { PackageReview } from "@/components/PackageReview";
import {
  claimsStillMade,
  removeSentence,
  splitUnits,
} from "@/components/PackageDocumentCard";

/**
 * The four ways this surface could lie, each with a test that catches it:
 *
 *  1. Offering the .zip while a sentence is still unsupported — shipping an
 *     invented job, metric or enthusiasm about a real person.
 *  2. Saying "complete" over a package that names gaps.
 *  3. Rendering a library answer as though it were drafted for this posting.
 *  4. Styling `excludedSections` (a deliberate omission) as a problem with the
 *     user's application.
 *
 * These are interaction tests, not static markup: the accept/own/remove/edit
 * flows are exactly the part that a render-only assertion cannot reach.
 * `Harness` supplies the state the real page owns, so an `onChange` actually
 * comes back as a re-render.
 */

function claim(overrides: Partial<PackageClaim> = {}): PackageClaim {
  return { text: "Shipped the billing service.", support: "evidenced", ...overrides };
}

function doc(overrides: Partial<PackageDocument> = {}): PackageDocument {
  return {
    kind: "cover-letter",
    fileName: "cover-letter.md",
    status: "drafted",
    content: "Shipped the billing service. I have always loved this company.",
    claims: [
      claim(),
      claim({ text: "I have always loved this company.", support: "unsupported" }),
    ],
    ...overrides,
  };
}

function pkg(overrides: Partial<ApplicationPackage> = {}): ApplicationPackage {
  return {
    campaignId: "camp-1",
    jobId: "job-1",
    builtAt: "2026-09-19T12:00:00.000Z",
    folderName: "acme-staff-engineer",
    documents: [doc()],
    completeness: "partial",
    missing: [],
    excludedSections: [],
    ...overrides,
  };
}

/** Holds the package the way the page does, so edits round-trip. */
function Harness({
  initial,
  onExport = () => {},
}: {
  initial: ApplicationPackage;
  onExport?: () => void;
}) {
  const [value, setValue] = useState(initial);
  return <PackageReview pkg={value} onChange={setValue} onExport={onExport} />;
}

const downloadButton = () =>
  screen.getByRole("button", { name: /download \.zip/i }) as HTMLButtonElement;

/* jest-dom is not a dependency here, so `disabled` is asserted directly. */
const expectDownloadDisabled = (yes: boolean) =>
  expect(downloadButton().disabled).toBe(yes);

/* ------------------------------------------------------------------ */
/* 1. Unsupported claims gate the export                               */
/* ------------------------------------------------------------------ */

describe("PackageReview — an unsupported claim blocks the download", () => {
  it("disables the download and says how many sentences are unbacked", () => {
    render(<Harness initial={pkg()} />);
    expectDownloadDisabled(true);
    expect(
      screen.getByText(/one sentence below isn't backed by your evidence/i),
    ).toBeTruthy();
  });

  it("counts every unsupported sentence across documents, not just the first", () => {
    render(
      <Harness
        initial={pkg({
          documents: [
            doc(),
            doc({
              kind: "short-answers",
              fileName: "short-answers.md",
              content: "I rebuilt the whole platform single-handedly.",
              claims: [
                claim({
                  text: "I rebuilt the whole platform single-handedly.",
                  support: "unsupported",
                }),
              ],
            }),
          ],
        })}
      />,
    );
    expect(
      screen.getByText(/2 sentences below aren't backed by your evidence/i),
    ).toBeTruthy();
    expectDownloadDisabled(true);
  });

  it("a 'not-requested' document cannot gate the export — it carries no text", () => {
    render(
      <Harness
        initial={pkg({
          documents: [
            doc({ claims: [claim()] }),
            doc({
              kind: "resume",
              fileName: "resume.md",
              status: "not-requested",
              content: "",
              claims: [claim({ text: "Stale.", support: "unsupported" })],
            }),
          ],
        })}
      />,
    );
    expectDownloadDisabled(false);
  });

  it("owning the claim resolves it and the download becomes available", () => {
    const onExport = vi.fn();
    render(<Harness initial={pkg()} onExport={onExport} />);
    expectDownloadDisabled(true);

    fireEvent.click(screen.getByRole("button", { name: /this is true/i }));

    expectDownloadDisabled(false);
    // Relabelled honestly — it is the user's claim now, not an evidenced one.
    expect(screen.getByText("You provided this")).toBeTruthy();
    expect(screen.queryByText("Unsupported")).toBeNull();

    fireEvent.click(downloadButton());
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("resolves ONE claim per click — there is no bulk attestation", () => {
    /* These sentences were drafted by a model, not written by the user, so
       attesting is a judgement about a specific sentence. A control that
       cleared several at once would turn several judgements into one unread
       click. This test exists so that an "accept all" cannot be added later
       without failing. */
    render(
      <Harness
        initial={pkg({
          documents: [
            doc({
              content: "A. B. C.",
              claims: [
                claim({ text: "A.", support: "unsupported" }),
                claim({ text: "B.", support: "unsupported" }),
                claim({ text: "C.", support: "unsupported" }),
              ],
            }),
          ],
        })}
      />,
    );

    // Each unsupported claim gets its own button, named for its own sentence.
    expect(screen.getAllByRole("button", { name: /this is true/i })).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: /this is true — it's mine: “B\.”/i }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /this is true — it's mine: “B\.”/i }),
    );

    // Exactly one resolved; the other two still stand and still block export.
    expect(screen.getAllByText("Unsupported")).toHaveLength(2);
    expect(screen.getAllByText("You provided this")).toHaveLength(1);
    expectDownloadDisabled(true);
  });

  it("refuses to cut a sentence out of the middle of a longer one, and says so", () => {
    /* tester's repro: one claim's text is a PREFIX of another's. Cutting the
       shorter one used to tear the opening words out of the longer SURVIVING
       sentence and silently drop its evidenced claim. Now it declines, keeps
       the export blocked, and tells the user to edit directly. */
    render(
      <Harness
        initial={pkg({
          documents: [
            doc({
              content:
                "I built the payments pipeline at my last internship. Other sentence stands alone.",
              claims: [
                claim({
                  text: "I built the payments pipeline",
                  support: "unsupported",
                }),
                claim({
                  text: "I built the payments pipeline at my last internship.",
                  support: "evidenced",
                  evidenceId: "ev_payments",
                }),
              ],
            }),
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /take it out/i }));

    expect(
      screen.getByText(/isn't a whole sentence in the document/i),
    ).toBeTruthy();
    // The longer, evidenced sentence is intact — not a headless fragment.
    expect(document.body.textContent).toContain(
      "I built the payments pipeline at my last internship.",
    );
    // Its evidenced claim survived; the unsupported one still blocks export.
    expect(screen.getByText("Evidenced")).toBeTruthy();
    expect(screen.getByText("Unsupported")).toBeTruthy();
    expectDownloadDisabled(true);
  });

  it("removing the claim takes the sentence out of the document too", () => {
    render(<Harness initial={pkg()} />);
    fireEvent.click(screen.getByRole("button", { name: /take it out/i }));

    expectDownloadDisabled(false);
    expect(screen.queryByText(/“I have always loved this company\.”/)).toBeNull();
    // The prose itself no longer contains it — not just the claim row.
    expect(document.body.textContent).not.toContain(
      "I have always loved this company.",
    );
    // The evidenced sentence it sat beside survives.
    expect(document.body.textContent).toContain("Shipped the billing service.");
  });
});

/* ------------------------------------------------------------------ */
/* 2. "Complete" is a claim                                            */
/* ------------------------------------------------------------------ */

describe("PackageReview — honest completeness", () => {
  it("names every gap from missing[] rather than summarising them", () => {
    render(
      <Harness
        initial={pkg({
          documents: [doc({ claims: [claim()] })],
          missing: [
            "A portfolio link — the form asks for one and we have none on file.",
            "Answer to: Why do you want to work here?",
          ],
        })}
      />,
    );
    expect(screen.getByText("Partial")).toBeTruthy();
    expect(
      screen.getByText(/2 things this application asks for are not in the package/i),
    ).toBeTruthy();
    expect(screen.getByText(/a portfolio link/i)).toBeTruthy();
    expect(screen.getByText(/why do you want to work here\?/i)).toBeTruthy();
  });

  it("does NOT read as complete when the data names gaps, whatever completeness says", () => {
    // The contradictory case: upstream said complete, missing[] disagrees.
    // Believing the reassuring half would be the dishonest choice.
    render(
      <Harness
        initial={pkg({
          documents: [doc({ claims: [claim()] })],
          completeness: "complete",
          missing: ["Answer to: Earliest start date"],
        })}
      />,
    );
    expect(screen.getByText("Partial")).toBeTruthy();
    expect(screen.queryByText("Complete")).toBeNull();
    expect(screen.getByText(/earliest start date/i)).toBeTruthy();
  });

  it("says complete only when completeness and missing[] agree", () => {
    render(
      <Harness
        initial={pkg({
          documents: [doc({ claims: [claim()] })],
          completeness: "complete",
          missing: [],
        })}
      />,
    );
    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.queryByText("Partial")).toBeNull();
  });

  it("a partial package is still downloadable once its claims are clean", () => {
    render(
      <Harness
        initial={pkg({
          documents: [doc({ claims: [claim()] })],
          missing: ["Answer to: Earliest start date"],
        })}
      />,
    );
    expectDownloadDisabled(false);
    expect(screen.getByText(/gaps above are still yours to fill/i)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* 3. Reused is not drafted                                            */
/* ------------------------------------------------------------------ */

describe("PackageReview — reused vs drafted", () => {
  it("says a library answer was not written for this posting", () => {
    render(
      <Harness
        initial={pkg({
          documents: [
            doc({
              kind: "short-answers",
              fileName: "short-answers.md",
              status: "reused",
              claims: [claim()],
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText("Reused from your library")).toBeTruthy();
    expect(
      screen.getByText(/was not written for this posting/i),
    ).toBeTruthy();
    expect(screen.queryByText("Drafted for this job")).toBeNull();
  });

  it("a drafted document never borrows the reused wording", () => {
    render(<Harness initial={pkg({ documents: [doc({ claims: [claim()] })] })} />);
    expect(screen.getByText("Drafted for this job")).toBeTruthy();
    expect(screen.queryByText(/not written for this posting/i)).toBeNull();
  });

  it("shows both side by side without collapsing them into one label", () => {
    render(
      <Harness
        initial={pkg({
          documents: [
            doc({ claims: [claim()] }),
            doc({
              kind: "short-answers",
              fileName: "short-answers.md",
              status: "reused",
              claims: [claim()],
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText("Drafted for this job")).toBeTruthy();
    expect(screen.getByText("Reused from your library")).toBeTruthy();
  });

  it("'needs-you' admits we produced nothing rather than implying we tried", () => {
    render(
      <Harness
        initial={pkg({
          documents: [
            doc({
              kind: "short-answers",
              fileName: "short-answers.md",
              status: "needs-you",
              content: "",
              claims: [],
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText("Needs you")).toBeTruthy();
    expect(screen.getByText(/we could not produce this/i)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* 4. excludedSections is a neutral fact                               */
/* ------------------------------------------------------------------ */

describe("PackageReview — excludedSections", () => {
  it("states the omission without warning vocabulary or gap framing", () => {
    render(
      <Harness
        initial={pkg({
          documents: [doc({ claims: [claim()] })],
          excludedSections: ["a voluntary EEO section"],
          missing: ["Answer to: Earliest start date"],
        })}
      />,
    );
    const excluded = screen.getByText(/doesn't read or pre-fill those questions/i);
    expect(excluded.textContent).toContain("a voluntary EEO section");

    // It lives in the neutral slate box, never in the amber gap list.
    const gapList = screen.getByRole("list", {
      name: /missing from this package/i,
    });
    expect(within(gapList).queryByText(/EEO/i)).toBeNull();
  });

  it("renders nothing about exclusions when there are none", () => {
    render(<Harness initial={pkg({ documents: [doc({ claims: [claim()] })] })} />);
    expect(screen.queryByText(/doesn't read or pre-fill/i)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Editing                                                             */
/* ------------------------------------------------------------------ */

describe("PackageReview — editing a document", () => {
  it("saves an edit and drops the claims that edit removed", () => {
    render(<Harness initial={pkg()} />);
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    const textarea = screen.getByLabelText(/cover letter content/i);
    fireEvent.change(textarea, {
      target: { value: "Shipped the billing service." },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    // The deleted sentence's claim is gone with it — the two cannot drift.
    expect(screen.queryByText("Unsupported")).toBeNull();
    expectDownloadDisabled(false);
    // The surviving claim keeps its label rather than being re-judged.
    expect(screen.getByText("Evidenced")).toBeTruthy();
  });

  it("tells the user their own writing was not checked against their evidence", () => {
    render(<Harness initial={pkg({ documents: [doc({ claims: [claim()] })] })} />);
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText(/cover letter content/i), {
      target: { value: "Shipped the billing service. And more besides." },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      screen.getByText(/hasn't checked it against your evidence/i),
    ).toBeTruthy();
  });

  it("cancelling leaves the document untouched", () => {
    render(<Harness initial={pkg({ documents: [doc({ claims: [claim()] })] })} />);
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText(/cover letter content/i), {
      target: { value: "Something else entirely." },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(document.body.textContent).toContain("Shipped the billing service.");
    expect(document.body.textContent).not.toContain("Something else entirely.");
  });

  it("a not-requested document offers no editor — there is nothing to edit", () => {
    render(
      <Harness
        initial={pkg({
          documents: [
            doc({
              kind: "resume",
              fileName: "resume.md",
              status: "not-requested",
              content: "",
              claims: [],
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText("Not requested")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* removeSentence                                                      */
/* ------------------------------------------------------------------ */

describe("removeSentence", () => {
  it("removes the sentence and tidies the seam without writing new prose", () => {
    const out = removeSentence(
      "One true thing. An invented thing. Another true thing.",
      "An invented thing.",
    );
    expect(out).toBe("One true thing. Another true thing.");
  });

  it("does not leave a blank paragraph where a removed line was", () => {
    const out = removeSentence("Dear team,\n\nInvented.\n\nRegards", "Invented.");
    expect(out).toBe("Dear team,\n\nRegards");
  });

  it("leaves content untouched when the sentence is not present", () => {
    expect(removeSentence("Only this.", "Not here.")).toBe("Only this.");
  });

  it("will not cut a claim out of the MIDDLE of a sentence, even where it ends one", () => {
    /* A boundary check alone is not enough: this claim starts at a word
       boundary and ends a sentence, yet cutting it would leave the dangling
       fragment "I led the team and". Only whole-unit removal is safe. */
    const content = "I led the team and I shipped the feature.";
    expect(removeSentence(content, "I shipped the feature.")).toBe(content);
  });

  it("removes only the standalone occurrence, leaving one embedded in a longer sentence intact", () => {
    const content =
      "I am excited about this role. Later in the letter: I am excited about this role.";
    const out = removeSentence(content, "I am excited about this role.");
    expect(out).toBe("Later in the letter: I am excited about this role.");
    /* The sentence is STILL asserted inside the surviving one, so the claim is
       still made and must stay flagged — blocking export — rather than being
       dropped because one copy of it went away. */
    expect(
      claimsStillMade(out, [
        { text: "I am excited about this role.", support: "unsupported" },
      ]),
    ).toHaveLength(1);
  });

  it("INVARIANT: after any removal, every surviving claim's text is still present verbatim", () => {
    /* The property that makes this class of corruption impossible. If a
       removal ever alters a sentence it did not target, some other claim's
       text stops matching and this fails. */
    const claims: PackageClaim[] = [
      { text: "I built the payments pipeline", support: "unsupported" },
      {
        text: "I built the payments pipeline at my last internship.",
        support: "evidenced",
        evidenceId: "ev_payments",
      },
      { text: "Other sentence stands alone.", support: "evidenced" },
    ];
    const content =
      "I built the payments pipeline at my last internship. Other sentence stands alone.";

    for (const target of claims) {
      const out = removeSentence(content, target.text);
      for (const survivor of claimsStillMade(out, claims)) {
        expect(out).toContain(survivor.text);
      }
    }
  });

  it("splitUnits reconstructs the input exactly — the property whole-unit removal rests on", () => {
    for (const content of [
      "One. Two! Three?",
      "Dear team,\n\nA sentence.\n\nRegards",
      "No terminator at all",
      "Trailing spaces.   And more.",
    ]) {
      expect(splitUnits(content).join("")).toBe(content);
    }
  });
});
