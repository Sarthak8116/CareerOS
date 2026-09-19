import "server-only";

import dns from "node:dns/promises";
import { IntakeError } from "@/lib/intake/types";

/**
 * SERVER-ONLY outbound fetching for job-posting intake.
 *
 * This is the ONLY module in the intake path that touches the network, which
 * is what lets every adapter stay pure and fixture-testable.
 *
 * WHY THIS IS STRICTER THAN THE HARVEST CLIENT: Harvest calls ONE fixed Apify
 * host with our own token. This module fetches a URL A USER TYPED, which makes
 * it a server-side request forgery primitive unless it is guarded. An attacker
 * who can get us to fetch `http://169.254.169.254/` on a cloud host reads the
 * instance's credentials. So:
 *
 *  - https only, and never with credentials in the URL
 *  - the hostname is RESOLVED and every resulting address is checked against
 *    the private/loopback/link-local ranges before we connect
 *  - redirects are followed MANUALLY, at most 3 hops, and the host is
 *    re-validated on EVERY hop — a public host is free to redirect into the
 *    metadata service, so validating only the first URL proves nothing
 *  - the response body is capped, so a hostile server cannot exhaust memory
 *  - no cookies, no Authorization, no caller headers are ever forwarded
 *
 * KNOWN LIMITATION — DNS REBINDING IS NOT CLOSED. This is a TOCTOU window and
 * it is deliberate, not an oversight:
 *
 *   we resolve the hostname and validate every address it returns, and then we
 *   hand `fetch` the HOSTNAME, which resolves it a second time independently.
 *   An attacker controlling a DNS record with a very short TTL can answer the
 *   validating lookup with a public address and the connecting lookup with a
 *   private one, and reach an internal host through the guard.
 *
 * Closing it properly means connecting to a PINNED address while preserving SNI
 * and the Host header — a custom agent, not a flag. That was judged beyond P1.
 * What the guard above does stop: literal private IPs, localhost/.local, hosts
 * that resolve to private space at validation time, and redirects into private
 * space. What it does not stop is an attacker who controls DNS for a name they
 * also persuade the user to paste.
 *
 * Do not describe this module as rebinding-safe until a pinned-IP agent lands.
 *
 * Nothing here logs: a URL can itself carry a secret, so console output in this
 * module would be a leak (`client.test.ts` asserts the same rule for Harvest).
 */

/** How long one posting fetch may take, including redirects. */
const TIMEOUT_MS = 15_000;

/** Hard ceiling on a response body. Job postings are far smaller than this. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Redirect hops allowed. Short on purpose — real postings need 0 or 1. */
const MAX_REDIRECTS = 3;

/** A plain, honest UA. We identify ourselves rather than impersonating. */
const USER_AGENT = "CareerOS/1.0 (job posting intake)";

export interface FetchedResponse {
  status: number;
  contentType?: string;
  text: string;
  /** The URL we ended on, after any redirects. */
  finalUrl: string;
}

/* ------------------------------------------------------------------ */
/* Address safety                                                      */
/* ------------------------------------------------------------------ */

/** Is this IPv4 literal in a range we must never connect to? */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    // Unparseable: treat as unsafe rather than assuming it is fine.
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/** Is this IPv6 literal in a range we must never connect to? */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  // IPv4-mapped (::ffff:169.254.169.254) — check the embedded address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // unique-local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // link-local fe80::/10
  return false;
}

function isPrivateAddress(address: string, family: number): boolean {
  return family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
}

/**
 * Reject a URL we must not fetch.
 *
 * Throws rather than returning false so a missed call site fails closed.
 */
async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IntakeError("unsafe-url", "That is not a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw new IntakeError("unsafe-url", "Only https links can be read.");
  }
  if (url.username || url.password) {
    throw new IntakeError("unsafe-url", "That link contains credentials.");
  }

  const hostname = url.hostname.toLowerCase();
  // `.local` is mDNS; it never names a public job board.
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new IntakeError("unsafe-url", "That host is not reachable.");
  }

  // A bare IP literal skips DNS, so check it directly.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new IntakeError("unsafe-url", "That host is not reachable.");
    }
    return url;
  }
  if (hostname.startsWith("[") || hostname.includes(":")) {
    const literal = hostname.replace(/^\[|\]$/g, "");
    if (isPrivateIPv6(literal)) {
      throw new IntakeError("unsafe-url", "That host is not reachable.");
    }
    return url;
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new IntakeError("upstream", "That host could not be found.");
  }
  if (records.length === 0) {
    throw new IntakeError("upstream", "That host could not be found.");
  }
  // EVERY resolved address must be public — a hostname with one public and one
  // private A record would otherwise be a way through.
  for (const record of records) {
    if (isPrivateAddress(record.address, record.family)) {
      throw new IntakeError("unsafe-url", "That host is not reachable.");
    }
  }
  return url;
}

/* ------------------------------------------------------------------ */
/* Body reading                                                        */
/* ------------------------------------------------------------------ */

/** Read at most `MAX_BYTES`, so a hostile server cannot exhaust memory. */
async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        chunks.push(value.slice(0, value.byteLength - (total - MAX_BYTES)));
        break;
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fetch one URL safely, following a small number of redirects by hand.
 *
 * Returns the response even for a non-2xx status — the orchestrator maps status
 * codes to user-facing outcomes, and a 404 is a normal result here, not an
 * exception.
 */
export async function safeFetch(rawUrl: string): Promise<FetchedResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let current = rawUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Re-validated on EVERY hop: a public host may redirect to a private one.
      const url = await assertSafeUrl(current);

      let res: Response;
      try {
        res = await fetch(url, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          cache: "no-store",
          headers: {
            // Deliberately minimal. No cookies, no Authorization, no caller
            // headers — we never act with the user's credentials.
            accept: "application/json, text/html;q=0.9, */*;q=0.5",
            "user-agent": USER_AGENT,
          },
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new IntakeError("timeout", "That posting took too long to load.");
        }
        throw new IntakeError("upstream", "That posting could not be reached.");
      }

      if (REDIRECT_STATUSES.has(res.status)) {
        const location = res.headers.get("location");
        if (!location) {
          throw new IntakeError("upstream", "That posting redirected nowhere.");
        }
        // Relative redirects are legal and common.
        current = new URL(location, url).toString();
        continue;
      }

      const text = await readCapped(res);
      return {
        status: res.status,
        contentType: res.headers.get("content-type") ?? undefined,
        text,
        finalUrl: url.toString(),
      };
    }

    throw new IntakeError("upstream", "That posting redirected too many times.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Follow a shortlink to the URL it actually points at.
 *
 * Shortlink hosts (grnh.se) carry no board or posting id of their own, so the
 * real URL has to be resolved before an adapter can plan anything.
 */
export async function resolveFinalUrl(rawUrl: string): Promise<string> {
  const res = await safeFetch(rawUrl);
  return res.finalUrl;
}

/**
 * Parse a response body as JSON, or `undefined`.
 *
 * Checked BEFORE parsing rather than with a bare `res.json()`: a wrong Ashby
 * slug returns the plain text "Not Found" with `content-type: text/plain`, and
 * an unconditional JSON parse would throw there instead of reaching the clean
 * not-found branch.
 */
export function asJson(res: {
  contentType?: string;
  text: string;
}): unknown | undefined {
  const type = res.contentType ?? "";
  const body = res.text.trim();
  if (!body) return undefined;
  // Trust the declared type when it is present, but still tolerate a JSON body
  // served with a sloppy content-type — several boards do exactly that.
  if (type && !/json/i.test(type) && !/^[[{]/.test(body)) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}
