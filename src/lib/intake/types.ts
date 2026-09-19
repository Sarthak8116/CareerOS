import type { ApplicationForm, Job } from "@/lib/types";

/**
 * Intake contract types.
 *
 * PURE module — no network, no clock, no `server-only`. Everything here is a
 * type or a tiny value so adapters, the route, and the UI can all import it.
 *
 * The structural rule this file exists to enforce: an adapter NEVER performs
 * I/O. It declares what it wants fetched (`plan`) and parses what comes back
 * (`parse`). All network access lives in `fetch.ts`. That is what makes every
 * adapter testable against a captured fixture with no live call.
 */

/* ------------------------------------------------------------------ */
/* Failure                                                             */
/* ------------------------------------------------------------------ */

/**
 * Why intake could not produce a Job. Coarse on purpose — the route maps each
 * to one user-safe sentence, exactly as `HarvestErrorKind` does.
 */
export type IntakeErrorKind =
  | "unsafe-url"
  | "unsupported-source"
  | "blocked"
  | "not-found"
  | "rate-limited"
  | "timeout"
  | "unreadable"
  | "upstream";

/**
 * An intake failure carrying a coarse `kind`. The message never contains a raw
 * upstream payload or anything about our infrastructure.
 */
export class IntakeError extends Error {
  readonly kind: IntakeErrorKind;

  constructor(kind: IntakeErrorKind, message: string) {
    super(message);
    this.name = "IntakeError";
    this.kind = kind;
  }
}

/**
 * Where a `Job` field's value came from. The UI flags every "defaulted" field
 * so a placeholder can never be mistaken for something the posting said.
 *
 *  - "stated"    copied from a real field in the response
 *  - "derived"   a deterministic transform of a stated field
 *  - "defaulted" we had NOTHING and used a documented sentinel
 */
export type FieldOrigin = "stated" | "derived" | "defaulted";

export type FieldOrigins = Partial<Record<keyof Job, FieldOrigin>>;

/* ------------------------------------------------------------------ */
/* Adapter interface                                                   */
/* ------------------------------------------------------------------ */

/** One thing an adapter wants fetched. `kind` routes it back in `parse`. */
export interface IntakeRequest {
  url: string;
  kind: "posting" | "form";
  method?: "GET" | "POST";
  body?: unknown;
}

/**
 * One fetched response, handed back to the adapter.
 *
 * Both `json` and `text` are optional and BOTH may be absent: a 404 that
 * returns plain text (Ashby does exactly this) has `text` but no `json`, and
 * `status` alone may be all an adapter gets. Never assume `json` is present.
 */
export interface IntakeResponse {
  kind: string;
  status: number;
  contentType?: string;
  json?: unknown;
  text?: string;
}

/** What an adapter produces. `job: undefined` means "could not parse". */
export interface AdapterOutput {
  job: Job | undefined;
  form: ApplicationForm;
  fieldOrigins: FieldOrigins;
  /** Plain sentences naming everything we defaulted or could not confirm. */
  assumptions: string[];
  /** Advisory sanitizer flags. */
  warnings: string[];
  /** Full sanitized description for the analyzer (Job.description is capped). */
  descriptionFull: string;
  /** Best-effort identifying scraps, used ONLY to prefill a failed intake. */
  partial?: IntakePartial;
}

/**
 * Unverified scraps pulled off a page we could not fully parse.
 *
 * These may NEVER reach a persisted `Job`. They exist to prefill an editable
 * review form the user must confirm first — that confirmation is what turns a
 * guess into a user-provided fact.
 */
export interface IntakePartial {
  url: string;
  applyUrl?: string;
  title?: string;
  company?: string;
}

export interface IntakeAdapter {
  /** Stable key; also becomes `Job.source`. */
  readonly key: string;
  /** Display name for the UI. */
  readonly label: string;
  /** Pure hostname/path test. No I/O. */
  matches(url: URL): boolean;
  /** Pure: what to fetch for this URL. */
  plan(url: URL): IntakeRequest[];
  /** Pure: turn responses into a Job + form. */
  parse(input: {
    responses: IntakeResponse[];
    url: string;
    fetchedAt: string;
  }): AdapterOutput;
}

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

/** What the UI offers the user when intake cannot finish the job itself. */
export type IntakeFallback = "paste-job" | "paste-questions";

/**
 * The single shape the route always returns.
 *
 * Partial success is `ok: true` with `form.completeness: "none"` — that is the
 * NORMAL Lever/Ashby/Workday path, not an error. `ok: false` means we have no
 * Job at all.
 */
export type IntakeResult =
  | {
      ok: true;
      job: Job;
      form: ApplicationForm;
      /** Uncapped sanitized description for the live analyzer. */
      descriptionFull: string;
      fieldOrigins: FieldOrigins;
      adapter: string;
      adapterLabel: string;
      fetchedAt: string;
      assumptions: string[];
      warnings: string[];
    }
  | {
      ok: false;
      reason: IntakeErrorKind;
      message: string;
      fallback: IntakeFallback;
      /** Prefill only. Unverified, and never persisted without confirmation. */
      partial?: IntakePartial;
    };

/* ------------------------------------------------------------------ */
/* User-safe messages                                                  */
/* ------------------------------------------------------------------ */

/**
 * The sentence shown when a posting cannot be read. Deliberately admits the
 * failure and hands the user a working alternative instead of guessing.
 */
export const PASTE_JOB_MESSAGE =
  "We couldn't read this posting — paste the details instead.";

/** Map a thrown value to a concise, user-safe message. Mirrors Harvest. */
export function intakeSafeMessage(err: unknown): string {
  if (err instanceof IntakeError) {
    switch (err.kind) {
      case "unsafe-url":
        return "That link doesn't look like a public job posting URL.";
      case "unsupported-source":
        return "We don't read that job board yet — paste the details instead.";
      case "blocked":
        return "That posting is behind a login, so we can't read it — paste the details instead.";
      case "not-found":
        return "That posting couldn't be found. It may have been closed or the link may be wrong.";
      case "rate-limited":
        return "That job board is rate limiting us — try again shortly.";
      case "timeout":
        return "That posting took too long to load — try again.";
      case "unreadable":
        return PASTE_JOB_MESSAGE;
      default:
        return "We couldn't reach that posting. Try again shortly.";
    }
  }
  return PASTE_JOB_MESSAGE;
}
