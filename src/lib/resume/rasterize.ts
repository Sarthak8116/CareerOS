/**
 * Résumé rasterisation — PDF pages to page images, IN THE BROWSER.
 *
 * WHY THIS EXISTS: Nemotron Parse cannot read a PDF. Measured against the live
 * API, not read from docs: plain text input returns 400 "The model does not
 * support text input", a PDF sent as base64 returns 400 "Supported formats:
 * JPEG, PNG, BMP, TIFF, WEBP", and a PNG data URL works. Claude read PDFs
 * natively; that capability is gone, so the résumé must become page images
 * before it reaches the model.
 *
 * WHY CLIENT-SIDE, AND WHY THIS MUST NOT BE "OPTIMISED" ONTO THE SERVER LATER:
 *  1. Privacy. The user's résumé — their address, their employment history —
 *     never leaves their machine as a document. Only the rendered pages of the
 *     résumé they chose to analyse are uploaded. This is the same reasoning
 *     behind client-side zipping in the package flow. Moving rasterisation to
 *     the server would quietly turn "your PDF stays with you" into a false
 *     statement, which is precisely the class of dishonesty this product
 *     exists to avoid.
 *  2. Canvas. The browser has a canvas natively. Rendering on the server would
 *     drag in @napi-rs/canvas (a native, platform-specific binary) as a real
 *     runtime dependency for zero user-visible benefit.
 *
 * WHAT THIS MODULE REFUSES TO DO: return a plausible-looking empty result. An
 * encrypted, corrupt, zero-page, or entirely blank-rendering PDF throws with a
 * message the user can act on. A résumé that reads as "we found nothing" is
 * worse than an error, because the user believes their evidence was considered.
 */

import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  defaultCreateWorker,
  watchWorker,
  WORKER_READY_TIMEOUT_MS,
} from "@/lib/resume/pdfWorker";
import { ResumeRasterizeError } from "@/lib/resume/errors";

export {
  ResumeRasterizeError,
  type ResumeRasterizeCode,
} from "@/lib/resume/errors";

