import { NextResponse } from "next/server";
import { z } from "zod";
import { Candidate, Job } from "@/lib/types";
import { liveModeAvailable } from "@/lib/live/nemotron";
import { generateCoverLetterLive } from "@/lib/package/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/package/cover-letter, draft a cover letter with the live model.
 *
 * The candidate and job live in the browser's store, so they arrive in the
 * request body and are validated here at the boundary before anything reads
 * them. A 503 is the SUPPORTED path, not an error state: without a key the
 * client falls back to the deterministic evidence-assembled letter that
 * `buildApplicationPackage` produces on its own.
 */

const Body = z.object({ candidate: Candidate, job: Job });

export function GET() {
  return NextResponse.json({ live: liveModeAvailable() });
}

export async function POST(req: Request) {
  if (!liveModeAvailable()) {
    return NextResponse.json(
      {
        error:
          "Live mode is off. CareerOS will assemble the letter from your evidence instead.",
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
      { error: "Request did not match the expected candidate/job shape." },
      { status: 400 },
    );
  }

  try {
    const draft = await generateCoverLetterLive(parsed.data);
    return NextResponse.json({ draft });
  } catch (err) {
    // Never leak internals (or the key) into a client-visible message.
    const message = err instanceof Error ? err.message : "";
    const safe = /api key|401|403|authentication/i.test(message)
      ? "Authentication failed, check your NVIDIA API key."
      : /\b429\b|rate.?limit/i.test(message)
        ? "Rate limited by the model API, try again shortly."
        : "The model did not return a usable draft. CareerOS can assemble one from your evidence instead.";
    return NextResponse.json({ error: safe }, { status: 502 });
  }
}
