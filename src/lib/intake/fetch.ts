import "server-only";

import https from "node:https";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";
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
 * who can get us to fetch `https://169.254.169.254/` on a cloud host reads the
 * instance's credentials. So:
 *
 *  - https only, and never with credentials in the URL
 *  - THE ADDRESS VALIDATED IS THE ADDRESS CONNECTED TO (see below)
 *  - the hostname is also resolved and checked up front, as defence in depth
 *  - redirects are followed MANUALLY, at most 3 hops, and the host is
 *    re-validated on EVERY hop, a public host is free to redirect into the
 *    metadata service, so validating only the first URL proves nothing
 *  - the response body is capped, so a hostile server cannot exhaust memory
 *  - no cookies, no Authorization, no caller headers are ever forwarded
 *
 * HOW DNS REBINDING IS CLOSED, and why the obvious phrasing is wrong.
 *
 * The invariant is: THE ADDRESS VALIDATED MUST BE THE ADDRESS CONNECTED TO.
 *
 * It is NOT "re-resolve DNS at connect time". That describes the BUG: two
 * separate lookups, with a window between them in which an attacker controlling
 * a short-TTL record answers the first with a public address and the second
 * with a private one. A second independent lookup is the hole, however
 * responsible it sounds.
 *
 * So we pass a custom `lookup` to `https.request`. That function is what
 * supplies the address the socket actually connects to, and it applies the
 * private/loopback/link-local checks itself, so validation and connection
 * share ONE resolution and no window exists. Rejecting inside the lookup means
 * the socket never receives an address at all.
 *
 * We still connect BY HOSTNAME, so SNI, certificate validation and virtual
 * hosting are unaffected. That property is load-bearing: "fix" this by
 * connecting to a raw IP instead and TLS silently stops verifying the host.
 *
 * `assertSafeUrl` below is now redundant for security but deliberately kept:
 * it rejects obviously-bad hosts before a socket is opened, and gives a
 * clearer failure than a connect-time error.
 *
 * Nothing here logs: a URL can itself carry a secret, so console output in this
 * module would be a leak (`client.test.ts` asserts the same rule for Harvest).
 */

/** How long one posting fetch may take, including redirects. */
const TIMEOUT_MS = 15_000;

/** Hard ceiling on a response body. Job postings are far smaller than this. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Redirect hops allowed. Short on purpose, real postings need 0 or 1. */
const MAX_REDIRECTS = 3;

/** A plain, honest UA. We identify ourselves rather than impersonating. */
const USER_AGENT = "CareerOS/1.0 (job posting intake)";

/** Marks a connection refused by our own guard, not by the network. */
export const BLOCKED_ADDRESS_CODE = "ECAREEROS_BLOCKED";

/** Marks our own timeout, distinct from a socket-level error. */
const TIMEOUT_CODE = "ECAREEROS_TIMEOUT";

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
  // IPv4-mapped (::ffff:169.254.169.254), check the embedded address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // unique-local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // link-local fe80::/10
  return false;
}

export function isPrivateAddress(address: string, family: number): boolean {
  return family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
}

function blockedError(address: string): NodeJS.ErrnoException {
  // The address is NOT included in the message: it can be attacker-chosen, and
  // this string may reach a log.
  const err: NodeJS.ErrnoException = new Error(
    "Refused to connect to a non-public address.",
  );
  err.code = BLOCKED_ADDRESS_CODE;
  void address;
  return err;
}

/**
 * The DNS lookup the socket actually uses, with the private-range check inside.
 *
 * THIS is what closes the rebinding window: the address this function returns
 * is the address the connection uses, so there is no second, unguarded
 * resolution between the check and the connect. Rejecting here means no socket
 * is ever opened.
 *
 * Node calls it as `(hostname, options, callback)`. With `options.all === true`
 * the callback receives an ARRAY of `{address, family}`; otherwise a single
 * address plus family. Both shapes are handled, mishandling the array form
 * would silently skip the check for every multi-record host.
 */
export function guardedLookup(
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  // `dns.lookup` is overloaded on whether `options.all` is set, and the option
  // comes from Node at call time rather than from us, so the callback is typed
  // for BOTH result shapes here and narrowed below.
  const onResolved = (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ): void => {
    if (err) {
      callback(err, "");
      return;
    }
    const entries: LookupAddress[] = Array.isArray(address)
      ? address
      : [{ address, family: family ?? 4 }];

    for (const entry of entries) {
      if (isPrivateAddress(entry.address, entry.family)) {
        callback(blockedError(entry.address), "");
        return;
      }
    }
    callback(null, address, family);
  };

  // The cast picks one overload; `onResolved` accepts both result shapes.
  dns.lookup(
    hostname,
    options as dns.LookupAllOptions,
    onResolved as (
      err: NodeJS.ErrnoException | null,
      address: LookupAddress[],
    ) => void,
  );
}

