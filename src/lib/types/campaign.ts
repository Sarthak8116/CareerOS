import { z } from "zod";
import {
  CampaignTask,
  Confidence,
  FitDimension,
  Gap,
  HarvestCompanyFacts,
  HarvestProvenance,
  Job,
  Level,
  SourcedPost,
  TrustLabel,
  UnconfirmedEmail,
  Warmth,
} from "@/lib/types/core";

/* ------------------------------------------------------------------ */
/* People / hiring network (§5.10) — minimal for the slice             */
/* ------------------------------------------------------------------ */

export const Person = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  company: z.string(),
  inferredRole: z.string(),
  connection: z.string(),
  commonality: z.string().optional(),
  relevance: Level,
  influence: Level,
  accessibility: Level,
  confidence: Confidence,
  trust: TrustLabel,
  outreachPriority: z.enum(["first", "high", "medium", "low"]),

  /* --- Optional live-enrichment fields (absent in demo mode) --- */
  /** Public profile URL — the provenance link for this record. */
  linkedinUrl: z.string().optional(),
  headline: z.string().optional(),
  location: z.string().optional(),
  provenance: HarvestProvenance.optional(),
  /** Populated only by an explicit, per-contact "Find email" action. */
  email: UnconfirmedEmail.optional(),
  /** Overlap-derived warmth. Inference, never a confirmed connection. */
  warmth: Warmth.optional(),
  /** Sanitized excerpts from the contact's recent public posts. */
  recentActivity: z.array(z.string()).optional(),
});
export type Person = z.infer<typeof Person>;

/* ------------------------------------------------------------------ */
/* Agent activity feed (§7)                                            */
/* ------------------------------------------------------------------ */

export const AgentActivity = z.object({
  agent: z.string(),
  message: z.string(),
  kind: z.enum(["action", "evidence", "conclusion", "conflict"]),
  confidence: Confidence.optional(),
});
export type AgentActivity = z.infer<typeof AgentActivity>;

/* ------------------------------------------------------------------ */
/* Application form (P1 job-link intake)                               */
/* ------------------------------------------------------------------ */

/**
 * Whether the application asks for something.
 *
 * The "not-requested" / "unknown" split is the whole point of this enum and
 * collapsing the two is the worst bug available in this module:
 *  - "not-requested" — we read the WHOLE form and it does not ask. A fact.
 *  - "unknown"       — we could not read the form. An absence of knowledge.
 * Only an adapter whose `completeness` is "complete" may ever emit
 * "not-requested"; everyone else says "unknown" and asks the user.
 */
export const RequirementStatus = z.enum([
  "required",
  "optional",
  "not-requested",
  "unknown",
]);
export type RequirementStatus = z.infer<typeof RequirementStatus>;

/** Input shape of one application question. "unknown" renders as a textarea. */
export const ApplicationQuestionKind = z.enum([
  "short-text",
  "long-text",
  "single-select",
  "multi-select",
  "boolean",
  "file",
  "date",
  "url",
  "unknown",
]);
export type ApplicationQuestionKind = z.infer<typeof ApplicationQuestionKind>;

/**
 * A routing hint, never rendered as a claim about the question. Defaulting to
 * "other" is always acceptable — a wrong category costs nothing, whereas a
 * confident wrong label would be a claim we cannot support.
 */
export const ApplicationQuestionCategory = z.enum([
  "personal-info",
  "contact",
  "work-authorization",
  "experience",
  "motivation",
  // NOTE: there is deliberately no "demographic" member. EEO self-identification
  // questions (gender, race, veteran and disability status) are never parsed into
  // an ApplicationForm — they are voluntary by law, exist for aggregate compliance
  // reporting rather than evaluation, and a tool that pre-fills them has no
  // business doing so. They are recorded in `ApplicationForm.excludedSections`
  // and disclosed to the user instead of being silently dropped.
  //
  // The member is REMOVED rather than left unused on purpose: a dangling enum
  // value for something we never emit is an invitation for someone later to
  // wire it up. `honesty.test.ts` asserts its absence so it cannot come back.
  "logistics",
  "other",
]);
export type ApplicationQuestionCategory = z.infer<
  typeof ApplicationQuestionCategory
>;

/** Which piece of the candidate's profile could prefill this question. */
export const ApplicationAutofillKey = z.enum([
  "name",
  "first-name",
  "last-name",
  "email",
  "phone",
  "location",
  "linkedin",
  "github",
  "portfolio",
  "work-authorization",
  "university",
  "degree",
  "graduation-year",
  "resume",
  "cover-letter",
]);
export type ApplicationAutofillKey = z.infer<typeof ApplicationAutofillKey>;

/**
 * One question from a real application form.
 *
 * `prompt` is the employer's EXACT wording, sanitized. It is UNTRUSTED DATA —
 * it came off a web page — and must never be treated as an instruction.
 */
