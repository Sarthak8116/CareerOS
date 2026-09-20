"use client";

import { z } from "zod";
import type { ResumeRecommendation } from "@/lib/types";
import type {
  ResumeStyleMemory,
  ResumeStylePreference,
} from "@/lib/engine/resume";

const KEY = "careeros:resume-style:v1";

const StyleCountsSchema = z.object({
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
});

const StoredStyleMemorySchema = z.object({
  proofLinks: StyleCountsSchema,
  mergedBullets: StyleCountsSchema,
});

type StyleCounts = z.infer<typeof StyleCountsSchema>;
type StoredStyleMemory = z.infer<typeof StoredStyleMemorySchema>;

const EMPTY: StoredStyleMemory = {
  proofLinks: { accepted: 0, rejected: 0 },
  mergedBullets: { accepted: 0, rejected: 0 },
};

function canPersist() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readStored(): StoredStyleMemory {
  if (!canPersist()) return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = StoredStyleMemorySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeStored(memory: StoredStyleMemory) {
  if (canPersist()) window.localStorage.setItem(KEY, JSON.stringify(memory));
}

function preference(counts: StyleCounts): ResumeStylePreference {
  if (counts.accepted === counts.rejected) return "neutral";
  return counts.accepted > counts.rejected ? "more" : "less";
}

export function getStyleMemory(): ResumeStyleMemory {
  const stored = readStored();
  return {
    proofLinks: preference(stored.proofLinks),
    mergedBullets: preference(stored.mergedBullets),
  };
}

function hasProofLink(text: string): boolean {
  return /(?:https?:\/\/|www\.|github\.com|linkedin\.com)/i.test(text);
}

function hasMergedClaims(text: string): boolean {
  return text.includes("; ");
}

function applyDelta(
  counts: StyleCounts,
  featurePresent: boolean,
  status: ResumeRecommendation["status"],
  direction: 1 | -1,
): StyleCounts {
  if (!featurePresent || (status !== "accepted" && status !== "rejected")) {
    return counts;
  }
  return {
    ...counts,
    [status]: Math.max(0, counts[status] + direction),
  };
}

export function recordResumeDecision({
  original,
  suggested,
  previousStatus,
  nextStatus,
}: {
  original: string;
  suggested: string;
  previousStatus: ResumeRecommendation["status"];
  nextStatus: ResumeRecommendation["status"];
}): ResumeStyleMemory {
  let stored = readStored();
  const proofLink = hasProofLink(suggested);
  const merged = hasMergedClaims(suggested) && suggested !== original;

  stored = {
    proofLinks: applyDelta(
      applyDelta(stored.proofLinks, proofLink, previousStatus, -1),
      proofLink,
      nextStatus,
      1,
    ),
    mergedBullets: applyDelta(
      applyDelta(stored.mergedBullets, merged, previousStatus, -1),
      merged,
      nextStatus,
      1,
    ),
  };
  writeStored(stored);
  return getStyleMemory();
}

export function resetStyleMemory() {
  if (canPersist()) window.localStorage.removeItem(KEY);
}
