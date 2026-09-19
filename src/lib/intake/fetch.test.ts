import { describe, it, expect, vi, afterEach, type Mock } from "vitest";
import { EventEmitter } from "node:events";

/**
 * fetch.ts — the ONLY module in intake that touches the network.
 *
 * REWRITTEN for the P1 DNS-rebinding fix: fetch.ts no longer uses global
 * `fetch()` — it connects via `https.request` with a custom `lookup` option
 * (`guardedLookup`), which is what makes the validated address and the
 * connected address the SAME resolution. These tests target that real
 * mechanism directly:
 *
 *  - `guardedLookup` is unit-tested in isolation (it's exported specifically
 *    so this is possible) — this is "the connect-time lookup IS our guarded
 *    lookup" proof, not a structural inference about what fetch() receives.
 *  - a wiring test confirms `https.request` is actually given `guardedLookup`
 *    as its `lookup` option, so the unit test above is connected to the real
 *    request path rather than tested in a vacuum.
 *  - `safeFetch` is tested against a mocked `https.request` (a fake
 *    ClientRequest/IncomingMessage pair via node:events), for the properties
 *    that live above the connect layer: byte cap, timeout, redirects,
 *    transport-error mapping, and IP-literal fast-path rejection.
 *
 * No live network or live DNS anywhere.
 */

vi.mock("node:https", () => ({ default: { request: vi.fn() } }));
vi.mock("node:dns", () => {
  const lookup = vi.fn();
  return { default: { lookup }, lookup };
});
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn();
  return { default: { lookup }, lookup };
});

import https from "node:https";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";

const mockedRequest = vi.mocked(https.request) as unknown as Mock;
const mockedDnsLookup = vi.mocked(dns.lookup) as unknown as Mock;
// `dnsPromises.lookup` is overloaded; fetch.ts always calls it with
// `{ all: true }`, which resolves to the array-returning overload.
const mockedDnsPromisesLookup = vi.mocked(dnsPromises.lookup) as unknown as Mock;

function resetAll() {
  mockedRequest.mockReset();
  mockedDnsLookup.mockReset();
  mockedDnsPromisesLookup.mockReset();
}

/** `assertSafeUrl`'s pre-check: give it a benign public answer by default. */
function allowPreCheck() {
  mockedDnsPromisesLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
}

/* ------------------------------------------------------------------ */
/* guardedLookup — the actual mechanism that closes DNS rebinding      */
/* ------------------------------------------------------------------ */

describe("guardedLookup — the lookup the SOCKET actually connects through", () => {
  it("passes through a public address unchanged (array form, options.all)", async () => {
    const { guardedLookup } = await import("@/lib/intake/fetch");
    mockedDnsLookup.mockImplementation((_hostname: string, _options: unknown, cb: (...a: unknown[]) => void) => {
      cb(null, [{ address: "93.184.216.34", family: 4 }]);
    });

    const callback = vi.fn();
    guardedLookup("public.example.com", { all: true }, callback);

    expect(callback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }], undefined);
  });

  it("BLOCKS a private address (array form) — the callback never receives it", async () => {
    const { guardedLookup, BLOCKED_ADDRESS_CODE } = await import("@/lib/intake/fetch");
    mockedDnsLookup.mockImplementation((_hostname: string, _options: unknown, cb: (...a: unknown[]) => void) => {
      cb(null, [{ address: "169.254.169.254", family: 4 }]);
    });

    const callback = vi.fn();
    guardedLookup("evil.example.com", { all: true }, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [err, address] = callback.mock.calls[0];
    expect((err as NodeJS.ErrnoException)?.code).toBe(BLOCKED_ADDRESS_CODE);
    expect(address).toBe("");
  });

  it("BLOCKS when only ONE of several resolved addresses is private", async () => {
    const { guardedLookup, BLOCKED_ADDRESS_CODE } = await import("@/lib/intake/fetch");
    mockedDnsLookup.mockImplementation((_hostname: string, _options: unknown, cb: (...a: unknown[]) => void) => {
      cb(null, [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]);
    });

    const callback = vi.fn();
    guardedLookup("evil.example.com", { all: true }, callback);

    const [err] = callback.mock.calls[0];
    expect((err as NodeJS.ErrnoException)?.code).toBe(BLOCKED_ADDRESS_CODE);
  });

  it("BLOCKS a private address given in the single-address callback form (options.all falsy)", async () => {
    // Node calls the lookup differently depending on options.all — mishandling
    // this shape would silently skip the check for the non-`all` call style.
    const { guardedLookup, BLOCKED_ADDRESS_CODE } = await import("@/lib/intake/fetch");
    mockedDnsLookup.mockImplementation((_hostname: string, _options: unknown, cb: (...a: unknown[]) => void) => {
      cb(null, "127.0.0.1", 4);
    });

    const callback = vi.fn();
    guardedLookup("evil.example.com", {}, callback);

    const [err] = callback.mock.calls[0];
    expect((err as NodeJS.ErrnoException)?.code).toBe(BLOCKED_ADDRESS_CODE);
  });

  it("passes a DNS-level error straight through rather than swallowing it", async () => {
    const { guardedLookup } = await import("@/lib/intake/fetch");
    const dnsError = new Error("ENOTFOUND");
    mockedDnsLookup.mockImplementation((_hostname: string, _options: unknown, cb: (...a: unknown[]) => void) => {
      cb(dnsError, "");
    });

    const callback = vi.fn();
    guardedLookup("nonexistent.example.invalid", {}, callback);

    expect(callback).toHaveBeenCalledWith(dnsError, "");
  });

  it("the blocked-address error message never echoes the attacker-chosen address", async () => {
    const { guardedLookup } = await import("@/lib/intake/fetch");
    mockedDnsLookup.mockImplementation((_hostname: string, _options: unknown, cb: (...a: unknown[]) => void) => {
      cb(null, [{ address: "169.254.169.254", family: 4 }]);
    });

    const callback = vi.fn();
    guardedLookup("evil.example.com", { all: true }, callback);

    const [err] = callback.mock.calls[0];
    expect((err as Error).message).not.toContain("169.254.169.254");
  });
});

