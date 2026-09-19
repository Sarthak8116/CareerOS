import type {
  ApplicationForm,
  ApplicationQuestion,
  Job,
  JobRequirement,
  RequirementStatus,
} from "@/lib/types";
import { sanitizeUntrusted } from "@/lib/security/untrusted";
import { slugId } from "@/lib/utils";
import type { FieldOrigins } from "@/lib/intake/types";
import type { HeadingList } from "@/lib/intake/html";

/**
 * Pure mapping from validated raw board records into the app's own shapes.
 *
 * No network, no `Date.now()`, no `Math.random` — `fetchedAt` is always passed
 * in, so the same fixture always produces byte-identical output and every
 * adapter is testable offline.
 *
 * EVERY string that came off a job board is UNTRUSTED and passes through
 * `sanitizeUntrusted` here, at the edge. Downstream code treats these fields as
 * inert data.
 *
 * THE HONESTY RULES THIS FILE ENFORCES:
 *  - A field the posting did not state is never given a plausible value. It
 *    gets a documented sentinel, an origin of "defaulted", a plain-English
 *    assumption, and an entry in `Job.unstated`.
 *  - Requirements come only from lists under a RECOGNISED heading. We never
 *    judge a sentence to decide whether it is a requirement.
 *  - `sponsorship` moves off "unclear" only on an explicit employer statement.
 */

/** Sentinel for a required `Job` string the posting never stated. */
export const UNKNOWN_TEXT = "Unknown";

/** `Job.description` cap — matches `store.ts:jobFromPastedText`. */
export const JOB_DESCRIPTION_MAX = 4000;

/** Uncapped-ish description handed to the live analyzer. */
export const DESCRIPTION_FULL_MAX = 24_000;

/* ------------------------------------------------------------------ */
/* Sanitization                                                        */
/* ------------------------------------------------------------------ */

/**
 * A sanitizer that remembers every injection flag it saw.
 *
 * Adapters clean many strings per posting and every flag has to reach
 * `warnings`, so the collector accumulates rather than returning flags per
 * call. Flags are ADVISORY — they never change how text is handled (always as
 * data), only how loudly the UI cautions.
 */
export interface Cleaner {
  /** Sanitize, trim and cap. Returns `undefined` for empty/absent input. */
  clean(value: string | null | undefined, max?: number): string | undefined;
  /** Every distinct flag raised so far. */
  flags(): string[];
}

export function createCleaner(): Cleaner {
  const seen = new Set<string>();
  return {
    clean(value, max = 280) {
      if (!value) return undefined;
      const { clean: safe, flags } = sanitizeUntrusted(value);
      for (const flag of flags) seen.add(flag);
      const trimmed = safe.trim();
      if (!trimmed) return undefined;
      return trimmed.length > max
        ? `${trimmed.slice(0, max - 1).trimEnd()}…`
        : trimmed;
    },
    flags() {
      return [...seen];
    },
  };
}

/* ------------------------------------------------------------------ */
/* Title                                                               */
/* ------------------------------------------------------------------ */

/** Trailing requisition ids: "- JR2024421", "(1234567)", "- 84521". */
const TRAILING_REQ_ID = /\s*[-–—(]\s*(?:jr|req|r)?[\d][\w-]{2,}\s*\)?\s*$/i;

/** Trailing workplace tags: "(Remote)", "(Hybrid - US)". */
const TRAILING_WORKPLACE = /\s*\((?:remote|hybrid|on-?site)[^)]*\)\s*$/i;

/**
 * A stable, display-ready form of the title.
 *
 * Trimming is not cosmetic: real Ashby data ships " Security Engineer, Cloud"
 * with a leading space. We strip requisition ids and trailing workplace tags
 * because they are metadata rather than the role name, but we NEVER rewrite the
 * role into a canonical family — inventing "Software Engineer II" from
 * "Principal Block and File Storage Software Engineer" would be a claim the
 * posting never made.
 */
