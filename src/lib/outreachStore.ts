"use client";

import { z } from "zod";

/** Local demo persistence for edited outreach drafts and simulated statuses. */

export const OutreachStatus = z.enum(["unsent", "draft", "sent"]);
export type OutreachStatus = z.infer<typeof OutreachStatus>;

const OutreachState = z.object({
  status: OutreachStatus,
  subject: z.string(),
  full: z.string(),
  concise: z.string(),
});
export type StoredOutreachState = z.infer<typeof OutreachState>;

const StateMap = z.record(OutreachState);
const KEY = "careeros:outreach:v1";

function canPersist() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function read(): Record<string, StoredOutreachState> {
  if (!canPersist()) return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = StateMap.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function write(states: Record<string, StoredOutreachState>) {
  if (!canPersist()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(states));
  } catch {
    // Demo persistence is best-effort; the composer remains usable in memory.
  }
}

export function getOutreachStates(): Record<string, StoredOutreachState> {
  return read();
}

export function saveOutreachState(
  id: string,
  state: StoredOutreachState,
): StoredOutreachState {
  const parsed = OutreachState.parse(state);
  const next = { ...read(), [id]: parsed };
  write(next);
  return parsed;
}

export function resetOutreachStates() {
  if (canPersist()) window.localStorage.removeItem(KEY);
}
