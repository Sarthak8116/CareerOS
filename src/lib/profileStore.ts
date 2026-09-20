"use client";

import type {
  Candidate,
  Evidence,
  EvidenceSource,
  LinkedInConnection,
} from "@/lib/types";
import { Candidate as CandidateSchema, Evidence as EvidenceSchema } from "@/lib/types";
import { demoCandidate } from "@/lib/demo/candidate";
import { resetStyleMemory } from "@/lib/styleMemory";

/**
 * Candidate profile persistence, the "profile memory" layer.
 *
 * Until now `demoCandidate` was a static import, so anything a user imported
 * (a LinkedIn profile, a parsed résumé) was displayed once and lost on reload.
 * Every "CareerOS remembers you / learns from your edits" behaviour depends on
 * this module.
 *
 * Mirrors `lib/store.ts` exactly, same conventions, so the eventual
 * Supabase-backed implementation can slot in behind these signatures:
 *  - client-only, guarded by `canPersist()` for SSR safety
 *  - every read re-validated with Zod; anything that no longer matches is dropped
 *  - deterministic: no `Date.now()` in stored values
 *
 * HONESTY RULES ENFORCED HERE:
 *  - Merging NEVER invents evidence. It adds records from a real source, or
 *    updates one that already exists; it never upgrades a claim's strength or
 *    trust just because a second source repeated it.
 *  - Imported evidence keeps the trust label its mapper assigned. A self-listed
 *    LinkedIn skill stays `user-provided` here, exactly as it arrived.
 *  - The user's own edits win over any import (see `mergeEvidence`).
 */

const KEY = "careeros:profile:v1";