export function normalizeTitle(title: string): string {
  let out = title.replace(/\s+/g, " ").trim();
  out = out.replace(TRAILING_WORKPLACE, "").trim();
  out = out.replace(TRAILING_REQ_ID, "").trim();
  // Never return an empty string from a non-empty title.
  return out || title.trim();
}

/** Leading seniority tokens. Order matters — longest/most specific first. */
const SENIORITY_TOKENS: { pattern: RegExp; label: string }[] = [
  { pattern: /^(?:senior\s+)?principal\b/i, label: "Principal" },
  { pattern: /^distinguished\b/i, label: "Distinguished" },
  { pattern: /^(?:sr\.?|senior)\b/i, label: "Senior" },
  { pattern: /^staff\b/i, label: "Staff" },
  { pattern: /^(?:jr\.?|junior)\b/i, label: "Junior" },
  { pattern: /^(?:intern|internship)\b/i, label: "Intern" },
  { pattern: /^(?:lead|leading)\b/i, label: "Lead" },
  { pattern: /^director\b/i, label: "Director" },
  { pattern: /^(?:vp|vice\s+president)\b/i, label: "VP" },
  { pattern: /^head\s+of\b/i, label: "Head of" },
];

/**
 * Seniority from an EXPLICIT leading title token only.
 *
 * Returns `undefined` when the title carries no token. We do not infer
 * seniority from years-of-experience prose — "5+ years" is a requirement, not
 * a level, and mapping one to the other would be a guess.
 */
