import "server-only";

/**
 * SERVER-ONLY ElevenLabs access for the spoken mock interview.
 *
 *  - Text-to-speech reads a question aloud in an interviewer voice.
 *  - Scribe (speech-to-text) transcribes the candidate's spoken answer.
 *
 * Same guard as the other providers: the key is read from the environment,
 * never reaches the browser, is never logged, and is scrubbed from any error.
 * With no key set, voice is simply off and the interview stays text-only.
 */

const BASE = "https://api.elevenlabs.io/v1";

/** "George", a calm, measured premade voice. Override with ELEVENLABS_VOICE_ID. */
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const TTS_MODEL = "eleven_flash_v2_5";
const STT_MODEL = "scribe_v1";

export const MAX_TTS_CHARS = 1200;
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

export type VoiceErrorKind = "disabled" | "auth" | "rate-limited" | "timeout" | "upstream";

export class VoiceError extends Error {
  readonly kind: VoiceErrorKind;
  constructor(kind: VoiceErrorKind, message: string) {
    super(message);
    this.name = "VoiceError";
    this.kind = kind;
  }
}

function apiKey(): string {
  return (process.env.ELEVENLABS_API_KEY ?? "").trim();
}

export function voiceAvailable(): boolean {
  return apiKey().length > 0;
}

async function call(path: string, init: RequestInit): Promise<Response> {
  const key = apiKey();
  if (!key) throw new VoiceError("disabled", "Voice is not configured.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), "xi-api-key": key },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw err instanceof Error && err.name === "AbortError"
      ? new VoiceError("timeout", "The voice service took too long.")
      : new VoiceError("upstream", "The voice service could not be reached.");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Read and discard: a raw provider payload is never surfaced.
    await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new VoiceError("auth", "Voice authentication failed.");
    }
    if (res.status === 429) throw new VoiceError("rate-limited", "Voice is rate limited.");
    throw new VoiceError("upstream", "The voice service returned an error.");
  }
  return res;
}

/** Speak `text`. Returns MP3 bytes. */
export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const voice = (process.env.ELEVENLABS_VOICE_ID ?? "").trim() || DEFAULT_VOICE_ID;
  const res = await call(
    `/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: text.slice(0, MAX_TTS_CHARS), model_id: TTS_MODEL }),
    },
  );
  return res.arrayBuffer();
}

/** Transcribe recorded audio with Scribe. Returns plain text (may be empty). */
export async function transcribeSpeech(audio: Blob): Promise<string> {
  const form = new FormData();
  form.set("model_id", STT_MODEL);
  form.set("file", audio, "answer.webm");
  const res = await call("/speech-to-text", { method: "POST", body: form });
  const data: unknown = await res.json().catch(() => null);
  const text = (data as { text?: unknown } | null)?.text;
  if (typeof text !== "string") {
    throw new VoiceError("upstream", "The voice service returned an unexpected shape.");
  }
  return text.trim();
}

/** A concise, user-safe message. Never leaks the key or a provider payload. */
export function voiceSafeMessage(err: unknown): string {
  if (err instanceof VoiceError) {
    switch (err.kind) {
      case "disabled":
        return "Voice is off. Set ELEVENLABS_API_KEY in .env.local and restart.";
      case "auth":
        return "Voice authentication failed, check ELEVENLABS_API_KEY.";
      case "rate-limited":
        return "The voice service is rate limiting us, try again shortly.";
      case "timeout":
        return "The voice service took too long, try again.";
      default:
        return "The voice service failed. You can still type your answer.";
    }
  }
  return "The voice service failed. You can still type your answer.";
}
