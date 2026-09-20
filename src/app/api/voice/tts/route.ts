import { NextResponse } from "next/server";
import {
  MAX_TTS_CHARS,
  synthesizeSpeech,
  voiceAvailable,
  voiceSafeMessage,
} from "@/lib/voice/elevenlabs";
import { liveModeAvailable } from "@/lib/live/nemotron";

export const runtime = "nodejs";

/** GET — which spoken-interview capabilities are configured? */
export function GET() {
  return NextResponse.json({ voice: voiceAvailable(), grading: liveModeAvailable() });
}

/** POST { text } → MP3 of an interviewer reading it. */
export async function POST(req: Request) {
  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Nothing to read aloud." }, { status: 400 });
  if (text.length > MAX_TTS_CHARS * 2) {
    return NextResponse.json({ error: "That text is too long to read aloud." }, { status: 413 });
  }
  if (!voiceAvailable()) {
    return NextResponse.json({ error: voiceSafeMessage(null) }, { status: 503 });
  }
  try {
    const audio = await synthesizeSpeech(text);
    return new NextResponse(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json({ error: voiceSafeMessage(err) }, { status: 502 });
  }
}