function canPersist() {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * Read the stored profile, or `undefined` if there isn't a valid one.
 * A stored profile that no longer matches the schema is discarded rather than
 * partially rendered.
 */
function readRaw(): Candidate | undefined {
  if (!canPersist()) return undefined;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = CandidateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function writeRaw(candidate: Candidate) {
  if (!canPersist()) return;
  window.localStorage.setItem(KEY, JSON.stringify(candidate));
}

/**
 * The active candidate profile.
 *
 * Falls back to the deterministic demo candidate when nothing is stored, so
 * demo mode behaves exactly as it always has and the app never renders an
 * empty profile.
 */
export function getProfile(): Candidate {
  return readRaw() ?? demoCandidate;
}

/** Has the user actually imported a profile, or are we still on the demo one? */
export function hasStoredProfile(): boolean {
  return readRaw() !== undefined;
}

/** Persist a whole profile (validated first). Returns what was stored. */
export function saveProfile(candidate: Candidate): Candidate {
  const parsed = CandidateSchema.parse(candidate);
  writeRaw(parsed);
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Evidence merging                                                    */
/* ------------------------------------------------------------------ */

/**
 * Which sources may overwrite which.
 *
 * Higher wins. `user-confirmation` sits at the top because a person correcting
 * their own record must never be silently overwritten by a later import, the
 * whole point of profile memory is that your edits stick.
 */
const SOURCE_AUTHORITY: Record<EvidenceSource, number> = {
  "user-confirmation": 5,
  resume: 4,
  github: 3,
  linkedin: 2,
  portfolio: 2,
  "project-doc": 1,
  email: 1,
};

/**
 * Merge imported evidence into an existing set.
 *
 * Rules:
 *  - A new id is added as-is.
 *  - An existing id is replaced ONLY when the incoming record comes from a
 *    source with at least equal authority. A LinkedIn import therefore cannot
 *    overwrite something the user confirmed by hand.
 *  - Nothing is ever merged field-by-field: we keep whichever whole record
 *    wins, so a claim can never end up with one source's text and another's
 *    strength label.
 *  - Order is stable (existing order preserved, new records appended by id) so
 *    repeat imports produce an identical graph.
 */
export function mergeEvidence(
  existing: Evidence[],
  incoming: Evidence[],
): Evidence[] {
  const byId = new Map(existing.map((e) => [e.id, e] as const));

  const sorted = [...incoming].sort((a, b) => a.id.localeCompare(b.id));
  for (const candidate of sorted) {
    const parsed = EvidenceSchema.safeParse(candidate);
    if (!parsed.success) continue; // drop invalid records, never render them
    const record = parsed.data;

    const current = byId.get(record.id);
    if (!current) {
      byId.set(record.id, record);
      continue;
    }
    if (SOURCE_AUTHORITY[record.sourceType] >= SOURCE_AUTHORITY[current.sourceType]) {
      byId.set(record.id, record);
    }
  }

  return Array.from(byId.values());
}

/**
 * Add imported evidence to the stored profile and persist the result.
 *
 * Used by the onboarding LinkedIn step and (later) the résumé import. Returns
 * the updated profile plus a count of what actually changed, so the UI can
 * report honestly instead of implying more was learned than really was.
 */
export function addEvidence(incoming: Evidence[]): {
  profile: Candidate;
  added: number;
  updated: number;
} {
  const current = getProfile();
  const existingIds = new Set(current.evidence.map((e) => e.id));

  const merged = mergeEvidence(current.evidence, incoming);

  let added = 0;
  let updated = 0;
  for (const record of merged) {
    if (!existingIds.has(record.id)) {
      added += 1;
    } else if (!current.evidence.some((e) => shallowEqual(e, record))) {
      updated += 1;
    }
  }

  const profile = saveProfile({ ...current, evidence: merged });
  return { profile, added, updated };
}

/** Field-wise comparison, Evidence is flat, so this is exact. */
function shallowEqual(a: Evidence, b: Evidence): boolean {
  return (
    a.claim === b.claim &&
    a.category === b.category &&
    a.sourceType === b.sourceType &&
    a.sourceReference === b.sourceReference &&
    a.strength === b.strength &&
    a.recency === b.recency &&
    a.publicProof === b.publicProof &&
    a.trust === b.trust
  );
}

/**
 * Update profile fields (name, headline, location, links, …) from an import.
 *
 * Only fills fields that are genuinely EMPTY on the stored profile, so an
 * import can never silently rewrite something the user has already set. The
 * evidence graph is untouched here, use {@link addEvidence} for that.
 */
export function fillProfileFields(
  fields: Partial<Pick<Candidate, "name" | "headline" | "location">> & {
    linkedin?: string;
  },
): Candidate {
  const current = getProfile();

  const isEmpty = (value: string | undefined) => !value || value.trim() === "";

  const next: Candidate = {
    ...current,
    name: isEmpty(current.name) && fields.name ? fields.name : current.name,
    headline:
      isEmpty(current.headline) && fields.headline ? fields.headline : current.headline,
    location:
      isEmpty(current.location) && fields.location ? fields.location : current.location,
    links: {
      ...current.links,
      linkedin:
        isEmpty(current.links.linkedin) && fields.linkedin
          ? fields.linkedin
          : current.links.linkedin,
    },
  };

  return saveProfile(next);
}

/** Persist the editable preference fields from the demo onboarding flow. */
export function updateProfilePreferences(fields: {
  targetRoles: string[];
  targetIndustries: string[];
  location: string;
  workAuthorization: string;
}): Candidate {
  const current = getProfile();
  return saveProfile({
    ...current,
    targetRoles: fields.targetRoles,
    targetIndustries: fields.targetIndustries,
    location: fields.location,
    workAuthorization: fields.workAuthorization,
  });
}

/** Replace the user's own exported first-degree connection list. */
export function saveLinkedInConnections(connections: LinkedInConnection[]): Candidate {
  const current = getProfile();
  return saveProfile({ ...current, linkedinConnections: connections });
}

/** Wipe the stored profile and fall back to the demo candidate. */
export function resetProfile(): Candidate {
  if (canPersist()) window.localStorage.removeItem(KEY);
  resetStyleMemory();
  return demoCandidate;
}
