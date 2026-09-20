import { z } from "zod";

/**
 * CareerOS shared schemas (the cross-agent contract).
 *
 * Design rules from the build directive (§15, §16):
 *  - No fake numerical precision. Conclusions use CATEGORICAL labels
 *    (strength / confidence / fit), never invented probabilities.
 *  - Every meaningful claim points to evidence and carries a trust label.
 */

/* ------------------------------------------------------------------ */
/* Categorical scales (used everywhere instead of fake percentages)    */
/* ------------------------------------------------------------------ */

export const TrustLabel = z.enum([
  "verified",
  "user-provided",
  "source-backed",
  "strong-inference",
  "weak-inference",
  "unknown",
]);
export type TrustLabel = z.infer<typeof TrustLabel>;

export const Level = z.enum(["strong", "moderate", "limited", "none"]);
export type Level = z.infer<typeof Level>;

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const Recency = z.enum(["current", "recent", "dated", "unknown"]);
export type Recency = z.infer<typeof Recency>;

/* ------------------------------------------------------------------ */
/* Candidate + evidence graph (§5.1, §12)                              */
/* ------------------------------------------------------------------ */

export const EvidenceSource = z.enum([
  "resume",
  "github",
  "portfolio",
  "linkedin",
  "user-confirmation",
  "email",
  "project-doc",
]);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

export const EvidenceCategory = z.enum([
  "skill",
  "project",
  "experience",
  "education",
  "achievement",
  "leadership",
]);
export type EvidenceCategory = z.infer<typeof EvidenceCategory>;

export const Evidence = z.object({
  id: z.string(),
  claim: z.string(),
  category: EvidenceCategory,
  sourceType: EvidenceSource,
  sourceReference: z.string().optional(),
  strength: Level,
  recency: Recency,
  publicProof: z.boolean(),
  trust: TrustLabel,
});
export type Evidence = z.infer<typeof Evidence>;

/** A first-degree LinkedIn relationship supplied by the user's own export. */
export const LinkedInConnection = z.object({
  name: z.string(),
  profileUrl: z.string().optional(),
  company: z.string().optional(),
  position: z.string().optional(),
  connectedOn: z.string().optional(),
});
export type LinkedInConnection = z.infer<typeof LinkedInConnection>;

export const Candidate = z.object({
  id: z.string(),
  name: z.string(),
  headline: z.string(),
  location: z.string(),
  university: z.string(),
  degree: z.string(),
  graduationYear: z.number(),
  experienceLevel: z.enum(["student", "entry", "mid", "senior"]),
  workAuthorization: z.string(),
  targetRoles: z.array(z.string()),
  targetIndustries: z.array(z.string()),
  links: z.object({
    github: z.string().optional(),
    linkedin: z.string().optional(),
    portfolio: z.string().optional(),
  }),
  evidence: z.array(Evidence),
  /** Populated only from the user's own LinkedIn Connections.csv export. */
  linkedinConnections: z.array(LinkedInConnection).optional(),
});
export type Candidate = z.infer<typeof Candidate>;

/* ------------------------------------------------------------------ */
/* Job (§5.5, §12)                                                     */
/* ------------------------------------------------------------------ */

export const JobRequirement = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.enum(["minimum", "preferred", "responsibility"]),
  skillKey: z.string().optional(), // canonical skill this maps to, if any
});
export type JobRequirement = z.infer<typeof JobRequirement>;

