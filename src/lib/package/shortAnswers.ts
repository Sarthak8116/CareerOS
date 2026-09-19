import type {
  ApplicationAnswer,
  ApplicationForm,
  ApplicationQuestion,
  PackageClaim,
  PackageDocumentStatus,
} from "@/lib/types";
import { isSameTopic } from "@/lib/package/match";
import {
  DOCUMENT_AUTOFILL_KEYS,
  PERSONAL_AUTOFILL_KEYS,
} from "@/lib/package/personalInfo";

/**
 * Short answers — the form's own questions, paired with the answer library.
 *
 * THE DISTINCTION THIS FILE EXISTS TO PROTECT: an answer pulled from the
 * library is "reused". One written for this posting is "drafted". Collapsing
 * them would tell the user CareerOS wrote something for this job when it
 * pulled it from a drawer. Nothing here drafts, so nothing here is ever
 * labelled "drafted" — every answer is either reused verbatim, with the
 * library question it came from named in the file, or it is left for the user
 * with the question quoted and an explicit "you must write this".
 *
 * Pure: no I/O, no Date, no randomness. The answer library is passed IN
 * (`lib/answers.ts` is a client module backed by localStorage), so this stays
 * testable and the engine never reaches for browser storage.
 */

export interface AnsweredQuestion {
  question: ApplicationQuestion;
  /** The library answer used, when one matched this question. */
  source?: ApplicationAnswer;
}

/**
 * Pair each question with a saved answer, or with nothing.
 *
 * The first library entry that reads as the same question wins; library order
 * is the user's own, so this is stable and explicable. A near-miss is NOT a
 * match — an unanswered question costs the user a note, whereas a wrong
 * "reused" answer costs them the application.
 */
export function matchAnswers(
  questions: ApplicationQuestion[],
  library: ApplicationAnswer[],
): AnsweredQuestion[] {
  return questions.map((question) => {
    const source = library.find((entry) =>
      isSameTopic(question.prompt, entry.question),
    );
    return source ? { question, source } : { question };
  });
}

/**
 * Questions this document is responsible for.
 *
 * Personal-details questions go to the personal-info sheet and resume /
 * cover-letter uploads to their own documents, so they are not counted here
 * twice — a question must appear in exactly one document or the package's
 * `missing` list would double-count it.
 */
export function shortAnswerQuestions(
  form: ApplicationForm | undefined,
): ApplicationQuestion[] {
  return (form?.questions ?? []).filter((q) => {
    if (!q.autofillKey) return true;
    return (
      !PERSONAL_AUTOFILL_KEYS.has(q.autofillKey) &&
      !DOCUMENT_AUTOFILL_KEYS.has(q.autofillKey)
    );
  });
}

function requirementLabel(question: ApplicationQuestion): string {
  if (question.required === true) return "Required";
  if (question.required === false) return "Optional";
  // ABSENT means we did not read whether it is required — not that it is not.
  return "CareerOS could not read whether this is required";
}

export interface ShortAnswersDocument {
  status: PackageDocumentStatus;
  content: string;
  claims: PackageClaim[];
  missing: string[];
  answered: AnsweredQuestion[];
}

export function buildShortAnswers(input: {
  form?: ApplicationForm;
  library: ApplicationAnswer[];
  jobTitle: string;
  company: string;
}): ShortAnswersDocument {
  const questions = shortAnswerQuestions(input.form);
  const answered = matchAnswers(questions, input.library);

  // No questions at all. Whether that is a fact or an absence of knowledge
  // depends entirely on how much of the form we actually read.
  if (questions.length === 0) {
    if (input.form?.completeness === "complete") {
      return {
        status: "not-requested",
        content: "",
        claims: [],
        missing: [],
        answered,
      };
    }
    return {
      status: "needs-you",
      content:
        `# Short answers — ${input.jobTitle} at ${input.company}\n\n` +
        "CareerOS could not read this application's questions, so none are " +
        "listed here. Open the employer's form and answer whatever it asks — " +
        "saving those answers to your answer library will let CareerOS reuse " +
        "them next time.\n",
      claims: [],
      missing: [
        "This application's questions — CareerOS could not read the form, so none were answered.",
      ],
      answered,
    };
  }

  const sections = answered.map(({ question, source }) => {
    const header = `## ${question.prompt}`;
    if (source) {
      return [
        header,
        `*${requirementLabel(question)} · reused from your answer library (saved as: "${source.question}")*`,
        "",
        source.answer,
      ].join("\n");
    }
    return [
      header,
      `*${requirementLabel(question)} · YOU MUST WRITE THIS — no saved answer matched.*`,
      "",
      "> (your answer)",
    ].join("\n");
  });

  const unanswered = answered.filter((a) => !a.source);

  return {
    status: unanswered.length > 0 ? "needs-you" : "reused",
    content:
      `# Short answers — ${input.jobTitle} at ${input.company}\n\n` +
      "Answers marked as reused came from your answer library exactly as you " +
      "saved them. CareerOS did not rewrite them for this posting — read each " +
      "one against this job before you paste it.\n\n" +
      `${sections.join("\n\n")}\n`,
    // The user wrote every one of these. They are theirs, not ours, and no
    // evidence row backs them — "user-provided" is the only honest label.
    claims: answered
      .filter((a): a is Required<AnsweredQuestion> => Boolean(a.source))
      .map((a) => ({
        text: a.source.answer,
        support: "user-provided" as const,
      })),
    missing: unanswered.map(
      ({ question }) =>
        `An answer to "${question.prompt}" — no saved answer matched, so you must write it.`,
    ),
    answered,
  };
}
