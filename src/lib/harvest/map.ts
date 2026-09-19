import type {
  Confidence,
  Evidence,
  HarvestCompanyFacts,
  HarvestProvenance,
  Level,
  Person,
  SourcedPost,
} from "@/lib/types";
import type {
  HarvestCompany,
  HarvestPost,
  HarvestProfile,
} from "@/lib/harvest/schemas";
import { sanitizeUntrusted } from "@/lib/security/untrusted";
import { slugId } from "@/lib/utils";

/**
 * Pure mapping from validated raw Harvest records into the app's own shapes.
 *
 * No network, no Date.now(), no Math.random — `fetchedAt` is always passed in,
 * so the same inputs always produce the same output and the mapping is fully
 * testable from fixtures.
 *
 * EVERY string that came off LinkedIn (headline, about, job title, school name,
 * post body) is UNTRUSTED and passes through `sanitizeUntrusted` here, at the
 * edge. Downstream code can then treat these fields as inert data.
 *
 * HONESTY RULES ENFORCED HERE:
 *  - Every mapped record carries provenance (source, fetchedAt, linkedinUrl).
 *  - A scraped person's employer and title are `source-backed` (LinkedIn says
 *    so). Their RELEVANCE to this specific role is an inference, and their
 *    reporting line is never claimed at all.
 *  - No email is ever mapped here. Emails arrive only via the explicit
 *    per-contact action and are labeled unconfirmed.
 */

/**
 * Trim a sanitized string to a display-safe length, or drop it if empty.
 *
 * Accepts `null` as well as `undefined`: the live API returns `null` for empty
 * fields (and `""` for some, e.g. an absent tagline), and both must collapse to
 * "we don't have this" rather than rendering as a blank or the word "null".
 */
