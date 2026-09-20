import type { Candidate, Warmth, WarmthSignal } from "@/lib/types";

/**
 * Overlap-scoring engine (§5.12 warmest path, §5.7 network strength).
 *
 * Compares the candidate's background against a contact's and reports what they
 * have IN COMMON, nothing more. Fully deterministic: no Math.random, no Date,
 * no network. It receives already-fetched data as plain input, so it stays a
 * pure engine like every other module in `lib/engine`.
 *
 * THE HONESTY RULE THIS FILE EXISTS TO ENFORCE:
 * A shared school, a shared former employer, or a shared city is an OVERLAP.
 * It is not a relationship, an introduction, or evidence that these two people
 * have ever met. Every signal is therefore emitted with an inference trust
 * label, and every `Warmth` carries a `note` saying so in plain language. A
 * "warm" path here means "you have something honest to open with", never
 * "you have a connection".
 */

/** The comparable subset of someone's background. Plain data, no provider types. */
export interface WarmthProfile {
  schools: string[];
  /** Employers, current and past. */
  employers: string[];
  city?: string;
  skills: string[];
}

/* ------------------------------------------------------------------ */
/* Normalization, so "MIT" and "M.I.T." compare equal, deterministically */
/* ------------------------------------------------------------------ */

/** Legal/company suffixes that carry no identity ("Nvidia Inc" === "NVIDIA"). */
const COMPANY_NOISE =
  /\b(inc|inc\.|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|sa|nv|ag|holdings|group)\b/g;

/** School words that add no identity ("University of X" vs "X University"). */
const SCHOOL_NOISE = /\b(university|universität|college|institute|school|of|the|at)\b/g;

function normalize(value: string, noise?: RegExp): string {
  let out = value
    .toLowerCase()
    .normalize("NFKD")
    // Strip accents so "Universität" and "Universitat" agree.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  if (noise) out = out.replace(noise, " ");
  return out.replace(/\s+/g, " ").trim();
}

const normCompany = (v: string) => normalize(v, COMPANY_NOISE);
const normSchool = (v: string) => normalize(v, SCHOOL_NOISE);
const normPlain = (v: string) => normalize(v);

/** City comparison uses the first segment only, "Austin, TX" vs "Austin, Texas". */
function normCity(value: string): string {
  return normPlain(value.split(",")[0] ?? value);
}

/**
 * Intersect two lists under a normalizer, returning the ORIGINAL strings from
 * `a` so the user sees their own spelling. Sorted and deduped for determinism.
 */
function overlap(a: string[], b: string[], norm: (v: string) => string): string[] {
  const bKeys = new Set(b.map(norm).filter((k) => k.length > 0));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of a) {
    const key = norm(value);
    if (!key || !bKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out.sort((x, y) => x.localeCompare(y));
}

/* ------------------------------------------------------------------ */
/* Candidate -> comparable profile                                     */
/* ------------------------------------------------------------------ */

/**
 * Derive the candidate's comparable background from their own record.
 *
 * Schools come from the profile plus any education evidence; employers from
 * experience evidence; skills from skill evidence. Only what the candidate has
 * actually told us, nothing inferred.
 */
export function candidateWarmthProfile(candidate: Candidate): WarmthProfile {
  const schools = [candidate.university].filter(
    (s): s is string => !!s && s.trim().length > 0,
  );
  const employers: string[] = [];
  const skills: string[] = [];

  for (const ev of candidate.evidence) {
    if (ev.category === "education") {
      // "B.S. Computer Science, University of Illinois" -> the school half.
      const school = ev.claim.split("·").pop()?.trim();
      if (school) schools.push(school);
    } else if (ev.category === "experience") {
      // "Systems Intern at Acme" -> "Acme".
      const match = ev.claim.match(/\bat\s+(.+)$/i);
      const employer = match?.[1]?.trim();
      if (employer) employers.push(employer);
    } else if (ev.category === "skill") {
      skills.push(ev.claim.trim());
    }
  }

  return {
    schools,
    employers,
    city: candidate.location,
    skills,
  };
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

/**
 * A shared school or former employer is a genuinely usable opener, you can
 * name a specific shared context. A shared city or skill is much weaker: lots
 * of people live in Austin and lots of engineers know Python.
 */
const SIGNAL_TRUST: Record<WarmthSignal["kind"], WarmthSignal["trust"]> = {
  "same-school": "strong-inference",
  "same-past-employer": "strong-inference",
  "same-city": "weak-inference",
  "shared-skill": "weak-inference",
};

const NOTE_BASE =
  "Derived from overlapping background only. A shared school, employer, city or skill " +
  "is an inference about common ground, not a confirmed connection, and not evidence " +
  "that you have met. Verify before you reference it.";

/**
 * Score how warm an approach to one contact looks.
 *
 * Levels:
 *   strong  , a strong signal plus at least one more piece of common ground
 *   moderate, exactly one strong signal (school or former employer)
 *   limited , only weak signals (city, skills)
 *   none    , nothing in common that we can honestly point to
 */
export function computeWarmth(
  candidate: WarmthProfile,
  contact: WarmthProfile,
): Warmth {
  const signals: WarmthSignal[] = [];

  for (const school of overlap(candidate.schools, contact.schools, normSchool)) {
    signals.push({
      kind: "same-school",
      detail: `Both attended ${school}`,
      trust: SIGNAL_TRUST["same-school"],
    });
  }

  for (const employer of overlap(candidate.employers, contact.employers, normCompany)) {
    signals.push({
      kind: "same-past-employer",
      detail: `Both spent time at ${employer}`,
      trust: SIGNAL_TRUST["same-past-employer"],
    });
  }

  if (
    candidate.city &&
    contact.city &&
    normCity(candidate.city) === normCity(contact.city) &&
    normCity(candidate.city).length > 0
  ) {
    signals.push({
      kind: "same-city",
      detail: `Both based in ${candidate.city}`,
      trust: SIGNAL_TRUST["same-city"],
    });
  }

  const sharedSkills = overlap(candidate.skills, contact.skills, normPlain);
  if (sharedSkills.length > 0) {
    signals.push({
      kind: "shared-skill",
      // Cap the list so one prolific profile cannot dominate the display.
      detail: `Shared skills: ${sharedSkills.slice(0, 4).join(", ")}`,
      trust: SIGNAL_TRUST["shared-skill"],
    });
  }

  const strongCount = signals.filter((s) => s.trust === "strong-inference").length;
  const level: Warmth["level"] =
    strongCount >= 1 && signals.length >= 2
      ? "strong"
      : strongCount >= 1
        ? "moderate"
        : signals.length > 0
          ? "limited"
          : "none";

  const note =
    signals.length === 0
      ? "No overlapping background found. Treat this as a cold approach."
      : NOTE_BASE;

  return { level, signals, note };
}

/** Rank for picking the warmest contact. Higher is warmer. */
const WARMTH_RANK: Record<Warmth["level"], number> = {
  strong: 3,
  moderate: 2,
  limited: 1,
  none: 0,
};

export { WARMTH_RANK };
