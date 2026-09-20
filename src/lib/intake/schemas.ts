import { z } from "zod";

/**
 * Zod schemas for RAW job-board API output.
 *
 * These are the boundary contract (build directive §15). Shapes are taken from
 * REAL captured responses in `__fixtures__/`, not from published docs, the
 * Harvest layer learned at production cost that docs understate reality and
 * that the gap silently drops every record.
 *
 * TWO RULES, both learned the hard way:
 *
 *  1. EVERY optional field is `.nullish()` (null | undefined), never bare
 *     `.optional()`. Boards return `null` for empty fields AND omit others
 *     entirely, Ashby's `validThrough` is absent while Greenhouse's
 *     `application_deadline` is null, and both mean "not stated".
 *
 *  2. Almost nothing is required. A posting missing a title still parses here
 *     and is rejected by the MAPPER, which can then return an honest failure
 *     with prefill scraps. A schema-level throw would lose that.
 *
 * Nothing in this file is trusted text. Titles, descriptions and question
 * prompts are all UNTRUSTED and must pass `sanitizeUntrusted` before they are
 * rendered or shown to a model.
 */

/** Ids arrive as numbers on some boards and strings on others. */
const LooseId = z.union([z.string(), z.number()]).nullish();

/* ------------------------------------------------------------------ */
/* Greenhouse                                                          */
/* ------------------------------------------------------------------ */

/**
 * One field inside a Greenhouse question.
 *
 * `type` drives our question kind. `input_hidden` appears in
 * `location_questions` (Longitude / Latitude) and is dropped by the mapper,
 * those are page plumbing, not questions a human answers.
 */
export const GreenhouseField = z.object({
  name: z.string().nullish(),
  type: z.string().nullish(),
  values: z
    .array(
      z.object({
        label: z.string().nullish(),
        // Confirmed as a NUMBER in live data though it reads like an id.
        value: z.union([z.string(), z.number()]).nullish(),
      }),
    )
    .nullish(),
});

export const GreenhouseQuestion = z.object({
  label: z.string().nullish(),
  description: z.string().nullish(),
  required: z.boolean().nullish(),
  fields: z.array(GreenhouseField).nullish(),
});
export type GreenhouseQuestion = z.infer<typeof GreenhouseQuestion>;

/**
 * A demographic (EEO) question. NOTE the shape differs from `GreenhouseQuestion`
 * above: these are FLAT, `label`/`type`/`answer_options` sit directly on the
 * question with no `fields[]` wrapper. Reusing the other schema here silently
 * dropped every one of them.
 *
 * These are carried so the user can see the whole form, but CareerOS never
 * drafts an answer to one. `free_form` and `decline_to_answer` are preserved
 * because "prefer not to say" is a real, meaningful choice.
 */
export const GreenhouseDemographicQuestion = z.object({
  id: LooseId,
  label: z.string().nullish(),
  required: z.boolean().nullish(),
  type: z.string().nullish(),
  answer_options: z
    .array(
      z.object({
        id: LooseId,
        label: z.string().nullish(),
        free_form: z.boolean().nullish(),
        decline_to_answer: z.boolean().nullish(),
      }),
    )
    .nullish(),
});
export type GreenhouseDemographicQuestion = z.infer<
  typeof GreenhouseDemographicQuestion
>;

