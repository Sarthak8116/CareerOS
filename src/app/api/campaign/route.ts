import { NextResponse } from "next/server";
import { buildLiveCampaign } from "@/lib/live/campaign";
import { liveModeAvailable, LIVE_MODEL } from "@/lib/live/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARS = 24000;

/** GET /api/campaign — is live mode configured? (the intake page checks this) */
export function GET() {
  return NextResponse.json({ live: liveModeAvailable(), model: LIVE_MODEL });
}

/** POST /api/campaign — build a real campaign from a résumé + job posting. */
export async function POST(req: Request) {
  if (!liveModeAvailable()) {
    return NextResponse.json(
      {
        error:
          "Live mode is off. Add ANTHROPIC_API_KEY to .env.local and restart the server to run real jobs.",
      },
      { status: 503 },
    );
  }

  let body: { resumePdfBase64?: unknown; jobText?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const resumePdfBase64 =
    typeof body.resumePdfBase64 === "string" ? body.resumePdfBase64 : "";
  const jobText = typeof body.jobText === "string" ? body.jobText.trim() : "";

  if (!resumePdfBase64 || resumePdfBase64.length < 100) {
    return NextResponse.json(
      { error: "Please upload your résumé as a PDF." },
      { status: 400 },
    );
  }
  // base64 length ≈ 1.37× bytes; cap the raw PDF at ~8 MB.
  if (resumePdfBase64.length > 11_500_000) {
    return NextResponse.json(
      { error: "That PDF is too large (max ~8 MB)." },
      { status: 413 },
    );
  }
  // Verify it's actually a PDF by checking the %PDF magic bytes.
  try {
    const head = Buffer.from(resumePdfBase64.slice(0, 16), "base64").toString(
      "latin1",
    );
    if (!head.startsWith("%PDF")) {
      return NextResponse.json(
        { error: "That file doesn't look like a PDF. Please upload a PDF résumé." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not read the uploaded file." },
      { status: 400 },
    );
  }
  if (jobText.length < 40) {
    return NextResponse.json(
      { error: "Please paste the full job description." },
      { status: 400 },
    );
  }

  try {
    const campaign = await buildLiveCampaign({
      resumePdfBase64,
      jobText: jobText.slice(0, MAX_CHARS),
      // Deterministic-friendly stamp passed from the server clock.
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ campaign });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Live analysis failed unexpectedly.";
    // Don't leak internals; return a concise, user-safe message.
    const safe = /api key|401|authentication/i.test(message)
      ? "Authentication failed — check ANTHROPIC_API_KEY."
      : /rate|429/i.test(message)
        ? "Rate limited by the model API — try again shortly."
        : "Live analysis failed. The model may have returned an unexpected result; try again.";
    return NextResponse.json({ error: safe }, { status: 502 });
  }
}
