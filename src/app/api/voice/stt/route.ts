import { NextResponse } from "next/server";
import {
  VoiceError,
  MAX_AUDIO_BYTES,
  transcribeSpeech,
  voiceAvailable,
  voiceSafeMessage,
} from "@/lib/voice/elevenlabs";
import { sanitizeUntrusted } from "@/lib/security/untrusted";

export const runtime = "nodejs";

/** POST multipart { audio } → { text }. The recording is not stored. */
export async function POST(req: Request) {
  if (!voiceAvailable()) {
    return NextResponse.json({ error: voiceSafeMessage(new VoiceError("disabled", "")) }, { status: 503 });
  }
  let audio: FormDataEntryValue | null;
  try {
    audio = (await req.formData()).get("audio");
  } catch {
    return NextResponse.json({ error: "Expected a recorded answer." }, { status: 400 });
  }
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "That recording was empty — try again." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "That recording is too long. Keep answers under a few minutes." }, { status: 413 });
  }
  if (audio.type && !/^(audio|video)\//.test(audio.type)) {
    return NextResponse.json({ error: "That file is not audio." }, { status: 415 });
  }
  try {
    const text = await transcribeSpeech(audio);
    // A transcript is text of unknown content like any other input.
    return NextResponse.json({ text: sanitizeUntrusted(text).clean.slice(0, 8000) });
  } catch (err) {
    return NextResponse.json({ error: voiceSafeMessage(err) }, { status: 502 });
  }
}
