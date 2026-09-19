import type {
  ApplicationForm,
  ApplicationQuestion,
  RequirementStatus,
} from "@/lib/types";
import { createCleaner, questionId } from "@/lib/intake/map";

/**
 * The login-wall fallback: turn questions the user pasted into a form.
 *
 * PURE — no network, no clock (`fetchedAt` is passed in) — so the UI imports it
 * directly and no route is needed. This is the path for every board whose
 * application form we cannot read, which is all of them except Greenhouse.
 *
 * Pasted text is still UNTRUSTED: the user copied it off a web page, so it can
 * carry the same injection payloads as anything we fetch ourselves. Every
 * string here goes through the sanitizer.
 *
 * Detection stays deliberately dumb. We recognise a question by explicit
 * punctuation or an explicit required-marker, and we do NOT try to judge
 * whether a sentence "sounds like" a question — a wrong guess would put words
 * in the employer's mouth. Anything we cannot classify is reported in
 * `unknowns` rather than silently dropped or silently invented.
 */

/** Explicit "this field is mandatory" markers that real forms use. */
const REQUIRED_MARKER = /\*\s*$|\(\s*required\s*\)|\brequired\b\s*$/i;

/** Lines that are section headings rather than questions. */
const HEADING_LIKE = /^[A-Z][A-Za-z ]{0,40}:$/;

const RESUME = /\bresum[eé]\b|\bcv\b/i;
const COVER_LETTER = /\bcover letter\b/i;
const PORTFOLIO = /\bportfolio\b|\bpersonal website\b|\bwebsite\b/i;

export interface PastedFormInput {
  jobId: string;
  text: string;
  fetchedAt: string;
  applyUrl?: string;
  /** The board this came from, when known — recorded, never guessed. */
  adapter?: string;
}

/**
 * Is this line a question?
 *
 * Three explicit signals only: it ends in "?", it carries a required marker, or
 * it ends in ":" (the "Question:" form real application pages use). Prose lines
 * are left alone.
 */
function looksLikeQuestion(line: string): boolean {
  if (line.endsWith("?")) return true;
  if (REQUIRED_MARKER.test(line)) return true;
  if (line.endsWith(":") && !HEADING_LIKE.test(line)) return true;
  return false;
}

/**
 * Build an ApplicationForm from pasted text.
 *
 * `completeness` is ALWAYS "partial", never "complete": we only know what the
 * user happened to paste, so absence of a field here is never evidence that the
 * employer does not ask for it. That distinction is what keeps
 * "not-requested" honest everywhere else in the app.
 */
export function formFromPastedQuestions(input: PastedFormInput): ApplicationForm {
  const cleaner = createCleaner();
  const clean = cleaner.clean;

  const lines = input.text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const questions: ApplicationQuestion[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (!looksLikeQuestion(line)) continue;
    const required = REQUIRED_MARKER.test(line);
    // Strip the marker so the prompt reads as the employer wrote it.
    const stripped = line.replace(/\*\s*$/, "").replace(/\(\s*required\s*\)/i, "").trim();
    const prompt = clean(stripped, 500);
    if (!prompt) continue;

    const id = questionId(input.jobId, prompt);
    if (seen.has(id)) continue;
    seen.add(id);

    questions.push({
      id,
      prompt,
      // We saw the wording, not the widget. "unknown" renders as a textarea.
      kind: "unknown",
      // Never classified beyond what the words explicitly say.
      category: "other",
      // Set ONLY when the paste carried an explicit marker. Absent means we do
      // not know — it must never be defaulted to false.
      ...(required ? { required: true } : {}),
      trust: "user-provided",
    });
  }

  const unknowns: string[] = [];
  const all = lines.join("\n");

  /** Status for an attachment the paste mentions but may not mark required. */
  const attachment = (pattern: RegExp, label: string): RequirementStatus => {
    const line = lines.find((l) => pattern.test(l));
    if (!line) return "unknown";
    if (REQUIRED_MARKER.test(line)) return "required";
    unknowns.push(
      `This form asks for a ${label}, but the text you pasted doesn't say whether it's required.`,
    );
    return "required";
  };

  const resume = attachment(RESUME, "resume");
  const coverLetter = attachment(COVER_LETTER, "cover letter");
  const portfolio = attachment(PORTFOLIO, "portfolio or website");

  if (questions.length === 0 && all.length > 0) {
    unknowns.push(
      "We couldn't pick out any questions from that text. Paste the questions one per line, and mark required ones with *.",
    );
  }
  unknowns.push(
    "This is only the part of the form you pasted — the employer may ask for more.",
  );

  return {
    jobId: input.jobId,
    source: "pasted",
    adapter: input.adapter ?? "paste",
    ...(input.applyUrl ? { applyUrl: input.applyUrl } : {}),
    fetchedAt: input.fetchedAt,
    // Never "complete" — see the note above.
    completeness: "partial",
    resume,
    coverLetter,
    portfolio,
    questions,
    // The user pastes what they choose to; we exclude nothing ourselves.
    excludedSections: [],
    unknowns,
    warnings: cleaner.flags(),
    trust: "user-provided",
  };
}
