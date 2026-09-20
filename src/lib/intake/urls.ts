/**
 * Job-posting URL parsing and adapter detection.
 *
 * PURE string/URL work, safe on both server and client (the intake page checks
 * a URL before posting it), exactly like `harvest/urls.ts`.
 *
 * Detection is by HOSTNAME + PATH SHAPE only. We never guess an ATS from page
 * content, and we never try a board's API on a URL whose shape doesn't match,
 * a wrong guess costs a failed call and risks attributing one company's posting
 * to another.
 */

/** Adapter keys, in the order they are tried. `generic` is always last. */
export type AdapterKey =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "generic";

/** Identifiers pulled out of a posting URL, when its shape yields them. */
export interface ParsedIntakeUrl {
  adapter: AdapterKey;
  /** Board / company / tenant slug, as the ATS spells it. */
  org?: string;
  /** Posting id within that org. */
  postingId?: string;
  /** Workday only: the career-site id that sits before `/job/`. */
  siteId?: string;
  /** Workday only: everything after `/job/`. */
  externalPath?: string;
  /** True when the URL must be resolved through a redirect before use. */
  shortlink?: boolean;
}

/** Hosts that redirect to a real posting URL and carry no ids themselves. */
const SHORTLINK_HOSTS = new Set(["grnh.se"]);

