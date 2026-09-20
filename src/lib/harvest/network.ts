import "server-only";
import type {
  Candidate,
  HarvestCompanyFacts,
  Job,
  Person,
  SourcedPost,
  UnconfirmedEmail,
} from "@/lib/types";
import {
  EMPLOYEE_SCRAPER_MODE,
  MAX_EMPLOYEES_PER_CAMPAIGN,
  PROFILE_MODE_EMAIL,
  PROFILE_MODE_NO_EMAIL,
  harvestEnabled,
  runActor,
} from "@/lib/harvest/client";
import {
  HarvestCompany,
  HarvestPost,
  HarvestProfile,
  parseItems,
  topSkillsList,
} from "@/lib/harvest/schemas";
import {
  companyToFacts,
  postsToSourced,
  profileToPerson,
} from "@/lib/harvest/map";
import {
  candidateWarmthProfile,
  computeWarmth,
  type WarmthProfile,
} from "@/lib/engine/warmth";
import { cacheKey, withCache } from "@/lib/harvest/cache";

/**
 * Harvest orchestration: the only module that decides WHICH actors to call and
 * with what input. Everything it returns is already validated, sanitized, and
 * mapped into app shapes, callers never see a raw Apify record.
 *
 * Cost discipline (build directive: default to the cheap path):
 *  - No-email mode everywhere except the one explicit per-contact lookup.
 *  - Employees capped at MAX_EMPLOYEES_PER_CAMPAIGN.
 *  - Every call goes through the cache first, keyed by LinkedIn URL / company.
 */

/** How many recent posts we pull for grounding. Small on purpose. */
const MAX_POSTS = 5;

/**
 * Titles worth contacting for a job application. Used as the actor-side filter
 * so we pay for relevant profiles instead of filtering 2500 of them locally.
 */
const TARGET_JOB_TITLES = [
  "recruiter",
  "technical recruiter",
  "talent acquisition",
  "university recruiter",
  "hiring manager",
  "engineering manager",
  "software engineering manager",
  "tech lead",
  "team lead",
  "staff engineer",
  "senior software engineer",
  "software engineer",
];

/** Build the comparable background of a scraped contact for warmth scoring. */
function contactWarmthProfile(profile: HarvestProfile): WarmthProfile {
  const schools = (profile.education ?? [])
    .map((e) => e.schoolName)
    .filter((s): s is string => !!s);
  const employers = (profile.experience ?? [])
    .map((e) => e.companyName)
    .filter((c): c is string => !!c);
  const skills = [
    ...(profile.skills ?? [])
      .map((s) => s.name)
      .filter((s): s is string => !!s),
    // `topSkills` is an array in the live actor and a string in the docs,
    // `topSkillsList` normalises both.
    ...topSkillsList(profile.topSkills),
  ];
  return {
    schools,
    employers,
    city:
      profile.location?.parsed?.city ?? profile.location?.linkedinText ?? undefined,
    skills,
  };
}

/* ------------------------------------------------------------------ */
/* Company                                                             */
/* ------------------------------------------------------------------ */

/**
 * Look up a company by LinkedIn URL when we have one, otherwise by name.
 * Returns `undefined` when nothing validates, the caller then keeps its
 * existing low-confidence fallback rather than showing a half-empty record.
 */
export async function fetchCompanyFacts(input: {
  companyName: string;
  companyLinkedinUrl?: string;
}): Promise<HarvestCompanyFacts | undefined> {
  if (!harvestEnabled()) return undefined;

  const identity = input.companyLinkedinUrl ?? input.companyName;
  const key = cacheKey("company", identity);

  const { value: items, fetchedAt } = await withCache(key, () =>
    runActor(
      "linkedin-company",
      input.companyLinkedinUrl
        ? { companies: [input.companyLinkedinUrl] }
        : { searches: [input.companyName] },
    ),
  );

  const { valid } = parseItems(HarvestCompany, items);
  const first = valid[0];
  return first ? companyToFacts(first, fetchedAt) : undefined;
}