export const GreenhouseJob = z.object({
  id: LooseId,
  internal_job_id: LooseId,
  title: z.string().nullish(),
  company_name: z.string().nullish(),
  absolute_url: z.string().nullish(),
  /** OBJECT, singular. Multi-location postings join into ONE string here. */
  location: z.object({ name: z.string().nullish() }).nullish(),
  /** HTML-ENTITY-ESCAPED HTML. Must be decoded once before tag handling. */
  content: z.string().nullish(),
  departments: z.array(z.object({ name: z.string().nullish() })).nullish(),
  offices: z.array(z.object({ name: z.string().nullish() })).nullish(),
  questions: z.array(GreenhouseQuestion).nullish(),
  location_questions: z.array(GreenhouseQuestion).nullish(),
  demographic_questions: z
    .object({
      header: z.string().nullish(),
      description: z.string().nullish(),
      questions: z.array(GreenhouseDemographicQuestion).nullish(),
    })
    .nullish(),
  education: z.string().nullish(),
  /** Null on most postings, "not stated", never "no deadline". */
  application_deadline: z.string().nullish(),
  requisition_id: z.string().nullish(),
  first_published: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type GreenhouseJob = z.infer<typeof GreenhouseJob>;

/* ------------------------------------------------------------------ */
/* Lever                                                               */
/* ------------------------------------------------------------------ */

export const LeverPosting = z.object({
  id: z.string().nullish(),
  /** Lever's title field is `text`. */
  text: z.string().nullish(),
  categories: z
    .object({
      location: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
      team: z.string().nullish(),
      department: z.string().nullish(),
      /** FREE TEXT, not an enum: null, "Regular Full Time (Salary)", "Remote". */
      commitment: z.string().nullish(),
    })
    .nullish(),
  country: z.string().nullish(),
  /** LOWERCASE: "remote" | "hybrid" | "onsite" | "unspecified". */
  workplaceType: z.string().nullish(),
  description: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  descriptionBody: z.string().nullish(),
  descriptionBodyPlain: z.string().nullish(),
  opening: z.string().nullish(),
  openingPlain: z.string().nullish(),
  additional: z.string().nullish(),
  additionalPlain: z.string().nullish(),
  /** Heading-anchored structure: `text` is the heading, `content` the <li>s. */
  lists: z
    .array(
      z.object({
        text: z.string().nullish(),
        content: z.string().nullish(),
      }),
    )
    .nullish(),
  /** EPOCH MILLISECONDS, not an ISO string. */
  createdAt: z.number().nullish(),
  hostedUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  /** Null on 7 of 11 real postings. */
  salaryRange: z
    .object({
      min: z.number().nullish(),
      max: z.number().nullish(),
      currency: z.string().nullish(),
      interval: z.string().nullish(),
    })
    .nullish(),
});
export type LeverPosting = z.infer<typeof LeverPosting>;

/* ------------------------------------------------------------------ */
/* Ashby                                                               */
/* ------------------------------------------------------------------ */

const AshbyAddress = z
  .object({
    postalAddress: z
      .object({
        addressLocality: z.string().nullish(),
        addressRegion: z.string().nullish(),
        addressCountry: z.string().nullish(),
      })
      .nullish(),
  })
  .nullish();

/**
 * Compensation components MIX types within one tier: an EquityPercentage
 * component carries null currency/min/max beside a Salary component that has
 * them populated. Every field is nullish for exactly that reason.
 */
const AshbyCompensationComponent = z.object({
  summary: z.string().nullish(),
  compensationType: z.string().nullish(),
  interval: z.string().nullish(),
  currencyCode: z.string().nullish(),
  minValue: z.number().nullish(),
  maxValue: z.number().nullish(),
});

export const AshbyJob = z.object({
  id: z.string().nullish(),
  /** Real live data carries a LEADING SPACE here. The mapper must trim. */
  title: z.string().nullish(),
  department: z.string().nullish(),
  team: z.string().nullish(),
  /** "FullTime" | "Intern" | "Contract" | … (no separator, capitalised). */
  employmentType: z.string().nullish(),
  location: z.string().nullish(),
  secondaryLocations: z
    .array(z.object({ location: z.string().nullish(), address: AshbyAddress }))
    .nullish(),
  /** ISO-8601, unlike Lever's epoch or Workday's relative text. */
  publishedAt: z.string().nullish(),
  isListed: z.boolean().nullish(),
  isRemote: z.boolean().nullish(),
  /** CAPITALISED ("Hybrid"), unlike Lever's lowercase. Separate enums. */
  workplaceType: z.string().nullish(),
  address: AshbyAddress,
  jobUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  compensation: z
    .object({
      compensationTierSummary: z.string().nullish(),
      scrapeableCompensationSalarySummary: z.string().nullish(),
      summaryComponents: z.array(AshbyCompensationComponent).nullish(),
    })
    .nullish(),
});
export type AshbyJob = z.infer<typeof AshbyJob>;

/** The board endpoint returns every posting; we filter by id in the adapter. */
export const AshbyBoard = z.object({
  jobs: z.array(AshbyJob).nullish(),
  apiVersion: z.string().nullish(),
});
export type AshbyBoard = z.infer<typeof AshbyBoard>;

/* ------------------------------------------------------------------ */
/* Workday                                                             */
/* ------------------------------------------------------------------ */

export const WorkdayJob = z.object({
  jobPostingInfo: z
    .object({
      id: z.string().nullish(),
      title: z.string().nullish(),
      /** RAW html, must NOT be entity-decoded. */
      jobDescription: z.string().nullish(),
      location: z.string().nullish(),
      /** RELATIVE TEXT ("Posted Today"). Never a date. */
      postedOn: z.string().nullish(),
      startDate: z.string().nullish(),
      /** "Full time" | "Part time", note the space. */
      timeType: z.string().nullish(),
      jobReqId: z.string().nullish(),
      externalUrl: z.string().nullish(),
      /** Exists, but the questionnaire itself is behind auth. */
      questionnaireId: z.string().nullish(),
      canApply: z.boolean().nullish(),
    })
    .nullish(),
  hiringOrganization: z
    .object({
      /** A LEGAL ENTITY name ("2100 NVIDIA USA"), not a brand. */
      name: z.string().nullish(),
      url: z.string().nullish(),
    })
    .nullish(),
  userAuthenticated: z.boolean().nullish(),
});
export type WorkdayJob = z.infer<typeof WorkdayJob>;

/* ------------------------------------------------------------------ */
/* schema.org JobPosting (the generic fallback)                        */
/* ------------------------------------------------------------------ */

const SchemaOrgText = z.union([z.string(), z.array(z.string())]).nullish();

export const JsonLdJobPosting = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
  datePosted: z.string().nullish(),
  /** Frequently ABSENT rather than null, both mean "not stated". */
  validThrough: z.string().nullish(),
  /** "FULL_TIME" | "PART_TIME" | "CONTRACTOR" | "INTERN"; may be an array. */
  employmentType: SchemaOrgText,
  hiringOrganization: z
    .union([
      z.string(),
      z.object({ name: z.string().nullish(), sameAs: z.string().nullish() }),
    ])
    .nullish(),
  jobLocation: z
    .union([
      z.object({
        address: z
          .union([
            z.string(),
            z.object({
              addressLocality: z.string().nullish(),
              addressRegion: z.string().nullish(),
              addressCountry: z.union([z.string(), z.object({}).passthrough()]).nullish(),
            }),
          ])
          .nullish(),
      }),
      z.array(z.unknown()),
    ])
    .nullish(),
  jobLocationType: z.string().nullish(),
  directApply: z.boolean().nullish(),
});
export type JsonLdJobPosting = z.infer<typeof JsonLdJobPosting>;

/* ------------------------------------------------------------------ */
/* Boundary parser                                                     */
/* ------------------------------------------------------------------ */

/**
 * Parse one record, returning `undefined` rather than throwing.
 *
 * A board that changed its response shape should produce an honest "we
 * couldn't read this posting", never a 500.
 */
export function parseOne<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.infer<T> | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}
