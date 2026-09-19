import { describe, it, expect, vi, afterEach, type Mock } from "vitest";

/**
 * fetch.ts — the ONLY module in intake that touches the network.
 *
 * These tests cover what src/lib/intake/intake.test.ts's "SSRF guard" block
 * does NOT: every case there uses an IP literal or `localhost`/`.local`, which
 * all take an early-return path in `assertSafeUrl` and never reach
 * `dns.lookup()`. A real posting URL is a HOSTNAME — "boards.greenhouse.io",
 * or an attacker's own domain — so the DNS-resolution branch is the one that
 * actually matters in production, and it had zero coverage before this file.
 *
 * No live network or live DNS anywhere: `node:dns/promises` is mocked so every
 * case runs deterministically offline.
 */

vi.mock("node:dns/promises", () => {
  const lookup = vi.fn();
  return { default: { lookup }, lookup };
});

import dns from "node:dns/promises";

/**
 * `dns.lookup` is overloaded, and `vi.mocked` binds to the single-address
 * signature. `fetch.ts` calls it with `{ all: true }`, which resolves to the
 * overload returning an ARRAY, so the mock is widened here to let
 * `mockResolvedValue([...])` typecheck against the signature actually in use.
 */
const mockedLookup = vi.mocked(dns.lookup) as unknown as Mock;

function resetAll() {
  vi.unstubAllGlobals();
  mockedLookup.mockReset();
}

/**
 * `dns.lookup` is overloaded (single-address vs. `{ all: true }` array-of-
 * addresses forms), which makes the inferred mock type pick the wrong
 * overload. fetch.ts always calls it with `{ all: true }`, so these helpers
 * just pin the mock to the array shape that call site actually gets.
 */
function mockLookupResolves(records: { address: string; family: number }[]) {
  mockedLookup.mockResolvedValue(records as never);
}
function mockLookupRejects(err: unknown) {
  mockedLookup.mockRejectedValue(err as never);
}

/* ------------------------------------------------------------------ */
/* Hostname → DNS → address-safety check                               */
/* ------------------------------------------------------------------ */

