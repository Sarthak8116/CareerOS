import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CANARY = "xi-canary-0123456789abcdef";
const load = () => import("@/lib/voice/elevenlabs");

beforeEach(() => {
  vi.resetModules();
  process.env.ELEVENLABS_API_KEY = CANARY;
  delete process.env.ELEVENLABS_VOICE_ID;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ELEVENLABS_API_KEY;
});

describe("elevenlabs client", () => {
  it("is server-only on line 1 and never logs", () => {
    const source = readFileSync(path.join(__dirname, "elevenlabs.ts"), "utf8");
    expect(source.split("\n")[0]).toBe('import "server-only";');
    expect(source).not.toMatch(/console\./);
  });

  it("is off without a key, and says which variable to set", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const { voiceAvailable, synthesizeSpeech, voiceSafeMessage } = await load();
    expect(voiceAvailable()).toBe(false);
    const err = await synthesizeSpeech("hi").catch((e) => e);
    expect(voiceSafeMessage(err)).toContain("ELEVENLABS_API_KEY");
  });

  it("sends the key only as a header, to ElevenLabs, with the text capped", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { synthesizeSpeech, MAX_TTS_CHARS } = await load();
    const audio = await synthesizeSpeech("q".repeat(5000));
    expect(audio.byteLength).toBe(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\//);
    expect(String(url)).not.toContain(CANARY);
    expect(init.headers["xi-api-key"]).toBe(CANARY);
    expect(JSON.parse(init.body).text).toHaveLength(MAX_TTS_CHARS);
  });

  it("transcribes with Scribe and returns plain text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ text: "  I debugged a cache simulator.  " }));
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeSpeech } = await load();
    expect(await transcribeSpeech(new Blob(["x"], { type: "audio/webm" }))).toBe("I debugged a cache simulator.");
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get("model_id")).toBe("scribe_v1");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("never surfaces the key or the provider's payload in an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`bad key ${CANARY}`, { status: 401 })));
    const { synthesizeSpeech, voiceSafeMessage } = await load();
    const err = await synthesizeSpeech("hi").catch((e) => e);
    expect(String(err.message)).not.toContain(CANARY);
    expect(voiceSafeMessage(err)).not.toContain(CANARY);
    expect(voiceSafeMessage(err)).toMatch(/authentication/i);
  });
});
