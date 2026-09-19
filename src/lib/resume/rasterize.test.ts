// @vitest-environment node
/**
 * These tests run the real pdf.js parse and render path. The only thing
 * substituted is the canvas, because jsdom has none — @napi-rs/canvas (already
 * present as a pdfjs-dist optional dependency) stands in for the browser's.
 *
 * Every image assertion decodes the bytes the module actually produced and
 * inspects them: PNG magic bytes, the dimensions recorded in the IHDR chunk,
 * and the pixels after decoding. A test that only checks a string starts with
 * "data:image/png" has not looked at an image at all, and would pass just as
 * happily on a blank canvas.
 */

import { describe, it, expect } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { tinyPdf, inkRectangles } from "@/test/tinyPdf";
import {
  rasterizeResumePdf,
  truncationNotice,
  ResumeRasterizeError,
  MAX_RESUME_PAGES,
  RENDER_SCALE,
  MAX_PAGE_EDGE_PX,
  type RasterCanvas,
  type RasterizeDeps,
} from "@/lib/resume/rasterize";

/**
 * Under Node, pdf.js has no Worker and runs in-process by design; `null` tells
 * the module to let it. The browser default builds a real module Worker.
 */
const deps: RasterizeDeps = {
  createWorker: () => null,
  createCanvas: (width, height) =>
    createCanvas(width, height) as unknown as RasterCanvas,
};

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function decodeDataUrl(dataUrl: string): Buffer {
  const [header, payload] = dataUrl.split(",");
  expect(header).toBe("data:image/png;base64");
  return Buffer.from(payload, "base64");
}

/** Count pixels that are not the white background, by decoding the PNG. */
async function darkPixels(dataUrl: string): Promise<number> {
  const image = await loadImage(decodeDataUrl(dataUrl));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 128 && data[i + 1] < 128 && data[i + 2] < 128) dark++;
  }
  return dark;
}

/**
 * A stand-in worker port that answers the liveness probe the way pdf.js's real
 * worker does — one "ready" message as soon as anything listens — and then
 * stays silent, so the operation is still in flight when the test kills it.
 */
function messageAnsweringPort() {
  const handlers = new Map<string, Set<(event: unknown) => void>>();
  let answered = false;
  return {
    postMessage: () => {},
    terminate: () => {},
    addEventListener(type: string, fn: (event: unknown) => void) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(fn);
      // Only the probe, which attaches first, gets the greeting.
      if (type === "message" && !answered) {
        answered = true;
        setTimeout(() => fn({ data: { targetName: "main", action: "ready" } }), 0);
      }
    },
    removeEventListener(type: string, fn: (event: unknown) => void) {
      handlers.get(type)?.delete(fn);
    },
    emit(type: string, event: unknown) {
      for (const fn of [...(handlers.get(type) ?? [])]) fn(event);
    },
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the rasteriser to throw").toBeInstanceOf(
    ResumeRasterizeError,
  );
  expect((err as ResumeRasterizeError).code).toBe(code);
  // Every failure must carry something the user can act on, not a stack trace.
  expect((err as ResumeRasterizeError).message.length).toBeGreaterThan(30);
  return err as ResumeRasterizeError;
}

