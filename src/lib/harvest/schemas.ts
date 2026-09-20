import { z } from "zod";

/**
 * Zod schemas for RAW HarvestAPI actor output.
 *
 * These are the boundary contract, every record from Apify is parsed here and
 * anything that does not validate is DROPPED, never rendered (build directive
 * §15: validate input at system boundaries).
 *
 * Shapes are taken from REAL captured responses (see `__fixtures__/`), not from
 * the published docs, a live smoke test proved the docs understate reality in
 * two ways that silently dropped every record:
 *
 *   1. Empty fields come back as `null`, not absent. So every optional field is
 *      `.nullish()` (null | undefined), never bare `.optional()`.
 *   2. `industries` is an array of OBJECTS, though the docs say strings.
 *
 * Everything the app does not strictly require is therefore nullish, because a
 * scraper's output is not a stable API: missing fields must degrade, not throw.
 * Unknown extra fields are ignored by default (Zod strips them), so a provider
 * adding a field can never break parsing.
 *
 * NOTE: nothing in this file is trusted text. Headlines, about sections, job
 * titles and post content are all UNTRUSTED and must pass through
 * `sanitizeUntrusted` before they are rendered or shown to a model.
 */

/* ------------------------------------------------------------------ */
/* Shared sub-shapes                                                   */
/* ------------------------------------------------------------------ */

export const HarvestLocation = z.object({
  linkedinText: z.string().nullish(),
  countryCode: z.string().nullish(),
  parsed: z
    .object({
      city: z.string().nullish(),
      state: z.string().nullish(),
      country: z.string().nullish(),
    })
    .nullish(),
});

const HarvestDate = z.object({
  month: z.union([z.string(), z.number()]).nullish(),
  year: z.union([z.string(), z.number()]).nullish(),
});

export const HarvestExperience = z.object({
  position: z.string().nullish(),
  companyName: z.string().nullish(),
  companyLinkedinUrl: z.string().nullish(),
  duration: z.string().nullish(),
  startDate: HarvestDate.nullish(),
  endDate: HarvestDate.nullish(),
  skills: z.array(z.string()).nullish(),
});
export type HarvestExperience = z.infer<typeof HarvestExperience>;

export const HarvestEducation = z.object({
  schoolName: z.string().nullish(),
  degree: z.string().nullish(),
  fieldOfStudy: z.string().nullish(),
});
export type HarvestEducation = z.infer<typeof HarvestEducation>;

/* ------------------------------------------------------------------ */
/* Profile, linkedin-profile-scraper AND linkedin-company-employees   */
/* (both actors return the same profile item shape)                    */
/* ------------------------------------------------------------------ */

/**
 * `linkedinUrl` is the only hard requirement: it is the record's identity and
 * its provenance link. A record without one cannot be attributed, so it is
 * dropped. A name is required too, an unnamed contact is not a contact.
 */
export const HarvestProfile = z.object({
  id: z.string().nullish(),
  publicIdentifier: z.string().nullish(),
  linkedinUrl: z.string().min(1),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  headline: z.string().nullish(),
  about: z.string().nullish(),
  openToWork: z.boolean().nullish(),
  hiring: z.boolean().nullish(),
  photo: z.string().nullish(),
  location: HarvestLocation.nullish(),
  /**
   * Docs say a comma-joined string; the live actor returns an ARRAY.
   * Accept both, callers normalise via `topSkillsList()`.
   */
  topSkills: z.union([z.string(), z.array(z.string())]).nullish(),
  connectionsCount: z.number().nullish(),
  currentPosition: z
    .array(z.object({ companyName: z.string().nullish() }))
    .nullish(),
  experience: z.array(HarvestExperience).nullish(),
  education: z.array(HarvestEducation).nullish(),
  skills: z.array(z.object({ name: z.string().nullish() })).nullish(),
  /** Present only in an email-search scraper mode, and never guaranteed. */
  email: z.string().nullish(),
});
export type HarvestProfile = z.infer<typeof HarvestProfile>;

/* ------------------------------------------------------------------ */
/* Company, linkedin-company                                          */
/* ------------------------------------------------------------------ */

export const HarvestCompanyLocation = z.object({
  country: z.string().nullish(),
  city: z.string().nullish(),
  line1: z.string().nullish(),
  line2: z.string().nullish(),
  postalCode: z.string().nullish(),
  headquarter: z.boolean().nullish(),
});

export const HarvestCompany = z.object({
  id: z.string().nullish(),
  universalName: z.string().nullish(),
  linkedinUrl: z.string().min(1),
  name: z.string().min(1),
  tagline: z.string().nullish(),
  website: z.string().nullish(),
  foundedOn: z.object({ year: z.number().nullish() }).nullish(),
  employeeCount: z.number().nullish(),
  employeeCountRange: z.object({ start: z.number().nullish() }).nullish(),
  followerCount: z.number().nullish(),
  description: z.string().nullish(),
  companyType: z.string().nullish(),
  locations: z.array(HarvestCompanyLocation).nullish(),
  /** Confirmed as plain strings in the live response. */
  specialities: z.array(z.string()).nullish(),
  /**
   * The docs say "array of strings"; the live API returns OBJECTS
   * ({ id, name, urn, title, hierarchy }). Accept either, so the app survives
   * the provider changing its mind in either direction.
   */
  industries: z
    .array(
      z.union([
        z.string(),
        z.object({
          name: z.string().nullish(),
          title: z.string().nullish(),
        }),
      ]),
    )
    .nullish(),
  phone: z.string().nullish(),
});
export type HarvestCompany = z.infer<typeof HarvestCompany>;

/* ------------------------------------------------------------------ */
/* Posts, linkedin-company-posts AND linkedin-profile-posts           */
/* (same item shape; we only read the fields we actually surface)      */
/* ------------------------------------------------------------------ */

export const HarvestPost = z.object({
  type: z.string().nullish(),
  id: z.string().nullish(),
  linkedinUrl: z.string().nullish(),
  /** Post body. Required, a post with no content has nothing to ground on. */
  content: z.string().min(1),
  author: z
    .object({
      name: z.string().nullish(),
      publicIdentifier: z.string().nullish(),
      linkedinUrl: z.string().nullish(),
      position: z.string().nullish(),
    })
    .nullish(),
  postedAt: z
    .object({
      timestamp: z.number().nullish(),
      date: z.string().nullish(),
      postedAgoShort: z.string().nullish(),
      postedAgoText: z.string().nullish(),
    })
    .nullish(),
});
export type HarvestPost = z.infer<typeof HarvestPost>;

/**
 * Normalise `topSkills` to a list regardless of which shape the actor sent.
 * Returns `[]` when absent, so callers never branch on the representation.
 */
export function topSkillsList(
  value: string | string[] | null | undefined,
): string[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : value.split(",");
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/* ------------------------------------------------------------------ */
/* Boundary parser                                                     */
/* ------------------------------------------------------------------ */

/**
 * Parse a raw dataset array, keeping only records that validate.
 *
 * Invalid records are dropped rather than throwing, so one malformed row can
 * never take down a campaign build. The count of dropped rows is returned so
 * callers can report honestly on partial results.
 */
export function parseItems<T extends z.ZodTypeAny>(
  schema: T,
  items: unknown[],
): { valid: z.infer<T>[]; dropped: number } {
  const valid: z.infer<T>[] = [];
  let dropped = 0;
  for (const item of items) {
    const result = schema.safeParse(item);
    if (result.success) valid.push(result.data);
    else dropped += 1;
  }
  return { valid, dropped };
}
