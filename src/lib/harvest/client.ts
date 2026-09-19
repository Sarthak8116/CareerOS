import "server-only";

/**
 * SERVER-ONLY HarvestAPI (Apify) access.
 *
 * Mirrors the guard on `lib/live/anthropic.ts`: `APIFY_TOKEN` is read from the
 * environment and NEVER reaches the browser (`server-only` throws if this
 * module is pulled into a client bundle). The token is never logged and is
 * scrubbed from any error text before it can propagate.
 *
 * Harvest is OFF unless BOTH `HARVEST_ENABLED=true` and `APIFY_TOKEN` are set.
 * When it is off, every caller falls back to existing behavior silently —
 * demo mode never touches this module at all.
 */

const APIFY_BASE = "https://api.apify.com/v2/acts";

/** Cost cap: how many employees we will ever pull for one campaign. */
export const MAX_EMPLOYEES_PER_CAMPAIGN = 25;

/**
 * Employee-list scraper mode. "Full" is required (not "Short") because the
 * warmth engine scores on `experience[]` and `education[]`, which the short
 * mode does not return. 25 profiles ≈ $0.20 per campaign.
 */
export const EMPLOYEE_SCRAPER_MODE = "Full ($8 per 1000)";

/** Profile scraper modes. Email mode is opt-in, per-contact, never a default. */
export const PROFILE_MODE_NO_EMAIL = "Profile details no email ($4 per 1k)";
export const PROFILE_MODE_EMAIL = "Profile details + email search ($10 per 1k)";

/** Default ceiling for a synchronous actor run. */
const RUN_TIMEOUT_MS = 120_000;

export type HarvestErrorKind =
  | "disabled"
  | "auth"
  | "rate-limited"
  | "timeout"
  | "upstream";

/**
 * A Harvest failure carrying a coarse `kind` the route layer maps to one of the
 * existing user-safe messages. The message never contains the token or a raw
 * Apify payload.
 */
export class HarvestError extends Error {
  readonly kind: HarvestErrorKind;

  constructor(kind: HarvestErrorKind, message: string) {
    super(message);
    this.name = "HarvestError";
    this.kind = kind;
  }
}

/** Is live LinkedIn enrichment configured? Both flags are required. */
export function harvestEnabled(): boolean {
  return process.env.HARVEST_ENABLED === "true" && !!process.env.APIFY_TOKEN;
}

function getToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new HarvestError("disabled", "APIFY_TOKEN is not set.");
  }
  return token;
}

/**
 * Remove the token from any string before it can reach a log or an error.
 * Defence in depth — we never intentionally put it in one.
 */
function scrub(text: string, token: string): string {
  return token ? text.split(token).join("[redacted]") : text;
}

export type HarvestActor =
  | "linkedin-profile-scraper"
  | "linkedin-company-employees"
  | "linkedin-company"
  | "linkedin-company-posts"
  | "linkedin-profile-posts";

/**
 * Run one HarvestAPI actor synchronously and return its raw dataset items.
 *
 * The caller is responsible for Zod-validating the result — nothing here trusts
 * the shape of what comes back, and nothing here interprets the content. All
 * returned text is UNTRUSTED scraped data and must be sanitized before it is
 * rendered or shown to a model.
 */
export async function runActor(
  actor: HarvestActor,
  input: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<unknown[]> {
  if (!harvestEnabled()) {
    throw new HarvestError("disabled", "Harvest enrichment is not enabled.");
  }
  const token = getToken();
  const url = `${APIFY_BASE}/harvestapi~${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? RUN_TIMEOUT_MS,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new HarvestError("timeout", "LinkedIn lookup timed out.");
    }
    throw new HarvestError("upstream", "LinkedIn lookup could not be reached.");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Read (and discard) the body so we never surface a raw Apify payload.
    await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new HarvestError("auth", "LinkedIn lookup authentication failed.");
    }
    if (res.status === 429) {
      throw new HarvestError("rate-limited", "LinkedIn lookup was rate limited.");
    }
    throw new HarvestError("upstream", "LinkedIn lookup failed upstream.");
  }

  let items: unknown;
  try {
    items = await res.json();
  } catch {
    throw new HarvestError("upstream", "LinkedIn lookup returned unreadable data.");
  }

  if (!Array.isArray(items)) {
    throw new HarvestError("upstream", "LinkedIn lookup returned an unexpected shape.");
  }
  return items;
}

/**
 * Map a thrown value to a concise, user-safe message, reusing the phrasing the
 * live campaign route already uses. Never leaks internals or the token.
 */
export function harvestSafeMessage(err: unknown): string {
  const token = process.env.APIFY_TOKEN ?? "";
  if (err instanceof HarvestError) {
    switch (err.kind) {
      case "disabled":
        return "LinkedIn enrichment is off.";
      case "auth":
        return "Authentication failed — check APIFY_TOKEN.";
      case "rate-limited":
        return "Rate limited by the data provider — try again shortly.";
      case "timeout":
        return "The LinkedIn lookup took too long — try again.";
      default:
        return "The LinkedIn lookup failed. Try again shortly.";
    }
  }
  const raw = err instanceof Error ? err.message : "";
  const safe = scrub(raw, token);
  return /api key|401|authentication/i.test(safe)
    ? "Authentication failed — check APIFY_TOKEN."
    : /rate|429/i.test(safe)
      ? "Rate limited by the data provider — try again shortly."
      : "The LinkedIn lookup failed. Try again shortly.";
}