describe("rasterizeResumePdf — the bytes it produces", () => {
  it("renders every page as a decodable PNG at the declared size", async () => {
    const result = await rasterizeResumePdf(tinyPdf({ pages: 3 }), { deps });

    expect(result.totalPages).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.truncatedReason).toBeNull();
    expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);

    for (const page of result.pages) {
      const bytes = decodeDataUrl(page.dataUrl);

      // Magic bytes: this is a PNG, not a base64 blob that merely claims to be.
      expect([...bytes.subarray(0, 8)]).toEqual(PNG_MAGIC);
      // Bytes 12-16 are the chunk type of the first chunk, which must be IHDR.
      expect(bytes.subarray(12, 16).toString("latin1")).toBe("IHDR");
      // The dimensions inside the file must match what we told the server.
      expect(bytes.readUInt32BE(16)).toBe(page.width);
      expect(bytes.readUInt32BE(20)).toBe(page.height);
      // 612x792pt at scale 2 — the page geometry, not a hard-coded guess.
      expect(page.width).toBe(612 * RENDER_SCALE);
      expect(page.height).toBe(792 * RENDER_SCALE);
      expect(page.width).toBeLessThanOrEqual(MAX_PAGE_EDGE_PX);
      expect(page.height).toBeLessThanOrEqual(MAX_PAGE_EDGE_PX);
    }
  });

  it("renders each page's own content, not the same page repeated", async () => {
    const result = await rasterizeResumePdf(tinyPdf({ pages: 3 }), { deps });

    // The fixture draws N rectangles on page N, so ink must climb page by page.
    // Identical counts would mean one page rendered three times; a flat zero
    // would mean three blank canvases that still pass a "looks like a PNG" check.
    const counts = await Promise.all(
      result.pages.map((page) => darkPixels(page.dataUrl)),
    );
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);

    // Each rectangle is 160x60pt at scale 2 = 320x120 = 38,400 px. Allow a
    // little slack for antialiasing at the edges, but hold the module to
    // roughly the right amount of ink rather than merely "some".
    const perRectangle = 160 * RENDER_SCALE * 60 * RENDER_SCALE;
    result.pages.forEach((page, index) => {
      const expected = perRectangle * inkRectangles(page.pageNumber);
      expect(counts[index]).toBeGreaterThan(expected * 0.95);
      expect(counts[index]).toBeLessThan(expected * 1.05);
    });

    // And the encoded bytes themselves differ page to page.
    const unique = new Set(result.pages.map((p) => p.dataUrl));
    expect(unique.size).toBe(3);
  });

  it("accepts a File and an ArrayBuffer, and leaves the caller's buffer intact", async () => {
    const bytes = tinyPdf({ pages: 1 });
    const buffer = bytes.buffer.slice(0) as ArrayBuffer;

    const fromArrayBuffer = await rasterizeResumePdf(buffer, { deps });
    expect(fromArrayBuffer.pages).toHaveLength(1);
    // pdf.js transfers the buffer it is handed; the module copies first, so the
    // caller's ArrayBuffer must still be usable afterwards.
    expect(buffer.byteLength).toBe(bytes.length);

    const file = new File([bytes as unknown as BlobPart], "resume.pdf", {
      type: "application/pdf",
    });
    const fromFile = await rasterizeResumePdf(file, { deps });
    expect(fromFile.pages).toHaveLength(1);
    expect(fromFile.pages[0].dataUrl).toBe(fromArrayBuffer.pages[0].dataUrl);
  });
});

describe("rasterizeResumePdf — truncation is reported, never silent", () => {
  it("stops at the page cap and says so with both numbers", async () => {
    const result = await rasterizeResumePdf(tinyPdf({ pages: 12 }), {
      maxPages: 4,
      deps,
    });

    expect(result.pages).toHaveLength(4);
    expect(result.totalPages).toBe(12);
    expect(result.truncated).toBe(true);
    expect(result.truncatedReason).toBe("page-cap");

    const notice = truncationNotice(result);
    expect(notice).toContain("4 of 12");
    expect(notice).toContain("not part of this analysis");
  });

  it("defaults the cap to MAX_RESUME_PAGES", async () => {
    const result = await rasterizeResumePdf(
      tinyPdf({ pages: MAX_RESUME_PAGES + 2 }),
      { deps },
    );
    expect(result.pages).toHaveLength(MAX_RESUME_PAGES);
    expect(result.totalPages).toBe(MAX_RESUME_PAGES + 2);
    expect(result.truncated).toBe(true);
  });

  it("says nothing when the whole résumé was read", async () => {
    const result = await rasterizeResumePdf(tinyPdf({ pages: 2 }), { deps });
    expect(result.truncated).toBe(false);
    expect(truncationNotice(result)).toBeNull();
  });
});

