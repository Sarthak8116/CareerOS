import { NextResponse } from "next/server";
import { z } from "zod";
import { buildLiveCampaign } from "@/lib/live/campaign";
import {
  liveModeAvailable,
} from "@/lib/live/nemotron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARS = 24000;
const MAX_PAGES = 8;
/** Decoded image bytes across the whole résumé. */
const MAX_TOTAL_BYTES = 6 * 1024 * 1024;

/** GET /api/campaign, is live mode configured? (the intake page checks this) */
export function GET() {
  return NextResponse.json({ live: liveModeAvailable() });
}

/**
 * The résumé arrives as PAGE IMAGES, not a PDF: nemotron-parse rejects PDFs
 * outright, so pages are rasterised in the browser with pdfjs-dist. The user's
 * PDF file therefore never leaves their machine.
 *
 * PNG only. The client renders PNG exclusively, so anything else either did not
 * come from it or was relabelled on the way, either way it is rejected rather
 * than forwarded to an external API.
 */
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

const ResumePage = z.object({
  pageNumber: z.number().int().positive(),
  dataUrl: z.string().regex(PNG_DATA_URL),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const Body = z.object({
  jobText: z.string(),
  resume: z.object({
    pages: z.array(ResumePage).min(1).max(MAX_PAGES),
    /** Pages in the user's actual PDF, which may exceed what was sent. */
    totalPages: z.number().int().positive(),
    // Advisory only, truncation is DERIVED below so the two cannot diverge.
    truncated: z.boolean().nullish(),
    truncatedReason: z.enum(["page-cap", "size-cap"]).nullish(),
  }),
});

/**
 * The `data:image/png` prefix is a claim; the magic bytes are the proof.
 * 12 base64 characters decode to 9 bytes, enough for the 8-byte signature.
 */
function hasPngSignature(dataUrl: string): boolean {
  const comma = dataUrl.indexOf(",") + 1;
  const head = Buffer.from(dataUrl.slice(comma, comma + 12), "base64");
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return head.length >= 8 && PNG.every((byte, i) => head[i] === byte);
}

/** POST /api/campaign, build a real campaign from a résumé + job posting. */
/**
 * A live run is five model calls, each with its own timeout and retries. When
 * NVIDIA's shared endpoints are congested those can stack into a request that
 * never answers (one test run hung for 19 minutes). The user gets a clear
 * answer inside a fixed budget instead.
 */
const OVERALL_BUDGET_MS = 270_000;

class BudgetExceeded extends Error {}

function withDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BudgetExceeded()), OVERALL_BUDGET_MS);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export async function POST(req: Request) {
  if (!liveModeAvailable()) {
    return NextResponse.json(
      {
        error:
          // Names the variable explicitly: the intake page's banner tells the
          // user this message carries the exact name, so it has to.
          "Live mode is off. Set NVIDIA_API_KEY_PARSE (or NVIDIA_API_KEY) in .env.local and restart the server to run real jobs.",
      },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Please upload your résumé as a PDF, its pages did not arrive as readable images.",
      },
      { status: 400 },
    );
  }

  const { resume } = parsed.data;
  const jobText = parsed.data.jobText.trim();

  // Pages must be ordered and contiguous from 1: a gap means the analysis
  // would silently skip a page the user believes was read.
  if (!resume.pages.every((page, i) => page.pageNumber === i + 1)) {
    return NextResponse.json(
      { error: "Those résumé pages arrived out of order. Please try again." },
      { status: 400 },
    );
  }
  if (!resume.pages.every((page) => hasPngSignature(page.dataUrl))) {
    return NextResponse.json(
      { error: "Those résumé pages are not readable images." },
      { status: 400 },
    );
  }
  if (resume.totalPages < resume.pages.length) {
    return NextResponse.json(
      { error: "That résumé's page count did not add up. Please try again." },
      { status: 400 },
    );
  }

  const bytes = resume.pages.reduce(
    (sum, page) => sum + Math.floor((page.dataUrl.length * 3) / 4),
    0,
  );
  if (bytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Those résumé page images are too large." },
      { status: 413 },
    );
  }

  if (jobText.length < 40) {
    return NextResponse.json(
      { error: "Please paste the full job description." },
      { status: 400 },
    );
  }

  try {
    const result = await withDeadline(buildLiveCampaign({
      resume: {
        pages: resume.pages.map((page) => page.dataUrl),
        totalPages: resume.totalPages,
        // DERIVED, never read from the body: if the client's flag and its own
        // page list ever disagreed, the flag is what would quietly be wrong.
        truncated: resume.pages.length < resume.totalPages,
      },
      jobText: jobText.slice(0, MAX_CHARS),
      // Deterministic-friendly stamp passed from the server clock.
      createdAt: new Date().toISOString(),
    }));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BudgetExceeded) {
      return NextResponse.json(
        {
          error:
            "NVIDIA's models are taking too long right now, which usually means their shared servers are busy. Nothing was saved. Try again in a few minutes.",
        },
        { status: 504 },
      );
    }
    const message =
      err instanceof Error ? err.message : "Live analysis failed unexpectedly.";
    // Don't leak internals (or a key); return a concise, user-safe message.
    const safe = /api key|401|403|authentication/i.test(message)
      ? "Authentication failed, check your NVIDIA API key."
      : /\b429\b|rate.?limit/i.test(message)
        ? "Rate limited by the model API, try again shortly."
        : /returned 50[234]\b|overloaded|request limit/i.test(message)
          ? "NVIDIA's models are overloaded right now. Nothing was saved. Try again in a few minutes."
          : /could not read/i.test(message)
          ? "CareerOS could not read that résumé. Try re-exporting the PDF and uploading it again."
          : "Live analysis failed. The model may have returned an unexpected result; try again.";
    // In development only, include the (already key-scrubbed) cause so a
    // failing live run can be diagnosed. Production responses stay generic.
    const detail =
      process.env.NODE_ENV !== "production" ? { detail: message.slice(0, 1200) } : {};
    return NextResponse.json({ error: safe, ...detail }, { status: 502 });
  }
}