describe("guardedLookup is actually wired into the request — not just tested in isolation", () => {
  afterEach(resetAll);

  it("https.request is called with { lookup: guardedLookup }", async () => {
    allowPreCheck();
    mockedRequest.mockImplementation(() => {
      const req = fakeRequest();
      return req;
    });

    const { safeFetch, guardedLookup } = await import("@/lib/intake/fetch");
    // Fire-and-forget: we only need to inspect the call args, not complete it.
    void safeFetch("https://wired.example.com/job").catch(() => undefined);
    // Let assertSafeUrl's DNS mock resolve before https.request is invoked.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRequest).toHaveBeenCalled();
    const [, options] = mockedRequest.mock.calls[0];
    expect((options as { lookup?: unknown }).lookup).toBe(guardedLookup);
  });
});

/* ------------------------------------------------------------------ */
/* Fake https.request plumbing for safeFetch-level tests               */
/* ------------------------------------------------------------------ */

interface FakeReq extends EventEmitter {
  setTimeout: Mock;
  end: Mock;
  destroy: Mock;
}
interface FakeRes extends EventEmitter {
  statusCode?: number;
  headers: Record<string, string | undefined>;
  destroy: Mock;
}

function fakeRequest(): FakeReq {
  const req = new EventEmitter() as FakeReq;
  req.setTimeout = vi.fn();
  req.end = vi.fn();
  req.destroy = vi.fn();
  return req;
}

function fakeResponse(status: number, headers: Record<string, string | undefined> = {}): FakeRes {
  const res = new EventEmitter() as FakeRes;
  res.statusCode = status;
  res.headers = headers;
  // A real IncomingMessage's destroy() triggers 'close' once the stream
  // actually tears down — httpsGet relies on that to settle the promise
  // when it destroys the response at the byte cap.
  res.destroy = vi.fn(() => {
    queueMicrotask(() => res.emit("close"));
  });
  return res;
}

/** Wires a mocked https.request that immediately responds with `body`. */
function mockSuccessfulRequest(status: number, body: string, headers: Record<string, string | undefined> = {}) {
  mockedRequest.mockImplementation(
    (
      _url: unknown,
      _options: unknown,
      callback: (res: FakeRes) => void,
    ) => {
      const req = fakeRequest();
      const res = fakeResponse(status, headers);
      queueMicrotask(() => {
        callback(res);
        if (body) res.emit("data", Buffer.from(body, "utf8"));
        res.emit("end");
      });
      return req;
    },
  );
}

/* ------------------------------------------------------------------ */
/* safeFetch — transport-level behavior above the connect layer        */
/* ------------------------------------------------------------------ */

