import { NextResponse } from "next/server";
import { liveModeAvailable } from "@/lib/live/nemotron";
import { voiceAvailable } from "@/lib/voice/elevenlabs";
import { harvestEnabled } from "@/lib/harvest/client";

export const runtime = "nodejs";

/** Which optional capabilities are configured. Booleans only, never a key. */
export function GET() {
  return NextResponse.json({
    nemotron: liveModeAvailable(),
    voice: voiceAvailable(),
    linkedin: harvestEnabled(),
  });
}