function clean(value: string | null | undefined, max = 280): string | undefined {
  if (!value) return undefined;
  const { clean: safe } = sanitizeUntrusted(value);
  const trimmed = safe.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

function provenanceFor(linkedinUrl: string, fetchedAt: string): HarvestProvenance {
  return { source: "harvestapi", fetchedAt, linkedinUrl };
}

function fullName(profile: HarvestProfile): string | undefined {
  const name = [profile.firstName, profile.lastName]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(" ");
  return clean(name, 120);
}

/** The person's current job title, from their headline or newest experience. */
function currentTitle(profile: HarvestProfile): string | undefined {
  const fromExperience = profile.experience?.find((e) => e.position && !e.endDate);
  return (
    clean(fromExperience?.position, 140) ?? clean(profile.headline, 140)
  );
}

function locationText(profile: HarvestProfile): string | undefined {
  const loc = profile.location;
  if (!loc) return undefined;
  const parsed = [loc.parsed?.city, loc.parsed?.state, loc.parsed?.country]
    .filter((p): p is string => !!p)
    .join(", ");
  return clean(parsed || loc.linkedinText, 120);
}

/* ------------------------------------------------------------------ */
/* Role classification — which contacts matter for a job application   */
/* ------------------------------------------------------------------ */

export type ContactRole =
  | "recruiter"
  | "hiring-manager"
  | "engineering-manager"
  | "team-lead"
  | "engineer"
  | "other";

const ROLE_PATTERNS: { role: ContactRole; pattern: RegExp }[] = [
  { role: "recruiter", pattern: /\b(recruit\w*|talent|sourcer|people ops|university relations)\b/i },
  { role: "hiring-manager", pattern: /\b(hiring manager|head of|director|vp|vice president)\b/i },
  { role: "engineering-manager", pattern: /\b(engineering manager|software.{0,12}manager|em,)\b/i },
  { role: "team-lead", pattern: /\b(tech lead|team lead|lead engineer|staff engineer|principal engineer)\b/i },
  { role: "engineer", pattern: /\b(engineer|developer|programmer|scientist|architect)\b/i },
];

/** Classify a contact from their title. Deterministic, first match wins. */
export function classifyContact(title: string): ContactRole {
  for (const { role, pattern } of ROLE_PATTERNS) {
    if (pattern.test(title)) return role;
  }
  return "other";
}

/** How much this contact matters for THIS application. An inference. */
const ROLE_RELEVANCE: Record<ContactRole, Level> = {
  recruiter: "strong",
  "hiring-manager": "strong",
  "engineering-manager": "strong",
  "team-lead": "moderate",
  engineer: "moderate",
  other: "limited",
};

/** How much sway they plausibly hold over a hiring decision. An inference. */
const ROLE_INFLUENCE: Record<ContactRole, Level> = {
  recruiter: "moderate",
  "hiring-manager": "strong",
  "engineering-manager": "strong",
  "team-lead": "moderate",
  engineer: "limited",
  other: "limited",
};

/** How likely a cold message is to be read. Recruiters are paid to read them. */
const ROLE_ACCESSIBILITY: Record<ContactRole, Level> = {
  recruiter: "strong",
  "hiring-manager": "limited",
  "engineering-manager": "moderate",
  "team-lead": "moderate",
  engineer: "strong",
  other: "moderate",
};

const ROLE_DESCRIPTION: Record<ContactRole, string> = {
  recruiter: "Recruiting or talent — likely screens applications for this role",
  "hiring-manager": "Senior leader in the org this role sits in",
  "engineering-manager": "Engineering manager — plausibly the hiring manager",
  "team-lead": "Senior IC or lead on a team adjacent to this role",
  engineer: "Engineer at the company — closest to the day-to-day work",
  other: "Works at the company; relevance to this role is unclear",
};

/**
 * Map one validated LinkedIn profile into the app's `Person` shape.
 *
 * Returns `undefined` when the record lacks the minimum to be a useful,
 * attributable contact (a name and a title) — dropped, not rendered.
 */
export function profileToPerson(
  profile: HarvestProfile,
  opts: { companyName: string; fetchedAt: string },
): Person | undefined {
  const name = fullName(profile);
  const title = currentTitle(profile);
  if (!name || !title) return undefined;

  const role = classifyContact(title);
  const openToContact = profile.openToWork === true || profile.hiring === true;

  return {
    id: slugId("person", profile.linkedinUrl),
    name,
    title,
    company: opts.companyName,
    inferredRole: ROLE_DESCRIPTION[role],
    // What LinkedIn states vs. what we are guessing — spelled out for the user.
    connection:
      "No existing connection. Employer and title are from their public LinkedIn profile; " +
      "their involvement in this specific role is an inference.",
    relevance: ROLE_RELEVANCE[role],
    influence: ROLE_INFLUENCE[role],
    accessibility: openToContact ? "strong" : ROLE_ACCESSIBILITY[role],
    // The profile itself is source-backed; nothing about the hiring process is.
    confidence: (role === "other" ? "low" : "medium") satisfies Confidence,
    trust: "source-backed",
    outreachPriority:
      role === "recruiter" ? "high" : role === "other" ? "low" : "medium",

    linkedinUrl: profile.linkedinUrl,
    headline: clean(profile.headline, 160),
    location: locationText(profile),
    provenance: provenanceFor(profile.linkedinUrl, opts.fetchedAt),
  };
}

/**
 * Map the candidate's OWN profile into evidence-graph records.
 *
 * Used by the onboarding LinkedIn step. Everything here is the user's own
 * public profile, so `publicProof` is true and the source is `linkedin` — but
 * trust stays `source-backed`, not `verified`: LinkedIn shows what someone
 * typed about themselves, which is not the same as confirmed.
 */
export function profileToEvidence(profile: HarvestProfile): Evidence[] {
  const evidence: Evidence[] = [];

  for (const exp of profile.experience ?? []) {
    const position = clean(exp.position, 140);
    const company = clean(exp.companyName, 120);
    if (!position || !company) continue;
    const isCurrent = !exp.endDate;
    evidence.push({
      id: slugId("ev", `linkedin:exp:${company}:${position}`),
      claim: `${position} at ${company}`,
      category: "experience",
      sourceType: "linkedin",
      sourceReference: profile.linkedinUrl,
      strength: isCurrent ? "moderate" : "limited",
      recency: isCurrent ? "current" : "recent",
      publicProof: true,
      trust: "source-backed",
    });
  }

  for (const edu of profile.education ?? []) {
    const school = clean(edu.schoolName, 140);
    if (!school) continue;
    const field = clean(edu.fieldOfStudy, 120);
    const degree = clean(edu.degree, 120);
    const detail = [degree, field].filter(Boolean).join(", ");
    evidence.push({
      id: slugId("ev", `linkedin:edu:${school}`),
      claim: detail ? `${detail} — ${school}` : school,
      category: "education",
      sourceType: "linkedin",
      sourceReference: profile.linkedinUrl,
      strength: "moderate",
      recency: "recent",
      publicProof: true,
      trust: "source-backed",
    });
  }

  for (const skill of profile.skills ?? []) {
    const name = clean(skill.name, 80);
    if (!name) continue;
    evidence.push({
      id: slugId("ev", `linkedin:skill:${name}`),
      claim: name,
      category: "skill",
      sourceType: "linkedin",
      sourceReference: profile.linkedinUrl,
      // A self-listed skill with no project behind it is a weak claim, and
      // this app does not inflate it just because LinkedIn displays it.
      strength: "limited",
      recency: "unknown",
      publicProof: true,
      trust: "user-provided",
    });
  }

  // Stable order so repeated imports produce an identical evidence graph.
  return evidence.sort((a, b) => a.id.localeCompare(b.id));
}

/** Map a validated company record into the factual subset the app stores. */
export function companyToFacts(
  company: HarvestCompany,
  fetchedAt: string,
): HarvestCompanyFacts {
  const hq = company.locations?.find((l) => l.headquarter) ?? company.locations?.[0];
  const hqText = hq
    ? [hq.city, hq.country].filter((p): p is string => !!p).join(", ")
    : undefined;

  return {
    name: clean(company.name, 140) ?? company.name,
    linkedinUrl: company.linkedinUrl,
    tagline: clean(company.tagline, 200),
    description: clean(company.description, 1200),
    website: company.website ?? undefined,
    industries: (company.industries ?? [])
      // The live API returns objects here, the docs claim strings — handle both.
      .map((i) => clean(typeof i === "string" ? i : (i.name ?? i.title), 80))
      .filter((i): i is string => !!i),
    specialities: (company.specialities ?? [])
      .map((s) => clean(s, 80))
      .filter((s): s is string => !!s),
    // `null` must become `undefined`: the app schema uses optional, not nullable.
    employeeCount: company.employeeCount ?? undefined,
    headquarters: clean(hqText, 120),
    foundedYear: company.foundedOn?.year ?? undefined,
    provenance: provenanceFor(company.linkedinUrl, fetchedAt),
  };
}

/** Map validated posts into sanitized, attributable excerpts. */
export function postsToSourced(
  posts: HarvestPost[],
  opts: { linkedinUrl: string; fetchedAt: string },
): SourcedPost[] {
  const out: SourcedPost[] = [];
  for (const post of posts) {
    const excerpt = clean(post.content, 400);
    if (!excerpt) continue;
    out.push({
      id: slugId("post", post.id ?? post.linkedinUrl ?? excerpt.slice(0, 40)),
      excerpt,
      authorName: clean(post.author?.name, 120),
      postedAt: post.postedAt?.date ?? post.postedAt?.postedAgoText ?? undefined,
      url: post.linkedinUrl ?? undefined,
      provenance: provenanceFor(post.linkedinUrl ?? opts.linkedinUrl, opts.fetchedAt),
    });
  }
  return out;
}
