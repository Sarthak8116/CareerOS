"use client";

import * as React from "react";
import { Loader2, Mic, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * Voice for the mock interview: hear the question read by an interviewer
 * (ElevenLabs text-to-speech) and answer out loud (ElevenLabs Scribe).
 *
 * Both are optional. With no ELEVENLABS_API_KEY the server reports voice as
 * off, these controls do not render, and the interview stays text-only.
 * A recording is sent for transcription and discarded — it is never stored.
 */

export interface InterviewCapabilities {
  voice: boolean;
  grading: boolean;
}

export function useInterviewCapabilities(): InterviewCapabilities {
  const [caps, setCaps] = React.useState<InterviewCapabilities>({ voice: false, grading: false });
  React.useEffect(() => {
    let active = true;
    fetch("/api/voice/tts")
      .then((r) => r.json())
      .then((d) => active && setCaps({ voice: !!d.voice, grading: !!d.grading }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return caps;
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
}

/** Reads `text` aloud. Stops when `text` changes or the component unmounts. */
export function ListenButton({ text, onError }: { text: string; onError: (message: string | null) => void }) {
  const [state, setState] = React.useState<"idle" | "loading" | "playing">("idle");
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const urlRef = React.useRef<string | null>(null);

  const stop = React.useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setState("idle");
  }, []);

  React.useEffect(() => stop, [text, stop]);

  async function play() {
    onError(null);
    setState("loading");
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(await errorFrom(res, "Could not read the question aloud."));
      const url = URL.createObjectURL(await res.blob());
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = stop;
      await audio.play();
      setState("playing");
    } catch (err) {
      stop();
      onError(err instanceof Error ? err.message : "Could not read the question aloud.");
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={state === "playing" ? stop : play} disabled={state === "loading"}>
      {state === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state === "playing" ? (
        <Square className="h-4 w-4" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
      {state === "playing" ? "Stop" : "Hear the question"}
    </Button>
  );
}

/** Records a spoken answer and hands back its transcript. */
export function RecordAnswerButton({
  onTranscript,
  onError,
}: {
  onTranscript: (text: string) => void;
  onError: (message: string | null) => void;
}) {
  const [state, setState] = React.useState<"idle" | "recording" | "transcribing">("idle");
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  React.useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function start() {
    onError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("This browser cannot record audio. Type your answer instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => event.data.size > 0 && chunksRef.current.push(event.data);
      recorder.onstop = () => void transcribe(recorder);
      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch {
      onError("Microphone access was blocked. Allow it for this site, or type your answer.");
    }
  }

  async function transcribe(recorder: MediaRecorder) {
    recorder.stream.getTracks().forEach((track) => track.stop());
    setState("transcribing");
    try {
      const form = new FormData();
      form.set("audio", new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }), "answer.webm");
      const res = await fetch("/api/voice/stt", { method: "POST", body: form });
      if (!res.ok) throw new Error(await errorFrom(res, "Could not transcribe that recording."));
      const { text } = (await res.json()) as { text?: string };
      if (text?.trim()) onTranscript(text.trim());
      else onError("No speech was detected in that recording — try again, closer to the microphone.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not transcribe that recording.");
    } finally {
      chunksRef.current = [];
      setState("idle");
    }
  }

  return (
    <Button
      variant={state === "recording" ? "primary" : "secondary"}
      size="md"
      onClick={state === "recording" ? () => recorderRef.current?.stop() : start}
      disabled={state === "transcribing"}
    >
      {state === "transcribing" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state === "recording" ? (
        <Square className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
      {state === "recording" ? "Stop recording" : state === "transcribing" ? "Transcribing…" : "Answer out loud"}
    </Button>
  );
}