describe("safeFetch — basic transport", () => {
  afterEach(resetAll);

  it("returns status, body and content-type for a normal response", async () => {
    allowPreCheck();
    mockSuccessfulRequest(200, '{"title":"Engineer"}', { "content-type": "application/json" });

    const { safeFetch } = await import("@/lib/intake/fetch");
    const res = await safeFetch("https://normal.example.com/job");

    expect(res.status).toBe(200);
    expect(res.text).toBe('{"title":"Engineer"}');
    expect(res.contentType).toBe("application/json");
    expect(res.finalUrl).toContain("normal.example.com");
  });

  it("rejects a private IP LITERAL before ever calling https.request (no DNS/network needed)", async () => {
    const { safeFetch } = await import("@/lib/intake/fetch");
    await expect(safeFetch("https://169.254.169.254/latest/meta-data/")).rejects.toMatchObject({
      kind: "unsafe-url",
    });
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("re-validates the hostname on every redirect hop before connecting again", async () => {
    const seenHostnames: string[] = [];
    mockedDnsPromisesLookup.mockImplementation(async (hostname: string) => {
      seenHostnames.push(hostname);
      return [{ address: "93.184.216.34", family: 4 }];
    });

    let requestCall = 0;
    mockedRequest.mockImplementation(
      (_url: unknown, _options: unknown, callback: (res: FakeRes) => void) => {
        requestCall += 1;
        const req = fakeRequest();
        queueMicrotask(() => {
          if (requestCall === 1) {
            const res = fakeResponse(302, { location: "https://b.example.com/job" });
            callback(res);
            // A real redirect response still ends its (empty) body.
            res.emit("end");
          } else {
            const res = fakeResponse(200, { "content-type": "text/plain" });
            callback(res);
            res.emit("data", Buffer.from("ok"));
            res.emit("end");
          }
        });
        return req;
      },
    );

    const { safeFetch } = await import("@/lib/intake/fetch");
    const res = await safeFetch("https://a.example.com/job");

    expect(seenHostnames).toEqual(["a.example.com", "b.example.com"]);
    expect(mockedRequest).toHaveBeenCalledTimes(2);
    expect(res.finalUrl).toContain("b.example.com");
  });

  it("truncates a response larger than the documented 2 MiB cap", async () => {
    allowPreCheck();
    const CAP = 2 * 1024 * 1024;
    mockedRequest.mockImplementation(
      (_url: unknown, _options: unknown, callback: (res: FakeRes) => void) => {
        const req = fakeRequest();
        const res = fakeResponse(200, { "content-type": "text/plain" });
        queueMicrotask(() => {
          callback(res);
          // Two chunks that together exceed the cap. httpsGet calls
          // res.destroy() once the cap is hit, and our fake destroy()
          // schedules the 'close' that settles the promise, matching a real
          // destroyed stream.
          res.emit("data", Buffer.alloc(CAP, "a"));
          res.emit("data", Buffer.alloc(1024 * 1024, "a"));
        });
        return req;
      },
    );

    const { safeFetch } = await import("@/lib/intake/fetch");
    const res = await safeFetch("https://big.example.com/job");
    expect(res.text.length).toBeLessThanOrEqual(CAP);
    expect(res.text.length).toBeGreaterThan(0);
  });

  it("maps a connect-time block (guardedLookup firing on the real request) onto 'unsafe-url'", async () => {
    // Defense-in-depth check: even if assertSafeUrl's pre-check somehow let a
    // bad host through, the connect-time guard independently blocks it, and
    // that failure is what safeFetch must surface — not a generic upstream
    // error that would obscure what actually happened.
    allowPreCheck();
    mockedRequest.mockImplementation(() => {
      const req = fakeRequest();
      queueMicrotask(() => {
        const err: NodeJS.ErrnoException = new Error("Refused to connect to a non-public address.");
        err.code = "ECAREEROS_BLOCKED";
        req.emit("error", err);
      });
      return req;
    });

    const { safeFetch } = await import("@/lib/intake/fetch");
    await expect(safeFetch("https://looks-public-but-isnt.example.com/job")).rejects.toMatchObject({
      kind: "unsafe-url",
    });
  });

  it("maps a socket-level error onto 'upstream'", async () => {
    allowPreCheck();
    mockedRequest.mockImplementation(() => {
      const req = fakeRequest();
      queueMicrotask(() => {
        req.emit("error", new Error("ECONNREFUSED"));
      });
      return req;
    });

    const { safeFetch } = await import("@/lib/intake/fetch");
    await expect(safeFetch("https://unreachable.example.com/job")).rejects.toMatchObject({
      kind: "upstream",
    });
  });
});

describe("safeFetch — a slow upstream times out rather than hanging forever", () => {
  afterEach(() => {
    resetAll();
  });

  it("aborts via req.destroy() and reports 'timeout' when setTimeout's callback fires", async () => {
    allowPreCheck();
    mockedRequest.mockImplementation(() => {
      const req = fakeRequest();
      req.setTimeout = vi.fn((_ms: number, cb: () => void) => {
        // Fire the timeout callback immediately, as fetch.ts's own handler
        // would once TIMEOUT_MS elapses — deterministic, no fake-timer/event
        // loop interplay with the mocked EventEmitter needed.
        cb();
      });
      req.destroy = vi.fn((err: NodeJS.ErrnoException) => {
        req.emit("error", err);
      });
      return req;
    });

    const { safeFetch } = await import("@/lib/intake/fetch");
    await expect(safeFetch("https://slow.example.com/job")).rejects.toMatchObject({
      kind: "timeout",
    });
  });
});