/**
 * Reject a URL we must not fetch, before a socket is opened.
 *
 * Defence in depth: `guardedLookup` is the guarantee, but failing fast here
 * gives a clearer error and avoids opening a connection for an obviously bad
 * host. Throws rather than returning false so a missed call site fails closed.
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
    records = await dnsPromises.lookup(hostname, { all: true });
  } catch {
    throw new IntakeError("upstream", "That host could not be found.");
  }
  if (records.length === 0) {
    throw new IntakeError("upstream", "That host could not be found.");
  }
  // EVERY resolved address must be public, a hostname with one public and one
  // private A record would otherwise be a way through.
  for (const record of records) {
    if (isPrivateAddress(record.address, record.family)) {
      throw new IntakeError("unsafe-url", "That host is not reachable.");
    }
  }
  return url;
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

interface RawResponse {
  status: number;
  contentType?: string;
  location?: string;
  text: string;
}

/**
 * One GET, connected through `guardedLookup`.
 *
 * Redirects are NOT followed here, `safeFetch` follows them by hand so each
 * hop is re-validated. The body is capped while it streams, so an oversized
 * response is abandoned rather than buffered.
 */
function httpsGet(url: URL): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    let settled = false;
    const finish = (value: RawResponse) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const req = https.request(
      url,
      {
        method: "GET",
        // The guard. Everything else here is ordinary request setup.
        lookup: guardedLookup,
        headers: {
          // Deliberately minimal. No cookies, no Authorization, no caller
          // headers, we never act with the user's credentials.
          accept: "application/json, text/html;q=0.9, */*;q=0.5",
          "user-agent": USER_AGENT,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;

        const done = () =>
          finish({
            status: res.statusCode ?? 0,
            contentType: res.headers["content-type"] ?? undefined,
            location: res.headers.location ?? undefined,
            text: Buffer.concat(chunks).toString("utf8"),
          });

        /** Abandon the rest of the body and settle with what we have. */
        const stopReading = () => {
          // Guarded: a real IncomingMessage is a stream, but settling must not
          // depend on that, if `destroy` is unavailable we still resolve.
          if (typeof res.destroy === "function") res.destroy();
          done();
        };

        // A redirect's body is never read: we only need the Location header,
        // and `safeFetch` re-validates the target before connecting to it.
        // Downloading a body we are about to discard wastes bandwidth.
        if (REDIRECT_STATUSES.has(res.statusCode ?? 0)) {
          stopReading();
          return;
        }

        res.on("data", (chunk: Buffer) => {
          const remaining = MAX_BYTES - total;
          if (remaining <= 0) return;
          if (chunk.byteLength >= remaining) {
            chunks.push(chunk.subarray(0, remaining));
            total = MAX_BYTES;
            stopReading();
            return;
          }
          chunks.push(chunk);
          total += chunk.byteLength;
        });

        res.on("end", done);
        // Also fires after `res.destroy()`, and on a truncated response.
        res.on("close", done);
        res.on("error", fail);
      },
    );

    req.setTimeout(TIMEOUT_MS, () => {
      const err: NodeJS.ErrnoException = new Error("Request timed out.");
      err.code = TIMEOUT_CODE;
      req.destroy(err);
    });
    req.on("error", fail);
    req.end();
  });
}

/** Map a transport-level failure onto a user-safe IntakeError. */
function transportError(err: unknown): IntakeError {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === BLOCKED_ADDRESS_CODE) {
    // Our own guard refused the address the socket would have used.
    return new IntakeError("unsafe-url", "That host is not reachable.");
  }
  if (code === TIMEOUT_CODE || code === "ETIMEDOUT") {
    return new IntakeError("timeout", "That posting took too long to load.");
  }
  return new IntakeError("upstream", "That posting could not be reached.");
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fetch one URL safely, following a small number of redirects by hand.
 *
 * Returns the response even for a non-2xx status, the orchestrator maps status
 * codes to user-facing outcomes, and a 404 is a normal result here, not an
 * exception.
 */
export async function safeFetch(rawUrl: string): Promise<FetchedResponse> {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Pre-check, then connect, and the connection re-checks the address it
    // actually uses, via `guardedLookup`. Both run on EVERY hop: a public host
    // is free to redirect into private space.
    const url = await assertSafeUrl(current);

    let res: RawResponse;
    try {
      res = await httpsGet(url);
    } catch (err) {
      throw transportError(err);
    }

    if (REDIRECT_STATUSES.has(res.status)) {
      if (!res.location) {
        throw new IntakeError("upstream", "That posting redirected nowhere.");
      }
      // Relative redirects are legal and common.
      current = new URL(res.location, url).toString();
      continue;
    }

    return {
      status: res.status,
      contentType: res.contentType,
      text: res.text,
      finalUrl: url.toString(),
    };
  }

  throw new IntakeError("upstream", "That posting redirected too many times.");
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
  // served with a sloppy content-type, several boards do exactly that.
  if (type && !/json/i.test(type) && !/^[[{]/.test(body)) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}