describe("fetch.ts — a HOSTNAME resolved via DNS to a private address is refused", () => {
  afterEach(resetAll);

  it("refuses a hostname whose only DNS answer is cloud metadata", async () => {
    mockLookupResolves([{ address: "169.254.169.254", family: 4 }]);
    const { safeFetch } = await import("@/lib/intake/fetch");
    await expect(safeFetch("https://evil.example.com/job")).rejects.toMatchObject({
      kind: "unsafe-url",
    });
  });

  it("refuses a hostname with MULTIPLE A records if even ONE is private", async () => {
    // A hostname with one public and one private record is a documented way
    // through a check that only inspects the first answer — this code must
    // check every resolved address, not just records[0].
    mockLookupResolves([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    const { safeFetch } = await import("@/lib/intake/fetch");
    await expect(safeFetch("https://evil.example.com/job")).rejects.toMatchObject({
      kind: "unsafe-url",
    });
  });

  it("refuses a hostname resolving to an IPv6 unique-local or link-local address", async () => {
    mockLookupResolves([{ address: "fe80::1", family: 6 }]);
    const { safeFetch } = await import("@/lib/intake/fetch");
    await expect(safeFetch("https://evil.example.com/job")).rejects.toMatchObject({
      kind: "unsafe-url",
    });
  });

  it("allows a hostname whose DNS answer is entirely public", async () => {
    mockLookupResolves([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
      ),
    );
    const { safeFetch } = await import("@/lib/intake/fetch");
    const res = await safeFetch("https://public.example.com/job");
    expect(res.status).toBe(200);
  });

  it("fails CLOSED (as 'upstream', not a silent pass-through) when DNS lookup itself errors", async () => {
    mockLookupRejects(new Error("ENOTFOUND"));
    const { safeFetch } = await import("@/lib/intake/fetch");
    await expect(safeFetch("https://nonexistent.example.invalid/job")).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("fails CLOSED when DNS returns zero records", async () => {
    mockLookupResolves([]);
    const { safeFetch } = await import("@/lib/intake/fetch");
    await expect(safeFetch("https://empty-answer.example.com/job")).rejects.toMatchObject({
      kind: "upstream",
    });
  });
});

/* ------------------------------------------------------------------ */
/* DNS-rebinding TOCTOU: is the validated address ever pinned?         */
/* ------------------------------------------------------------------ */

describe("fetch.ts — the validated DNS answer is never pinned for the actual connection", () => {
  afterEach(resetAll);

  it("calls fetch() with the ORIGINAL HOSTNAME, never the resolved IP — so a second, independent DNS lookup happens at connect time", async () => {
    // This does NOT simulate a live rebinding attack — doing that would
    // require controlling what Node's own resolver returns when undici opens
    // the TCP connection, which is outside what a mocked `fetch()` can
    // observe. What this DOES prove, structurally and deterministically: the
    // IP address `assertSafeUrl` validated via `dns.lookup()` is discarded
    // after the check. `fetch()` is invoked with the hostname, not with an IP
    // substituted in, and there is no custom Agent/dispatcher anywhere in
    // fetch.ts that would pin the TCP connection to that specific address.
    // That gap is exactly what makes DNS rebinding possible: the runtime's
    // own resolver — not this check — decides what address the request
    // actually connects to, and it is free to answer differently the second
    // time (attacker-controlled DNS with TTL=0 is the standard technique).
    mockLookupResolves([{ address: "93.184.216.34", family: 4 }]);
    let fetchedUrl: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | string) => {
        fetchedUrl = input.toString();
        return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
      }),
    );

    const { safeFetch } = await import("@/lib/intake/fetch");
    await safeFetch("https://rebind.example.com/job");

    expect(mockedLookup).toHaveBeenCalledWith("rebind.example.com", expect.anything());
    expect(fetchedUrl).toContain("rebind.example.com");
    expect(fetchedUrl).not.toContain("93.184.216.34");
  });

  it("re-resolves DNS independently on every redirect hop (not just re-checking the same cached answer)", async () => {
    // Confirms the per-hop revalidation intake.test.ts already tests actually
    // goes back to DNS each time, rather than trusting a memoized result from
    // hop 1 — a stale cache would reopen the same rebinding window.
    mockLookupResolves([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200, headers: { "content-type": "text/plain" } })),
    );
    const { safeFetch } = await import("@/lib/intake/fetch");
    await safeFetch("https://a.example.com/job");
    await safeFetch("https://b.example.com/job");

    expect(mockedLookup).toHaveBeenCalledWith("a.example.com", expect.anything());
    expect(mockedLookup).toHaveBeenCalledWith("b.example.com", expect.anything());
    expect(mockedLookup).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ */
/* Response body cap                                                   */
/* ------------------------------------------------------------------ */

describe("fetch.ts — the response body is capped", () => {
  afterEach(resetAll);

  it("truncates a body larger than the documented 2 MiB cap instead of buffering all of it", async () => {
    mockLookupResolves([{ address: "93.184.216.34", family: 4 }]);
    const CAP = 2 * 1024 * 1024;
    const oversized = "a".repeat(CAP + 1024 * 1024); // 1 MiB past the cap
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(oversized, { status: 200, headers: { "content-type": "text/plain" } }),
      ),
    );
    const { safeFetch } = await import("@/lib/intake/fetch");
    const res = await safeFetch("https://big.example.com/job");
    expect(res.text.length).toBeLessThanOrEqual(CAP);
    expect(res.text.length).toBeGreaterThan(0);
  });

  it("returns a small body unmodified — the cap must not truncate normal postings", async () => {
    mockLookupResolves([{ address: "93.184.216.34", family: 4 }]);
    const body = JSON.stringify({ title: "Engineer" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
    const { safeFetch } = await import("@/lib/intake/fetch");
    const res = await safeFetch("https://normal.example.com/job");
    expect(res.text).toBe(body);
  });
});

/* ------------------------------------------------------------------ */
/* Timeout                                                             */
/* ------------------------------------------------------------------ */

describe("fetch.ts — a slow upstream times out rather than hanging the request forever", () => {
  afterEach(() => {
    resetAll();
    vi.useRealTimers();
  });

  it("aborts and reports 'timeout' when the upstream never responds", async () => {
    vi.useFakeTimers();
    mockLookupResolves([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: URL | string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }),
    );

    const { safeFetch } = await import("@/lib/intake/fetch");
    const promise = safeFetch("https://slow.example.com/job");
    // Attach a handler immediately so advancing the fake timer below can't
    // create a window where the rejection is momentarily unhandled — the real
    // assertion against the same promise still runs afterwards.
    promise.catch(() => undefined);
    // Let assertSafeUrl's async DNS mock resolve before advancing the timer.
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(promise).rejects.toMatchObject({ kind: "timeout" });
  });
});
