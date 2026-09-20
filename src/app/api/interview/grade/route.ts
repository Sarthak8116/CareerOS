import { NextResponse } from "next/server";
import { z } from "zod";
import { gradeAnswer } from "@/lib/live/grade";
import { liveModeAvailable } from "@/lib/live/nemotron";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  question: z.string().min(1).max(3000),
  answer: z.string().min(1).max(12000),
  answerHints: z.array(z.string().max(600)).max(12).default([]),
  evidenceToUse: z.array(z.string().max(600)).max(12).default([]),
});

/** POST → { strengths, missing, strongerAnswer } graded by nemotron-3-super. */
export async function POST(req: Request) {
  if (!liveModeAvailable()) {
    return NextResponse.json({ error: "Model grading is off — no NVIDIA key is configured." }, { status: 503 });
  }
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid grading request." }, { status: 400 });
  }
  try {
    return NextResponse.json({ evaluation: await gradeAnswer(parsed.data) });
  } catch {
    // The caller falls back to the offline heuristic; no provider text leaks.
    return NextResponse.json({ error: "The grader failed. Showing offline feedback instead." }, { status: 502 });
  }
}