/** One rendered page, in the shape `/api/campaign` accepts. */
export interface ResumePageImage {
  /** 1-based, contiguous from 1. */
  readonly pageNumber: number;
  /** Always `data:image/png;base64,…`. */
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

/** Why fewer pages were rendered than the PDF contains. */
export type TruncationReason = "page-cap" | "size-cap";

export interface RasterizedResume {
  readonly pages: readonly ResumePageImage[];
  /** Pages in the user's actual PDF, not the number rendered. */
  readonly totalPages: number;
  readonly truncated: boolean;
  readonly truncatedReason: TruncationReason | null;
}

/**
 * Page cap. Résumés are one or two pages; academic CVs run longer. Eight is
 * generous enough that a normal résumé is never clipped, and bounded enough
 * that the upload stays a couple of megabytes. When it bites, the caller is
 * told exactly how many of how many pages were read — a silently truncated
 * résumé means the analysis is missing evidence the user believes they gave us.
 */
export const MAX_RESUME_PAGES = 8;

/**
 * Render scale, measured rather than guessed. pdf.js scale 1 is 72 DPI. On a
 * dense real-world text page the base64 PNG costs roughly:
 *   scale 1.0  ( 72 DPI)  110 KB   — glyph strokes thin out; OCR starts guessing
 *   scale 1.5  (108 DPI)  176 KB
 *   scale 2.0  (144 DPI)  255 KB   <- chosen
 *   scale 2.5  (180 DPI)  318 KB
 *   scale 3.0  (216 DPI)  394 KB
 * 144 DPI is the knee: comfortably above the ~150 DPI floor document models
 * want for small type, while eight pages still fit in ~2 MB. Going higher buys
 * accuracy the model cannot use on 10pt text and costs payload linearly.
 */
export const RENDER_SCALE = 2;

/**
 * Long-edge clamp. RENDER_SCALE alone is unbounded — a poster-sized page would
 * render to a canvas large enough to hurt. 2200 px still covers US Letter and
 * A4 at the full scale above, so normal résumés are never downscaled.
 */
export const MAX_PAGE_EDGE_PX = 2200;

/**
 * Total base64 budget across all pages. Keeps the POST body well inside typical
 * serverless request limits even when every page is dense.
 */
export const MAX_TOTAL_BASE64_BYTES = 4_000_000;

/**
 * PNG, not JPEG. At scale 2 JPEG q0.9 saves about 25% (193 KB vs 255 KB) and
 * pays for it with ringing artifacts along glyph edges — exactly the signal a
 * text-extraction model depends on. A quarter less payload is not worth
 * degrading the only thing in the image that matters.
 */
const IMAGE_MIME = "image/png";
const PNG_DATA_URL_PREFIX = `data:${IMAGE_MIME};base64,`;

/**
 * The slice of a canvas this module uses. Narrow on purpose: it lets a test
 * supply a real off-DOM canvas implementation and still exercise the same
 * rendering code that ships.
 */
export interface RasterCanvas {
  width: number;
  height: number;
  getContext(contextId: "2d"): unknown;
  toDataURL(type?: string): string;
}

export type CanvasFactory = (width: number, height: number) => RasterCanvas;

/** The pdf.js surface this module uses. */
interface PdfjsModule {
  getDocument(src: Record<string, unknown>): {
    promise: Promise<PDFDocumentProxy>;
    destroy(): Promise<void>;
  };
  PDFWorker: new (params: { name?: string; port: unknown }) => {
    readonly port: unknown;
    destroy(): void;
  };
  PasswordException: new (...args: never[]) => Error;
}

/**
 * Test seams. Production passes none of these — the defaults below are what
 * actually ships, so a test that overrides only the canvas still exercises the
 * real pdf.js parse and render path.
 */
export interface RasterizeDeps {
  loadPdfjs?: () => Promise<PdfjsModule>;
  /**
   * Returns the Worker pdf.js should run in, or null to let pdf.js decide
   * (which it can only do sensibly under Node, where Workers are unavailable
   * and it runs in-process by design).
   */
  createWorker?: () => unknown | null;
  createCanvas?: CanvasFactory;
  /** How long to wait for the worker to announce itself before giving up. */
  workerReadyTimeoutMs?: number;
  /** Extra `getDocument` parameters. Used by tests for Node-only font paths. */
  documentOptions?: Record<string, unknown>;
}

export interface RasterizeOptions {
  maxPages?: number;
  deps?: RasterizeDeps;
}

/**
 * The legacy build, deliberately, in both the browser and tests. The modern
 * build calls `Promise.try`, which is absent from Node 22 and from browsers
 * older than roughly a year — a résumé upload is not the place to require a
 * bleeding-edge engine. Using it in tests too means the code under test is the
 * code that ships.
 */
async function defaultLoadPdfjs(): Promise<PdfjsModule> {
  return (await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  )) as unknown as PdfjsModule;
}

function defaultCreateCanvas(width: number, height: number): RasterCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function toBytes(
  source: File | Blob | ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return new Uint8Array(source);
  if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
  return new Uint8Array(await source.arrayBuffer());
}

/**
 * The `%PDF-` header may sit behind a few junk bytes; pdf.js tolerates that, so
 * we look in the same window rather than insisting on offset zero.
 */