export function seniorityFromTitle(title: string): string | undefined {
  const trimmed = title.trim();
  for (const { pattern, label } of SENIORITY_TOKENS) {
    if (pattern.test(trimmed)) return label;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Sponsorship                                                         */
/* ------------------------------------------------------------------ */

const SPONSORSHIP_DENIED =
  /\b(?:will not (?:be able to )?sponsor|cannot sponsor|unable to sponsor|no visa sponsorship|do(?:es)? not (?:offer|provide) (?:visa )?sponsorship|not able to sponsor|without (?:the need for )?sponsorship)\b/i;

const SPONSORSHIP_OFFERED =
  /\b(?:sponsorship (?:is )?available|we (?:do )?sponsor|will sponsor|visa sponsorship (?:is )?(?:available|offered|provided)|open to sponsor\w*)\b/i;

/**
 * Sponsorship, only when the employer says so outright.
 *
 * This is a claim about the employer and a hard blocker for a candidate who
 * needs a visa, so the bar stays high: silence means "unclear", never
 * "not-offered". Denial is checked first — a posting that says both usually
 * means "available for some roles, not this one".
 */
export function sponsorshipFromText(text: string): Job["sponsorship"] {
  if (SPONSORSHIP_DENIED.test(text)) return "not-offered";
  if (SPONSORSHIP_OFFERED.test(text)) return "offered";
  return "unclear";
}

/* ------------------------------------------------------------------ */
/* Requirements                                                        */
/* ------------------------------------------------------------------ */

const HEADING_KINDS: { kind: JobRequirement["kind"]; pattern: RegExp }[] = [
  // "Preferred" is tested FIRST: "Preferred Qualifications" matches both
  // patterns and the more specific reading is the correct one.
  {
    kind: "preferred",
    pattern: /preferred|nice to have|bonus|plus|desired|ideally/i,
  },
  {
    kind: "minimum",
    pattern:
      /requirement|qualification|skill|what you.{0,6}(?:bring|have)|must have|basic|you.{0,4}ll need/i,
  },
  {
    kind: "responsibility",
    pattern:
      /responsibilit|what you.{0,6}(?:do|ll do)|the role|day to day|day-to-day|within \d+ month|in this role/i,
  },
];

/**
 * Classify a list by its HEADING, never by reading the items.
 *
 * Returns `undefined` for an unrecognised heading, and the caller then emits
 * NOTHING for that list. Dropping a real requirement is recoverable — the user
 * sees the full description either way — whereas mislabelling a "Benefits"
 * bullet as a requirement would send the gap engine chasing a fiction.
 */
export function classifyHeading(
  heading: string,
): JobRequirement["kind"] | undefined {
  for (const { kind, pattern } of HEADING_KINDS) {
    if (pattern.test(heading)) return kind;
  }
  return undefined;
}

/**
 * Turn heading-anchored lists into requirements.
 *
 * `skillKey` is ALWAYS omitted — mapping text to a canonical skill is the
 * skills engine's job, and guessing it here would put an unearned claim into
 * the contract.
 */
export function extractRequirements(
  jobId: string,
  lists: HeadingList[],
  cleaner: Cleaner,
): JobRequirement[] {
  const out: JobRequirement[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    const kind = classifyHeading(list.heading);
    if (!kind) continue;
    for (const item of list.items) {
      const text = cleaner.clean(item, 400);
      if (!text) continue;
      const id = slugId("req", `${jobId}:${text}`);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, text, kind });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Job assembly                                                        */
/* ------------------------------------------------------------------ */

/**
 * What an adapter knows about a posting. Everything optional is genuinely
 * optional: absent means "the posting did not state it", and `buildJob`
 * converts that into a sentinel plus a recorded assumption.
 */
export interface JobDraft {
  source: string;
  url?: string;
  title?: string;
  company?: string;
  team?: string;
  location?: string;
  remote?: Job["remote"];
  employmentType?: Job["employmentType"];
  employmentTypeRaw?: string;
  seniority?: string;
  description: string;
  postedAt?: string;
  deadline?: string;
  sponsorship?: Job["sponsorship"];
  /** Readonly so callers may pass a frozen or `as const` list. */
  requirements: readonly JobRequirement[];
  /** Origins the adapter already established for fields it did read. */
  origins: FieldOrigins;
  /** Adapter-specific notes to merge into the final assumption list. */
  assumptions?: string[];
}

export interface BuiltJob {
  job: Job;
  fieldOrigins: FieldOrigins;
  assumptions: string[];
}

/**
 * Assemble a schema-valid `Job`, recording every place we had to fall back.
 *
 * Returns `undefined` when there is no title or no company: a posting we cannot
 * even name is not a Job. The caller then fails honestly and offers paste. A
 * FETCHED posting never receives the "Imported role" placeholder — that belongs
 * only to the paste path, where the user typed the words themselves.
 */
export function buildJob(draft: JobDraft): BuiltJob | undefined {
  const title = draft.title?.trim();
  const company = draft.company?.trim();
  if (!title || !company) return undefined;

  const origins: FieldOrigins = { ...draft.origins };
  const assumptions = [...(draft.assumptions ?? [])];
  const unstated: string[] = [];

  /** Record a field we could not read, with the sentence the UI will show. */
  const defaulted = (field: keyof Job, note: string) => {
    origins[field] = "defaulted";
    unstated.push(field);
    assumptions.push(note);
  };

  origins.title ??= "stated";
  origins.company ??= "stated";
  origins.description ??= "stated";

  const normalizedTitle = normalizeTitle(title);
  origins.normalizedTitle = "derived";

  let location = draft.location?.trim();
  if (!location) {
    location = UNKNOWN_TEXT;
    defaulted("location", "This posting does not state a location.");
  } else {
    origins.location ??= "stated";
  }

  const remote = draft.remote ?? "unknown";
  if (!draft.remote) {
    defaulted(
      "remote",
      "This posting does not state whether the role is remote, hybrid or on-site.",
    );
  } else {
    origins.remote ??= "stated";
  }

  let seniority = draft.seniority?.trim();
  if (!seniority) {
    seniority = UNKNOWN_TEXT;
    defaulted("seniority", "This posting's title does not state a seniority level.");
  } else {
    origins.seniority ??= "derived";
  }

  // `employmentType` is a three-member enum the engines switch on, so it always
  // holds a value. When the posting stated nothing we mark it defaulted; when
  // it stated something the enum cannot represent ("Part time"), the verbatim
  // wording survives in `employmentTypeRaw` and the fallback is still flagged.
  const employmentType = draft.employmentType ?? "full-time";
  if (!draft.employmentType) {
    defaulted(
      "employmentType",
      draft.employmentTypeRaw
        ? `This posting describes the employment type as "${draft.employmentTypeRaw}", which doesn't map to one of our categories — shown as full-time.`
        : "This posting does not state an employment type — shown as full-time.",
    );
  } else {
    origins.employmentType ??= "stated";
  }

  const sponsorship = draft.sponsorship ?? "unclear";
  origins.sponsorship = sponsorship === "unclear" ? "defaulted" : "derived";
  if (sponsorship === "unclear") {
    unstated.push("sponsorship");
    assumptions.push(
      "This posting does not state whether visa sponsorship is available.",
    );
  }

  if (!draft.postedAt) unstated.push("postedAt");
  if (draft.postedAt) origins.postedAt = "stated";
  if (draft.deadline) origins.deadline = "stated";

  const job: Job = {
    id: slugId("job", draft.url ?? `${company}:${title}`),
    source: draft.source,
    ...(draft.url ? { url: draft.url } : {}),
    title,
    normalizedTitle,
    company,
    ...(draft.team ? { team: draft.team } : {}),
    location,
    remote,
    employmentType,
    seniority,
    description: draft.description.slice(0, JOB_DESCRIPTION_MAX),
    ...(draft.postedAt ? { postedAt: draft.postedAt } : {}),
    ...(draft.deadline ? { deadline: draft.deadline } : {}),
    sponsorship,
    requirements: [...draft.requirements],
    ...(draft.employmentTypeRaw
      ? { employmentTypeRaw: draft.employmentTypeRaw }
      : {}),
    // Absent rather than `[]` when nothing was defaulted, so a fully-stated
    // posting is indistinguishable from a demo job to every existing consumer.
    ...(unstated.length > 0 ? { unstated } : {}),
  };

  return { job, fieldOrigins: origins, assumptions };
}

/* ------------------------------------------------------------------ */
/* Application form                                                    */
/* ------------------------------------------------------------------ */

/** The sentence shown when a board hides its application questions from us. */
export const FORM_UNREADABLE_NOTE =
  "We could not read this posting's application questions. Open the apply page and paste them, and CareerOS will use them.";

/**
 * A form for a board whose questions we genuinely cannot see.
 *
 * Every status is "unknown", never "not-requested": we did not read the form,
 * so we cannot say it does not ask for a cover letter. Conflating those two is
 * the single worst bug available in this module.
 */
export function unreadableForm(input: {
  jobId: string;
  adapter: string;
  applyUrl?: string;
  fetchedAt: string;
  warnings?: string[];
}): ApplicationForm {
  return {
    jobId: input.jobId,
    source: "none",
    adapter: input.adapter,
    ...(input.applyUrl ? { applyUrl: input.applyUrl } : {}),
    fetchedAt: input.fetchedAt,
    completeness: "none",
    resume: "unknown",
    coverLetter: "unknown",
    portfolio: "unknown",
    questions: [],
    excludedSections: [],
    unknowns: [FORM_UNREADABLE_NOTE],
    warnings: input.warnings ?? [],
    trust: "unknown",
  };
}

/** Status for a question we DID read: required vs optional. */
export function statusFromRequired(required: boolean | null | undefined): RequirementStatus {
  return required === true ? "required" : "optional";
}

/** Stable id for a question, so re-importing a posting is idempotent. */
export function questionId(jobId: string, prompt: string): string {
  return slugId("q", `${jobId}:${prompt}`);
}

/** Sort questions into a stable order without reordering the employer's form. */
export function dedupeQuestions(
  questions: ApplicationQuestion[],
): ApplicationQuestion[] {
  const seen = new Set<string>();
  const out: ApplicationQuestion[] = [];
  for (const q of questions) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}
