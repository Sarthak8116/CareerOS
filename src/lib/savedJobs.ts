"use client";

import type { SavedJob } from "@/lib/types";
import { SavedJob as SavedJobSchema } from "@/lib/types";
import { slugId } from "@/lib/utils";

/**
 * Demo-mode saved-jobs store (§5.2). Client-only localStorage, mirroring the
 * shape of lib/store.ts: SSR guard, Zod-validated reads, deterministic ids.
 * No runtime timestamps, savedAt is a fixed stamp so the demo stays stable
 * across renders and reloads. The real Supabase-backed store slots in behind
 * the same function signatures later.
 */

const KEY = "careeros:savedJobs:v1";
const SAVED_STAMP = "2026-07-14T00:00:00.000Z";

function canPersist() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readRaw(): SavedJob[] {
  if (!canPersist()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate each; drop anything that no longer matches the schema.
    return parsed
      .map((s) => SavedJobSchema.safeParse(s))
      .filter((r) => r.success)
      .map((r) => (r as { data: SavedJob }).data);
  } catch {
    return [];
  }
}

function writeRaw(saved: SavedJob[]) {
  if (!canPersist()) return;
  window.localStorage.setItem(KEY, JSON.stringify(saved));
}

export function getSavedJobs(): SavedJob[] {
  return readRaw();
}

/**
 * Save a job by its Job.id. Idempotent, saving the same job twice returns the
 * existing record (optionally applying any provided overrides) rather than
 * creating a duplicate. Id is deterministic from the jobId.
 */
export function saveJob(
  jobId: string,
  opts?: {
    interest?: SavedJob["interest"];
    status?: SavedJob["status"];
    notes?: string;
  },
): SavedJob {
  const all = readRaw();
  const id = slugId("saved", jobId);
  const existing = all.find((s) => s.id === id);

  if (existing) {
    const updated: SavedJob = {
      ...existing,
      ...(opts?.interest ? { interest: opts.interest } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.notes !== undefined ? { notes: opts.notes } : {}),
    };
    writeRaw(all.map((s) => (s.id === id ? updated : s)));
    return updated;
  }

  const record: SavedJob = {
    id,
    jobId,
    status: opts?.status ?? "saved",
    interest: opts?.interest ?? "medium",
    notes: opts?.notes ?? "",
    savedAt: SAVED_STAMP,
  };
  writeRaw([record, ...all]);
  return record;
}

export function updateSavedJob(id: string, patch: Partial<SavedJob>): void {
  const all = readRaw();
  writeRaw(all.map((s) => (s.id === id ? { ...s, ...patch, id } : s)));
}

export function removeSavedJob(id: string): void {
  const all = readRaw();
  writeRaw(all.filter((s) => s.id !== id));
}