function looksLikePdf(bytes: Uint8Array): boolean {
  const window = bytes.subarray(0, 1024);
  for (let i = 0; i + 4 < window.length; i++) {
    if (
      window[i] === 0x25 && // %
      window[i + 1] === 0x50 && // P
      window[i + 2] === 0x44 && // D
      window[i + 3] === 0x46 && // F
      window[i + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Turn a pdf.js load failure into something true and actionable. Never collapse
 * these into one message: "encrypted" and "corrupt" call for different actions
 * from the user, and saying the wrong one sends them off to fix the wrong thing.
 */
function classifyLoadError(err: unknown, pdfjs: PdfjsModule): never {
  if (err instanceof ResumeRasterizeError) throw err;
  // Match on the class where we can, and on the name as well: pdf.js runs its
  // parse in a worker, so an exception can arrive structurally cloned and fail
  // an `instanceof` that would hold in-process.
  const name = err instanceof Error ? err.name : "";
  if (err instanceof pdfjs.PasswordException || name === "PasswordException") {
    throw new ResumeRasterizeError(
      "encrypted",
      "That PDF is password-protected, so its pages cannot be read. Re-save or export it without a password and upload it again.",
    );
  }
  throw new ResumeRasterizeError(
    "corrupt",
    "That PDF could not be opened — the file looks damaged or incomplete. Try re-exporting it and uploading again.",
  );
}

/** True when any pixel departs from the white background we painted. */
function hasInk(context: CanvasRenderingContext2D, canvas: RasterCanvas) {
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  // Step a whole pixel at a time; a threshold rather than an equality test so
  // antialiased near-white edges still count as ink.
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) return true;
  }
  return false;
}

async function renderPage(
  page: PDFPageProxy,
  createCanvas: CanvasFactory,
): Promise<{ image: Omit<ResumePageImage, "pageNumber">; inked: boolean }> {
  const base = page.getViewport({ scale: RENDER_SCALE });
  const longEdge = Math.max(base.width, base.height);
  const clamp = longEdge > MAX_PAGE_EDGE_PX ? MAX_PAGE_EDGE_PX / longEdge : 1;
  const viewport =
    clamp === 1 ? base : page.getViewport({ scale: RENDER_SCALE * clamp });

  const width = Math.max(1, Math.ceil(viewport.width));
  const height = Math.max(1, Math.ceil(viewport.height));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d") as CanvasRenderingContext2D | null;
  if (!context) {
    throw new ResumeRasterizeError(
      "render-failed",
      "Your browser could not open a canvas to render the résumé. Try a different browser.",
    );
  }

  // Paint the page white first. PDF pages have no background of their own, and
  // a transparent PNG would reach the model as black-on-black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context,
    viewport,
    background: "#ffffff",
    intent: "display",
  }).promise;

  const inked = hasInk(context, canvas);
  const dataUrl = canvas.toDataURL(IMAGE_MIME);
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new ResumeRasterizeError(
      "render-failed",
      "The résumé pages could not be encoded as images. Try a different browser.",
    );
  }
  return { image: { dataUrl, width, height }, inked };
}

/**
 * Render a résumé PDF to page images.
 *
 * Throws {@link ResumeRasterizeError} with a user-safe `message` rather than
 * returning an empty or partial-looking success.
 */