describe("rasterizeResumePdf — failures are honest, not empty", () => {
  it("refuses an empty file", async () => {
    await expectCode(
      rasterizeResumePdf(new Uint8Array(0), { deps }),
      "empty-file",
    );
  });

  it("refuses a file that is not a PDF", async () => {
    const notPdf = new TextEncoder().encode("hello, this is a text file");
    await expectCode(rasterizeResumePdf(notPdf, { deps }), "not-a-pdf");
  });

  it("reports a corrupt PDF as corrupt", async () => {
    const truncated = tinyPdf({ pages: 2 }).subarray(0, 90);
    const err = await expectCode(
      rasterizeResumePdf(truncated, { deps }),
      "corrupt",
    );
    expect(err.message).toMatch(/damaged or incomplete/i);
  });

  it("reports a password-protected PDF as encrypted, not corrupt", async () => {
    const err = await expectCode(
      rasterizeResumePdf(tinyPdf({ pages: 1, encrypted: true }), { deps }),
      "encrypted",
    );
    expect(err.message).toMatch(/password/i);
  });

  it("refuses a PDF whose pages all render blank", async () => {
    // The dangerous case: parsing succeeds, pages exist, and every canvas comes
    // back white. Returning that would tell the user we read their résumé and
    // found nothing in it.
    const err = await expectCode(
      rasterizeResumePdf(tinyPdf({ pages: 2, blank: true }), { deps }),
      "blank-render",
    );
    expect(err.message).toMatch(/blank/i);
  });

  it("refuses to run on the main thread when the worker cannot start", async () => {
    const err = await expectCode(
      rasterizeResumePdf(tinyPdf({ pages: 1 }), {
        deps: {
          ...deps,
          createWorker: () => {
            throw new Error("module workers unavailable");
          },
        },
      }),
      "worker-unavailable",
    );
    expect(err.message).toMatch(/module workers unavailable/);
  });

  it("refuses a worker that boots but never answers, instead of hanging", async () => {
    // The failure that motivated the liveness probe: a worker that constructs
    // fine and then dies on its first chunk load. Without the probe, pdf.js
    // waits for a reply that never comes and the upload spins forever.
    const silentWorker = {
      addEventListener: () => {},
      removeEventListener: () => {},
      terminate: () => {},
    };
    const err = await expectCode(
      rasterizeResumePdf(tinyPdf({ pages: 1 }), {
        deps: {
          ...deps,
          createWorker: () => silentWorker,
          workerReadyTimeoutMs: 40,
        },
      }),
      "worker-unavailable",
    );
    expect(err.message).toMatch(/did not respond within 40ms/);
  });

  it("blames the reader, not the résumé, when the worker dies mid-parse", async () => {
    // A worker that announces itself, is handed the PDF, and then dies. The
    // probe must pass (otherwise this fails as a timeout instead), and the
    // death must surface as a reader failure. Reporting it as a corrupt PDF
    // would send the user off to re-export a file that was never the problem.
    const port = messageAnsweringPort();
    const promise = rasterizeResumePdf(tinyPdf({ pages: 1 }), {
      deps: { ...deps, createWorker: () => port, workerReadyTimeoutMs: 5000 },
    });
    setTimeout(() => port.emit("error", { message: "chunk load failed" }), 50);

    const err = await expectCode(promise, "worker-unavailable");
    expect(err.message).toMatch(/chunk load failed/);
    expect(err.message).not.toMatch(/did not respond/);
    expect(err.message).not.toMatch(/damaged/);
  });

  it("refuses when the canvas has no 2d context", async () => {
    await expectCode(
      rasterizeResumePdf(tinyPdf({ pages: 1 }), {
        deps: {
          ...deps,
          createCanvas: (width, height) => ({
            width,
            height,
            getContext: () => null,
            toDataURL: () => "",
          }),
        },
      }),
      "render-failed",
    );
  });

  it("refuses when the canvas encodes something other than PNG", async () => {
    await expectCode(
      rasterizeResumePdf(tinyPdf({ pages: 1 }), {
        deps: {
          ...deps,
          createCanvas: (width, height) => {
            const canvas = createCanvas(width, height);
            return {
              width,
              height,
              getContext: (id: "2d") => canvas.getContext(id),
              toDataURL: () => canvas.toDataURL("image/jpeg"),
            } as unknown as RasterCanvas;
          },
        },
      }),
      "render-failed",
    );
  });
});