function host(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

/** Path split into non-empty segments, preserving case (ids are case-sensitive). */
function segments(url: URL): string[] {
  return url.pathname.split("/").filter((s) => s.length > 0);
}

/**
 * Is this URL even worth handing to the fetcher?
 *
 * A shape check only, it says nothing about whether the host is safe to
 * reach. `fetch.ts` owns that decision and re-checks everything; this exists so
 * the UI can disable a button without a round trip.
 */
export function isFetchableUrlShape(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  // Credentials in a URL are never legitimate here and are an SSRF smell.
  if (url.username || url.password) return false;
  return url.hostname.includes(".");
}

/** Parse a URL string, or `undefined` when it isn't a usable https URL. */
export function toUrl(raw: string): URL | undefined {
  if (!isFetchableUrlShape(raw)) return undefined;
  try {
    return new URL(raw.trim());
  } catch {
    return undefined;
  }
}

/**
 * Canonical posting URL: query string and fragment dropped, host lowercased,
 * trailing slash removed. Used as the stable identity for `Job.id`, so two
 * links to the same posting produce the same campaign.
 *
 * The PATH case is preserved, Lever and Ashby ids are case-sensitive UUIDs
 * and Workday external paths are mixed-case.
 */
export function canonicalPostingUrl(raw: string): string | undefined {
  const url = toUrl(raw);
  if (!url) return undefined;
  const path = url.pathname.replace(/\/+$/, "");
  return `https://${host(url)}${path}`;
}

/* ------------------------------------------------------------------ */
/* Per-ATS shape tests                                                 */
/* ------------------------------------------------------------------ */

/** `boards.greenhouse.io/{board}/jobs/{id}` (and the `job-boards` variant). */
function parseGreenhouse(url: URL): ParsedIntakeUrl | undefined {
  const h = host(url);
  if (SHORTLINK_HOSTS.has(h)) {
    return { adapter: "greenhouse", shortlink: true };
  }
  if (!/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(h)) return undefined;
  const parts = segments(url);
  // [board, "jobs", id], also tolerate an "embed" prefix Greenhouse still serves.
  const jobsAt = parts.indexOf("jobs");
  if (jobsAt < 1) return undefined;
  const org = parts[jobsAt - 1];
  const postingId = parts[jobsAt + 1];
  if (!org || !postingId || !/^\d+$/.test(postingId)) return undefined;
  return { adapter: "greenhouse", org, postingId };
}

/** `jobs.lever.co/{company}/{postingId}`. */
function parseLever(url: URL): ParsedIntakeUrl | undefined {
  if (!/^jobs\.(eu\.)?lever\.co$/.test(host(url))) return undefined;
  const parts = segments(url);
  const [org, postingId] = parts;
  if (!org || !postingId) return undefined;
  // Lever posting ids are UUIDs; anything else is a board or a listing page.
  if (!/^[0-9a-f-]{16,}$/i.test(postingId)) return undefined;
  return { adapter: "lever", org, postingId };
}

/** `jobs.ashbyhq.com/{company}/{jobId}`. */
function parseAshby(url: URL): ParsedIntakeUrl | undefined {
  if (host(url) !== "jobs.ashbyhq.com") return undefined;
  const parts = segments(url);
  const [org, postingId] = parts;
  if (!org || !postingId) return undefined;
  if (!/^[0-9a-f-]{16,}$/i.test(postingId)) return undefined;
  return { adapter: "ashby", org, postingId };
}

/**
 * `{tenant}.wd{N}.myworkdayjobs.com/[locale/]{siteId}/job/{externalPath}`.
 *
 * The locale segment ("en-US") is optional and Workday serves both forms, so
 * we anchor on `/job/` and read the site id from immediately before it rather
 * than counting from the start.
 */
function parseWorkday(url: URL): ParsedIntakeUrl | undefined {
  const h = host(url);
  const match = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/.exec(h);
  if (!match) return undefined;
  const tenant = match[1];
  const parts = segments(url);
  const jobAt = parts.indexOf("job");
  if (jobAt < 1) return undefined;
  const siteId = parts[jobAt - 1];
  const externalPath = parts.slice(jobAt + 1).join("/");
  if (!siteId || !externalPath) return undefined;
  return { adapter: "workday", org: tenant, siteId, externalPath };
}

const PARSERS = [parseGreenhouse, parseLever, parseAshby, parseWorkday];

/**
 * Identify the adapter for a URL.
 *
 * Returns the `generic` adapter for anything unrecognised, that adapter looks
 * for embedded JSON-LD and fails honestly when there is none, which is the
 * correct behavior for an unknown board.
 */
export function parseIntakeUrl(raw: string): ParsedIntakeUrl | undefined {
  const url = toUrl(raw);
  if (!url) return undefined;
  for (const parser of PARSERS) {
    const parsed = parser(url);
    if (parsed) return parsed;
  }
  return { adapter: "generic" };
}

/** Does this URL need a redirect hop before its ids can be read? */
export function isShortlink(raw: string): boolean {
  const url = toUrl(raw);
  return !!url && SHORTLINK_HOSTS.has(host(url));
}

/* ------------------------------------------------------------------ */
/* API endpoint construction                                           */
/* ------------------------------------------------------------------ */

/** Public Greenhouse board API, with the application questions included. */
export function greenhouseApiUrl(org: string, postingId: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(org)}/jobs/${encodeURIComponent(postingId)}?questions=true`;
}

/** Public Lever postings API for one posting. */
export function leverApiUrl(org: string, postingId: string): string {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(org)}/${encodeURIComponent(postingId)}?mode=json`;
}

/**
 * Public Ashby board API. There is no single-posting endpoint, so we fetch the
 * whole board and filter by id in the adapter.
 *
 * `includeCompensation=true` matters: without it the `compensation` key is
 * ABSENT rather than null, which reads identically to "this employer publishes
 * no pay range" and would have us silently drop real salary data.
 */
export function ashbyApiUrl(org: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`;
}

/**
 * Workday's internal CXS endpoint, derived by inserting `/wday/cxs/{tenant}/`
 * before the site id. When this 404s the tenant/site pair was not derivable and
 * the caller falls back to paste, we never retry with guessed site ids.
 */
export function workdayApiUrl(
  url: URL,
  tenant: string,
  siteId: string,
  externalPath: string,
): string {
  return `https://${url.hostname}/wday/cxs/${tenant}/${siteId}/job/${externalPath}`;
}
