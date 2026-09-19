import { NextResponse } from "next/server";
import type { IntakeErrorKind } from "@/lib/intake/types";
import { intakeFromUrl } from "@/lib/intake/intake";
import { adapterCapabilities } from "@/lib/intake/adapters";
import { isFetchableUrlShape } from "@/lib/intake/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P1 job-link intake.
 *
 * The route PARSES ONLY. It never builds a campaign — the UI shows the user
 * what we read, they confirm or correct it, and only then does the existing
 * client-side campaign creation run. That review step is what turns a
 * placeholder into a user-provided fact, so skipping it would undo the whole
 * honesty contract.
 *
 * There is no feature flag here. Unlike Harvest there is no API key and no
 * per-call cost, so link intake is always on and there is no "disabled" state.
 */

/** Longest URL we will accept. Real posting URLs are far shorter. */
const MAX_URL_CHARS = 2048;

/**
 * HTTP status per failure reason.
 *
 * The BODY is always an `IntakeResult`, whatever the status, so the UI renders
 * the same way regardless and never has to parse an error string.
 */
const STATUS_BY_REASON: Record<IntakeErrorKind, number> = {
  "unsafe-url": 400,
  "unsupported-source": 422,
  blocked: 403,
  "not-found": 404,
  "rate-limited": 429,
  timeout: 504,
  unreadable: 422,
  upstream: 502,
};

/**
 * GET /api/intake — which boards we can read.
 *
 * A CAPABILITY list, not an availability gate: intake works for any URL, and
 * anything unrecognised falls to the generic adapter and then to paste.
 */
export function GET() {
  return NextResponse.json({ adapters: adapterCapabilities() });
}

/** POST /api/intake — read a job posting from a link. */
export async function POST(req: Request) {
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";

  if (!url) {
    return NextResponse.json(
      { error: "Paste a link to the job posting." },
      { status: 400 },
    );
  }
  if (url.length > MAX_URL_CHARS) {
    return NextResponse.json({ error: "That link is too long." }, { status: 413 });
  }
  // Cheap shape check before any network work. `fetch.ts` re-validates and
  // additionally resolves the host — this is not the security boundary.
  if (!isFetchableUrlShape(url)) {
    return NextResponse.json(
      { error: "That doesn't look like a job posting link. It should start with https://" },
      { status: 400 },
    );
  }

  // `intakeFromUrl` never throws — every failure is a shaped result.
  const result = await intakeFromUrl(url);

  return NextResponse.json(
    result,
    result.ok ? undefined : { status: STATUS_BY_REASON[result.reason] ?? 502 },
  );
}