export const Job = z.object({
  id: z.string(),
  source: z.string(),
  url: z.string().optional(),
  title: z.string(),
  normalizedTitle: z.string(),
  company: z.string(),
  team: z.string().optional(),
  location: z.string(),
  remote: z.enum(["onsite", "hybrid", "remote", "unknown"]),
  employmentType: z.enum(["internship", "full-time", "contract"]),
  seniority: z.string(),
  description: z.string(),
  postedAt: z.string().optional(),
  deadline: z.string().optional(),
  sponsorship: z.enum(["offered", "not-offered", "unclear"]),
  requirements: z.array(JobRequirement),

  /* --- Optional intake provenance (P1 job-link intake) --- */

  /**
   * The employment type EXACTLY as the posting worded it ("Regular Full Time
   * (Salary)", "Part time", "FULL_TIME").
   *
   * `employmentType` above is a three-member enum the engines switch on, so it
   * must always hold one of those values. Real postings say things the enum
   * cannot represent, "Part time" has no honest member. Rather than widen the
   * enum (which would break exhaustive switches downstream) we keep a best-fit
   * value there and preserve the source wording here, so nothing the posting
   * actually said is lost and the UI can show the user the real text.
   *
   * Absent when the posting stated no employment type at all.
   */
  employmentTypeRaw: z.string().optional(),

  /**
   * Field names this posting did NOT state, and which therefore hold a
   * placeholder ("Unknown") rather than a fact.
   *
   * The product's hard line is that a field we did not read is never given a
   * plausible-looking value. `Job` predates intake and makes `location`,
   * `seniority` and `employmentType` required, so a placeholder is unavoidable
   *, this list is what stops that placeholder from silently reading as data.
   * Render each entry via `UNSTATED_LABELS` in `lib/labels.ts`.
   *
   * Only fields that HOLD a substituted value appear here. `postedAt` and
   * `deadline` are optional and simply absent when unstated, so nothing renders
   * for them and there is no false impression to correct, they are
   * deliberately excluded. An absent date that genuinely matters (Workday's
   * relative "Posted Today", which we refuse to turn into a real date) is
   * reported through `IntakeResult.assumptions` instead.
   *
   * READ WITH `employmentTypeRaw`: together they distinguish two cases that
   * mean different things to the user, and the UI shows different copy for each:
   *
   *   in `unstated` + NO  `employmentTypeRaw`  →  the posting was SILENT
   *   in `unstated` + HAS `employmentTypeRaw`  →  the posting SPOKE, but said
   *                                               something our enum cannot
   *                                               represent (e.g. "Part time")
   *
   * That inference is TOTAL today because `employmentType` is the only field
   * whose enum lacks an unknown member, `location` and `seniority` are free
   * strings, so they are either stated or the literal "Unknown", and `remote`
   * and `sponsorship` have real "unknown"/"unclear" members. If a SECOND
   * unrepresentable-enum field is ever added, this inference stops being total
   * and a full per-field origins map earns its keep.
   *
   * Absent (not `[]`) when nothing was defaulted, so demo and pasted jobs are
   * unaffected.
   */
  unstated: z.array(z.string()).optional(),
});
export type Job = z.infer<typeof Job>;

/* ------------------------------------------------------------------ */
/* Fit analysis (§5.7)                                                 */
/* ------------------------------------------------------------------ */

export const FitCategory = z.enum([
  "role",
  "evidence",
  "preference",
  "network",
  "urgency",
  "improvement",
]);
export type FitCategory = z.infer<typeof FitCategory>;

export const FitDimension = z.object({
  category: FitCategory,
  label: z.string(),
  level: Level,
  confidence: Confidence,
  explanation: z.string(),
  supportingEvidenceIds: z.array(z.string()),
});
export type FitDimension = z.infer<typeof FitDimension>;

/* ------------------------------------------------------------------ */
/* Gap -> action engine (§5.7)                                         */
/* ------------------------------------------------------------------ */

export const GapClassification = z.enum([
  "true-skill-gap",
  "evidence-gap",
  "resume-wording-gap",
  "experience-gap",
  "low-priority-gap",
  "hard-blocker",
  "uncertain-gap",
]);
export type GapClassification = z.infer<typeof GapClassification>;

export const GapActionKind = z.enum([
  "rewrite-bullet",
  "add-evidence",
  "improve-readme",
  "highlight-project",
  "build-project",
  "learning-sprint",
  "prep-interview-story",
  "ask-employee",
  "apply-anyway",
  "do-not-apply",
]);
export type GapActionKind = z.infer<typeof GapActionKind>;