/** Recent public posts from a company page. Grounding context, not analysis. */
export async function fetchCompanyPosts(
  companyLinkedinUrl: string,
): Promise<SourcedPost[]> {
  if (!harvestEnabled()) return [];

  const key = cacheKey("company-posts", companyLinkedinUrl);
  const { value: items, fetchedAt } = await withCache(key, () =>
    runActor("linkedin-company-posts", {
      targetUrls: [companyLinkedinUrl],
      maxPosts: MAX_POSTS,
      postedLimit: "month",
      scrapeReactions: false,
      scrapeComments: false,
    }),
  );

  const { valid } = parseItems(HarvestPost, items);
  return postsToSourced(valid, { linkedinUrl: companyLinkedinUrl, fetchedAt });
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

/**
 * Find real, relevant contacts at the job's company and score each one's
 * overlap with the candidate.
 *
 * "Full" scraper mode is required here: warmth scores on `experience[]` and
 * `education[]`, which the short mode does not return. At the 25-profile cap
 * that is roughly $0.20 per campaign.
 *
 * Returns contacts sorted warmest-first, then by relevance. On any failure the
 * caller falls back to its existing behavior, this never throws upward.
 */
export async function fetchTeamContacts(input: {
  candidate: Candidate;
  job: Job;
  companyLinkedinUrl: string;
}): Promise<Person[]> {
  if (!harvestEnabled()) return [];

  const key = cacheKey("employees", input.companyLinkedinUrl);
  const { value: items, fetchedAt } = await withCache(key, () =>
    runActor("linkedin-company-employees", {
      profileScraperMode: EMPLOYEE_SCRAPER_MODE,
      companies: [input.companyLinkedinUrl],
      jobTitles: TARGET_JOB_TITLES,
      maxItems: MAX_EMPLOYEES_PER_CAMPAIGN,
      companyBatchMode: "all_at_once",
    }),
  );

  const { valid } = parseItems(HarvestProfile, items);
  const candidateProfile = candidateWarmthProfile(input.candidate);

  const people: Person[] = [];
  for (const profile of valid.slice(0, MAX_EMPLOYEES_PER_CAMPAIGN)) {
    const person = profileToPerson(profile, {
      companyName: input.job.company,
      fetchedAt,
    });
    if (!person) continue; // dropped: not enough to be an attributable contact

    const warmth = computeWarmth(candidateProfile, contactWarmthProfile(profile));
    people.push({
      ...person,
      warmth,
      // Surface the strongest shared context as the existing `commonality`
      // slot, so the current UI shows it without any layout change.
      commonality: warmth.signals[0]?.detail,
    });
  }

  return rankContacts(people);
}

const LEVEL_RANK: Record<Person["relevance"], number> = {
  strong: 3,
  moderate: 2,
  limited: 1,
  none: 0,
};

const WARMTH_RANK: Record<NonNullable<Person["warmth"]>["level"], number> = {
  strong: 3,
  moderate: 2,
  limited: 1,
  none: 0,
};

/**
 * Order contacts by warmth, then relevance, then name.
 *
 * The warmest contact is promoted to `outreachPriority: "first"`: but only
 * when there is genuinely something in common to open with. With no overlap
 * anywhere, nobody is labeled "contact first", because the ranking would be
 * arbitrary and the label would be a lie.
 */
export function rankContacts(people: Person[]): Person[] {
  const sorted = [...people].sort((a, b) => {
    const warmth =
      WARMTH_RANK[b.warmth?.level ?? "none"] - WARMTH_RANK[a.warmth?.level ?? "none"];
    if (warmth !== 0) return warmth;
    const relevance = LEVEL_RANK[b.relevance] - LEVEL_RANK[a.relevance];
    if (relevance !== 0) return relevance;
    return a.name.localeCompare(b.name);
  });

  const top = sorted[0];
  if (!top || !top.warmth || top.warmth.level === "none") return sorted;
  return sorted.map((p, i) =>
    i === 0 ? { ...p, outreachPriority: "first" as const } : p,
  );
}

/* ------------------------------------------------------------------ */
/* Per-contact, on-demand lookups                                      */
/* ------------------------------------------------------------------ */

/** The candidate's OWN profile, for onboarding. Never email mode. */
export async function fetchOwnProfile(
  profileUrl: string,
): Promise<HarvestProfile | undefined> {
  if (!harvestEnabled()) return undefined;

  const key = cacheKey("profile", profileUrl);
  const { value: items } = await withCache(key, () =>
    runActor("linkedin-profile-scraper", {
      profileScraperMode: PROFILE_MODE_NO_EMAIL,
      queries: [profileUrl],
    }),
  );

  const { valid } = parseItems(HarvestProfile, items);
  return valid[0];
}

/** Recent public posts from one contact, for outreach personalization. */
export async function fetchContactPosts(
  profileUrl: string,
): Promise<SourcedPost[]> {
  if (!harvestEnabled()) return [];

  const key = cacheKey("profile-posts", profileUrl);
  const { value: items, fetchedAt } = await withCache(key, () =>
    runActor("linkedin-profile-posts", {
      targetUrls: [profileUrl],
      maxPosts: MAX_POSTS,
      scrapeReactions: false,
      scrapeComments: false,
    }),
  );

  const { valid } = parseItems(HarvestPost, items);
  return postsToSourced(valid, { linkedinUrl: profileUrl, fetchedAt });
}

/**
 * Email lookup for ONE contact. This is the only call that ever uses email
 * mode, and it runs only from an explicit user action on a single contact.
 *
 * The returned label is fixed at "found + SMTP-checked, unconfirmed", the
 * provider checked that the mailbox answers, which is NOT confirmation that it
 * belongs to this person or that they read it. Callers put it in the outreach
 * message's "claims you must verify yourself" list.
 */
export async function findContactEmail(
  profileUrl: string,
): Promise<UnconfirmedEmail | undefined> {
  if (!harvestEnabled()) return undefined;

  const key = cacheKey("profile-email", profileUrl);
  const { value: items, fetchedAt } = await withCache(key, () =>
    runActor("linkedin-profile-scraper", {
      profileScraperMode: PROFILE_MODE_EMAIL,
      queries: [profileUrl],
    }),
  );

  const { valid } = parseItems(HarvestProfile, items);
  const address = valid[0]?.email?.trim();
  // Email is never guaranteed, even in email mode, absence is a normal result.
  if (!address) return undefined;

  return {
    address,
    status: "found + SMTP-checked, unconfirmed",
    fetchedAt,
  };
}
