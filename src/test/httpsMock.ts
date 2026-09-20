import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import type { Mock } from "vitest";

/**
 * Test double for `node:https.request`.
 *
 * `src/lib/intake/fetch.ts` connects through `https.request` rather than global
 * `fetch`, because only `https.request` accepts the custom `lookup` that closes
 * the DNS-rebinding window. That makes `global.fetch` useless as a test seam,
 * so these helpers stand in for the transport instead.
 *
 * Each test file still needs its own hoisted mock, `vi.mock` is hoisted above
 * imports, so the factory cannot reference anything from here:
 *
 *   vi.mock("node:https", () => ({ default: { request: vi.fn() } }));
 *   import https from "node:https";
 *   const request = vi.mocked(https.request);
 *
 * then drive it with `respondWith(request, {...})`.
 */

export interface StubbedResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
  /**
   * Never send a response, so the caller's own timeout fires. The stubbed
   * timeout is invoked immediately rather than after the real 15s, so the
   * timeout PATH is exercised without the test waiting for it.
   */
  hang?: boolean;
}

/** What the code under test asked for, captured for assertions. */
export interface CapturedRequest {
  url: string;
  /** The `lookup` the request was made with, the SSRF guard. */
  lookup?: unknown;
  headers?: Record<string, unknown>;
}

/**
 * Point the mocked `https.request` at a canned response.
 *
 * Returns the list of captured requests, which grows as the code under test
 * makes them, one entry per redirect hop.
 */
export function respondWith(
  request: Mock,
  response: StubbedResponse | ((call: number) => StubbedResponse),
): CapturedRequest[] {
  const captured: CapturedRequest[] = [];

  request.mockImplementation(
    (
      url: URL | string,
      options: Record<string, unknown>,
      callback: (res: PassThrough & { statusCode?: number; headers?: unknown }) => void,
    ) => {
      const index = captured.length;
      captured.push({
        url: url.toString(),
        lookup: options?.lookup,
        headers: options?.headers as Record<string, unknown> | undefined,
      });

      const spec = typeof response === "function" ? response(index) : response;

      // The request handle. `destroy(err)` must surface as an 'error' event,
      // which is how the real module reports a timeout.
      const req = new EventEmitter() as EventEmitter & {
        setTimeout: (ms: number, cb: () => void) => void;
        destroy: (err?: Error) => void;
        end: () => void;
      };
      req.end = () => undefined;
      req.destroy = (err?: Error) => {
        if (err) req.emit("error", err);
      };
      req.setTimeout = (_ms: number, cb: () => void) => {
        // Fire straight away for a hung upstream so the suite stays fast.
        if (spec.hang) queueMicrotask(cb);
      };

      if (!spec.hang) {
        queueMicrotask(() => {
          const res = new PassThrough() as PassThrough & {
            statusCode?: number;
            headers?: Record<string, string>;
          };
          res.statusCode = spec.status ?? 200;
          res.headers = spec.headers ?? { "content-type": "application/json" };
          callback(res);
          if (spec.body !== undefined) res.write(spec.body);
          res.end();
        });
      }

      return req;
    },
  );

  return captured;
}

/** A body of exactly `bytes` length, for exercising the response cap. */
export function bodyOfSize(bytes: number, fill = "x"): string {
  return fill.repeat(bytes);
}