export async function rasterizeResumePdf(
  source: File | Blob | ArrayBuffer | Uint8Array,
  options: RasterizeOptions = {},
): Promise<RasterizedResume> {
  const deps = options.deps ?? {};
  const loadPdfjs = deps.loadPdfjs ?? defaultLoadPdfjs;
  const createWorker = deps.createWorker ?? defaultCreateWorker;
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas;
  const maxPages = Math.max(1, options.maxPages ?? MAX_RESUME_PAGES);

  const bytes = await toBytes(source);
  if (bytes.length === 0) {
    throw new ResumeRasterizeError(
      "empty-file",
      "That file is empty — there are no pages to read. Please upload your résumé PDF again.",
    );
  }
  if (!looksLikePdf(bytes)) {
    throw new ResumeRasterizeError(
      "not-a-pdf",
      "That file isn't a PDF. Please upload your résumé as a PDF.",
    );
  }

  const pdfjs = await loadPdfjs();

  let port: unknown = null;
  try {
    port = createWorker();
  } catch (err) {
    throw new ResumeRasterizeError(
      "worker-unavailable",
      "Your browser could not start the PDF reader. Reload the page and try again." +
        (err instanceof Error ? ` (${err.message})` : ""),
    );
  }

  const watch = watchWorker(
    port,
    deps.workerReadyTimeoutMs ?? WORKER_READY_TIMEOUT_MS,
  );

  let worker: InstanceType<PdfjsModule["PDFWorker"]> | null = null;
  if (port) {
    try {
      await watch.ready;
    } catch (err) {
      watch.dispose();
      (port as Worker).terminate?.();
      throw new ResumeRasterizeError(
        "worker-unavailable",
        "The PDF reader could not start in your browser, so your résumé was not read. Reload the page and try again." +
          (err instanceof Error ? ` (${err.message})` : ""),
      );
    }

    worker = new pdfjs.PDFWorker({ name: "careeros-resume", port });
    // Guard against a future edit dropping the port: pdf.js would then resolve
    // `workerSrc` itself and may quietly fall back to the main thread.
    if (worker.port !== port) {
      watch.dispose();
      throw new ResumeRasterizeError(
        "worker-unavailable",
        "The PDF reader did not start in its own worker. Reload the page and try again.",
      );
    }
  }

  const task = pdfjs.getDocument({
    // pdf.js transfers the buffer it is given; `toBytes` already copied, so the
    // caller's File/ArrayBuffer is never detached under them.
    data: bytes,
    isEvalSupported: false,
    ...(worker ? { worker } : {}),
    ...(deps.documentOptions ?? {}),
  });

  let doc: PDFDocumentProxy;
  try {
    doc = await watch.guard(task.promise);
  } catch (err) {
    classifyLoadError(err, pdfjs);
  }

  try {
    const totalPages = doc.numPages;
    if (!Number.isFinite(totalPages) || totalPages < 1) {
      throw new ResumeRasterizeError(
        "no-pages",
        "That PDF has no pages, so there was nothing to read. Please upload your résumé again.",
      );
    }

    const pages: ResumePageImage[] = [];
    let truncatedReason: TruncationReason | null =
      totalPages > maxPages ? "page-cap" : null;
    let budget = 0;
    let anyInk = false;

    const limit = Math.min(totalPages, maxPages);
    for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
      const page = await watch.guard(doc.getPage(pageNumber));
      let rendered;
      try {
        rendered = await watch.guard(renderPage(page, createCanvas));
      } finally {
        page.cleanup();
      }

      // Stop before the body grows past what a request can carry — but never
      // before there is a first page, or we would return nothing at all.
      if (
        pages.length > 0 &&
        budget + rendered.image.dataUrl.length > MAX_TOTAL_BASE64_BYTES
      ) {
        truncatedReason = "size-cap";
        break;
      }

      budget += rendered.image.dataUrl.length;
      anyInk ||= rendered.inked;
      pages.push({ pageNumber, ...rendered.image });
    }

    if (!anyInk) {
      throw new ResumeRasterizeError(
        "blank-render",
        `Every page of that PDF rendered blank (${pages.length} page${pages.length === 1 ? "" : "s"} checked), so there is nothing for the analysis to read. If it is a scan, try re-exporting it; if it opens normally elsewhere, it may use a feature this reader does not support.`,
      );
    }

    return {
      pages,
      totalPages,
      truncated: pages.length < totalPages,
      truncatedReason: pages.length < totalPages ? truncatedReason : null,
    };
  } finally {
    watch.dispose();
    await task.destroy().catch(() => {});
    worker?.destroy();
    if (port && typeof (port as Worker).terminate === "function") {
      (port as Worker).terminate();
    }
  }
}

/**
 * The sentence shown to the user when only part of their résumé was read. It
 * names both numbers on purpose: "we read 8 of 14 pages" is a fact they can act
 * on, "your résumé was processed" is not.
 */
export function truncationNotice(result: RasterizedResume): string | null {
  if (!result.truncated) return null;
  const read = `Read ${result.pages.length} of ${result.totalPages} pages.`;
  return result.truncatedReason === "size-cap"
    ? `${read} The remaining pages were left out because the upload would have been too large. Anything on them is not part of this analysis.`
    : `${read} CareerOS reads at most ${MAX_RESUME_PAGES} pages of a résumé. Anything after page ${result.pages.length} is not part of this analysis.`;
}