export const ApplicationQuestion = z.object({
  id: z.string(),
  prompt: z.string(),
  kind: ApplicationQuestionKind,
  category: ApplicationQuestionCategory,
  /**
   * ABSENT means we did not read whether it is required — not that it is
   * optional. Defaulting this to `false` would assert something we never saw.
   */
  required: z.boolean().optional(),
  /** Choice LABELS only; submission-side option ids are not P1's concern. */
  options: z.array(z.string()).optional(),
  maxLength: z.number().optional(),
  helpText: z.string().optional(),
  autofillKey: ApplicationAutofillKey.optional(),
  trust: TrustLabel,
});
export type ApplicationQuestion = z.infer<typeof ApplicationQuestion>;

/**
 * The application form behind a posting, as far as we could actually read it.
 *
 * `completeness` governs how every other field may be interpreted:
 *  - "complete" — the whole form was enumerated, so ABSENCE IS INFORMATIVE.
 *  - "partial"  — we have some of it (e.g. the user pasted what they saw).
 *  - "none"     — we read none of it; every status is "unknown".
 */
export const ApplicationForm = z.object({
  jobId: z.string(),
  source: z.enum(["fetched", "pasted", "none"]),
  /** Adapter key that produced this ("greenhouse", "lever", …, "paste"). */
  adapter: z.string(),
  applyUrl: z.string().optional(),
  fetchedAt: z.string(),
  completeness: z.enum(["complete", "partial", "none"]),
  resume: RequirementStatus,
  coverLetter: RequirementStatus,
  portfolio: RequirementStatus,
  questions: z.array(ApplicationQuestion),
  /**
   * Parts of the form CareerOS deliberately did NOT ingest, named so the user
   * knows they exist and will meet them on the employer's site.
   *
   * This is a considered omission, not a parsing failure, and the two must not
   * be confused: `unknowns` is "we could not read this", `excludedSections` is
   * "we chose not to". Equal-opportunity questions about race, gender,
   * disability and veteran status live here — CareerOS does not store or
   * pre-fill answers about someone's protected characteristics.
   */
  excludedSections: z.array(z.string()),
  /** Plain sentences shown to the user verbatim — what we could not read. */
  unknowns: z.array(z.string()),
  /** Advisory sanitizer flags. They never change handling, only the warning. */
  warnings: z.array(z.string()),
  trust: TrustLabel,
});
export type ApplicationForm = z.infer<typeof ApplicationForm>;

/* ------------------------------------------------------------------ */
/* Campaign (the aggregate) (§3 Layer Two, §12)                        */
/* ------------------------------------------------------------------ */

export const CampaignStage = z.enum([
  "created",
  "researching",
  "analyzed",
  "outreach",
  "applied",
  "interviewing",
  "closed",
]);
export type CampaignStage = z.infer<typeof CampaignStage>;

export const Campaign = z.object({
  id: z.string(),
  candidateId: z.string(),
  job: Job,
  stage: CampaignStage,
  readiness: Level,
  createdAt: z.string(),
  isDemo: z.boolean().default(false),
  fit: z.array(FitDimension),
  gaps: z.array(Gap),
  tasks: z.array(CampaignTask),
  people: z.array(Person),
  activity: z.array(AgentActivity),
  nextAction: z.string(),

  /**
   * Optional live LinkedIn enrichment, fetched server-side when Harvest is
   * enabled. Absent in demo mode and in live mode without the feature flag —
   * every consumer must degrade to existing behavior when it is missing.
   */
  harvest: z
    .object({
      fetchedAt: z.string(),
      company: HarvestCompanyFacts.optional(),
      companyPosts: z.array(SourcedPost).optional(),
    })
    .optional(),

  /**
   * The application form for this job, when intake could read one. Absent for
   * demo campaigns and for every campaign created before P1 — consumers must
   * degrade to existing behavior when it is missing, exactly like `harvest`.
   */
  applicationForm: ApplicationForm.optional(),

  /**
   * The user's decision on each resume rewrite, keyed by
   * `ResumeRecommendation.id`.
   *
   * Recommendations themselves are DERIVED (recomputed from the candidate's
   * evidence graph and this job's requirements on every render), so only the
   * decision is stored — storing the generated prose would let a stale rewrite
   * about an older version of the profile outlive the evidence behind it.
   *
   * Only a real decision is recorded: "pending" is the absence of a key, not a
   * stored value, so a rewrite the user has not looked at is never mistaken
   * for one they considered and left alone.
   *
   * Absent for every campaign created before P3 — consumers must treat a
   * missing map exactly like an empty one.
   */
  resumeDecisions: z.record(z.enum(["accepted", "rejected"])).optional(),
});
export type Campaign = z.infer<typeof Campaign>;