export const Gap = z.object({
  id: z.string(),
  requirement: z.string(),
  requirementId: z.string().optional(),
  classification: GapClassification,
  importance: z.enum(["critical", "high", "medium", "low"]),
  action: z.object({
    kind: GapActionKind,
    summary: z.string(),
    detail: z.string(),
    expectedImpact: Level,
    effort: z.enum(["quick", "moderate", "significant"]),
  }),
  evidenceNote: z.string().optional(),
});
export type Gap = z.infer<typeof Gap>;

/* ------------------------------------------------------------------ */
/* Campaign tasks (§5.18)                                              */
/* ------------------------------------------------------------------ */

export const CampaignTask = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum([
    "application",
    "resume",
    "outreach",
    "research",
    "learning",
    "interview",
  ]),
  priority: z.enum(["critical", "high", "medium", "low"]),
  impact: Level,
  effort: z.enum(["quick", "moderate", "significant"]),
  status: z.enum(["todo", "in-progress", "done"]),
  sourceGapId: z.string().optional(),
  responsibleAgent: z.string(),
});
export type CampaignTask = z.infer<typeof CampaignTask>;

/* ------------------------------------------------------------------ */
/* Sourced-data provenance (LinkedIn enrichment)                       */
/* ------------------------------------------------------------------ */

/**
 * Where a record came from and when. Attached to anything fetched from a live
 * data provider so the UI can always answer "who told you this, and when?".
 */
export const HarvestProvenance = z.object({
  source: z.literal("harvestapi"),
  fetchedAt: z.string(),
  linkedinUrl: z.string().optional(),
});
export type HarvestProvenance = z.infer<typeof HarvestProvenance>;

/**
 * A discovered email address.
 *
 * The label is a LITERAL and is deliberately not an enum: a found address has
 * been SMTP-checked by the provider but never confirmed to be the right person's
 * working inbox, and this app must never call it "verified". The address is
 * always added to the outreach message's "claims you must verify yourself" list.
 */
export const UnconfirmedEmail = z.object({
  address: z.string(),
  status: z.literal("found + SMTP-checked, unconfirmed"),
  fetchedAt: z.string(),
});
export type UnconfirmedEmail = z.infer<typeof UnconfirmedEmail>;

/** One overlap between the candidate and a contact. Always an INFERENCE. */
export const WarmthSignal = z.object({
  kind: z.enum([
    "same-school",
    "same-past-employer",
    "same-city",
    "shared-skill",
  ]),
  detail: z.string(),
  /** Constrained to inference labels, an overlap is never a confirmed tie. */
  trust: z.enum(["strong-inference", "weak-inference"]),
});
export type WarmthSignal = z.infer<typeof WarmthSignal>;

/**
 * How warm a path to a contact looks, derived only from overlaps. Shared
 * background is NOT a relationship: `note` states that explicitly, and the UI
 * repeats it. Never presented as a confirmed connection.
 */
export const Warmth = z.object({
  level: Level,
  signals: z.array(WarmthSignal),
  note: z.string(),
});
export type Warmth = z.infer<typeof Warmth>;

/**
 * Company facts as published by the company itself on LinkedIn. Factual fields
 * only, headcount, industries, specialities. No analysis, no invented research.
 */
export const HarvestCompanyFacts = z.object({
  name: z.string(),
  linkedinUrl: z.string(),
  tagline: z.string().optional(),
  description: z.string().optional(),
  website: z.string().optional(),
  industries: z.array(z.string()),
  specialities: z.array(z.string()),
  employeeCount: z.number().optional(),
  headquarters: z.string().optional(),
  foundedYear: z.number().optional(),
  provenance: HarvestProvenance,
});
export type HarvestCompanyFacts = z.infer<typeof HarvestCompanyFacts>;

/** A sanitized excerpt of one public post, kept with its provenance. */
export const SourcedPost = z.object({
  id: z.string(),
  excerpt: z.string(),
  authorName: z.string().optional(),
  postedAt: z.string().optional(),
  url: z.string().optional(),
  provenance: HarvestProvenance,
});
export type SourcedPost = z.infer<typeof SourcedPost>;
