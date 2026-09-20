/**
 * The Web Worker pdf.js runs in, and the proof that it is actually running.
 *
 * Split out of `rasterize.ts` because the hazards here are entirely about the
 * bundler and the browser, not about PDFs: which flavour of worker the build
 * emits, and how to tell a worker that is thinking from one that is dead.
 */

import { ResumeRasterizeError } from "@/lib/resume/errors";

/**
 * Booting the worker chunk is a network fetch, so this is generous. It bounds
 * the worker *starting up*, not parsing or rendering, both of which happen
 * afterwards and are not on this clock.
 */
export const WORKER_READY_TIMEOUT_MS = 15_000;

/**
 * Build the worker ourselves rather than letting pdf.js find one.
 *
 * This is the whole reason the fake-worker fallback cannot bite us. Given a
 * port, pdf.js initialises from it directly; only the path where it resolves
 * `workerSrc` itself can fail over to "Setting up fake worker" and render on
 * the main thread, freezing the tab on a large PDF while logging a console
 * warning nobody reads.
 *
 * CLASSIC WORKER, NOT `{ type: "module" }`, and this is not a style choice.
 * `new URL(…, import.meta.url)` makes the bundler own this file: it compiles
 * `pdf.worker.mjs` into a worker bundle of its own and rewrites the URL to
 * point at it. That bundle loads its chunks with `importScripts`, which exists
 * only in a classic worker, asking for a module worker gets you a worker that
 * boots and then dies on its first chunk load. pdf.js never hears back, and the
 * upload hangs on a spinner forever. Verified against the emitted bundle, not
 * assumed: `.next/static/chunks` contains an `importScripts`-based worker entry.
 * If this ever moves to a bundler that emits ESM worker chunks, the `type` and
 * this comment change together.
 */
export function defaultCreateWorker(): unknown {
  return new Worker(
    new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url),
  );
}

/**
 * Proof that the worker is alive, rather than an assumption that it is.
 *
 * pdf.js's worker announces itself the moment it loads (`initializeFromPort`
 * sends "ready" from the worker's own static initialiser), so the first message
 * back is evidence the worker fetched its chunks and is running our code. Every
 * way that can fail, a 404 on the worker chunk, a CSP that forbids workers, a
 * classic/module mismatch, otherwise ends in silence, and silence here looks
 * exactly like a slow PDF.
 *
 * The error listener stays attached for the whole operation, so a worker that
 * dies mid-parse surfaces as an error instead of a spinner that never stops.
 */
export function watchWorker(port: unknown, timeoutMs: number) {
  const target = port as Worker;
  if (typeof target?.addEventListener !== "function") {
    // An injected stand-in with no event surface: nothing to watch.
    return {
      ready: Promise.resolve(),
      guard: <T>(work: Promise<T>) => work,
      dispose: () => {},
    };
  }

  let onFailure: ((err: Error) => void) | null = null;
  const failure = new Promise<never>((_, reject) => {
    onFailure = (err) => reject(err);
  });
  // Nothing may observe `failure` before `guard` races it, and an unobserved
  // rejection is a console error in its own right.
  failure.catch(() => {});

  const onError = (event: Event) => {
    const detail = (event as ErrorEvent).message;
    // Typed as a rasterise failure, not a bare Error, because this rejection is
    // raced against the parse. A plain error would be caught by the load
    // classifier and reported to the user as a damaged PDF, blaming their file
    // for our reader crashing is exactly the wrong answer.
    onFailure?.(
      new ResumeRasterizeError(
        "worker-unavailable",
        "The PDF reader stopped before your résumé was read, so nothing was analysed. Reload the page and try again." +
          (detail ? ` (${detail})` : ""),
      ),
    );
  };
  target.addEventListener("error", onError);

  const ready = new Promise<void>((resolve, reject) => {
    const settle = (fn: () => void) => {
      clearTimeout(timer);
      target.removeEventListener("message", onMessage);
      target.removeEventListener("error", onReadyError);
      fn();
    };
    const onMessage = () => settle(resolve);
    const onReadyError = (event: Event) =>
      settle(() =>
        reject(
          new Error((event as ErrorEvent).message || "worker failed to start"),
        ),
      );
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(new Error(`worker did not respond within ${timeoutMs}ms`)),
        ),
      timeoutMs,
    );
    // Attached in the same tick as `new Worker`, before the worker can post.
    target.addEventListener("message", onMessage);
    target.addEventListener("error", onReadyError);
  });

  return {
    ready,
    guard: <T>(work: Promise<T>) => Promise.race([work, failure]),
    dispose: () => target.removeEventListener("error", onError),
  };
}
