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
   * cannot represent — "Part time" has no honest member. Rather than widen the
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
   * — this list is what stops that placeholder from silently reading as data.
   * Render each entry via `UNSTATED_LABELS` in `lib/labels.ts`.
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
  /** Constrained to inference labels — an overlap is never a confirmed tie. */
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
 * only — headcount, industries, specialities. No analysis, no invented research.
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
});
export type Campaign = z.infer<typeof Campaign>;

/* ================================================================== */
/* PHASE 3 CONTRACTS — shared schemas for the parallel agent fleet.    */
/* Defined centrally (build directive §9: agree schemas before impl).  */
/* ================================================================== */

/* --- Company & Team Intelligence (§5.6) --- */

export const ResearchSource = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  publisher: z.string(),
  excerpt: z.string(),
  reliability: Level,
  retrievedAt: z.string(),
});
export type ResearchSource = z.infer<typeof ResearchSource>;

export const CompanyIntel = z.object({
  company: z.string(),
  description: z.string(),
  products: z.array(z.string()),
  businessModel: z.string(),
  relevantOrg: z.string(),
  priorities: z.array(z.string()),
  whyRoleExists: z.string(),
  whatYoudWorkOn: z.string(),
  valuesBeyondJD: z.array(z.string()),
  talkingPoints: z.array(z.string()),
  risks: z.array(z.string()),
  sources: z.array(ResearchSource),
  /** Set when any part of this intel came from live LinkedIn data. */
  provenance: HarvestProvenance.optional(),
});
export type CompanyIntel = z.infer<typeof CompanyIntel>;

/* --- Opportunity Graph (§5.12) --- */

export const GraphNodeType = z.enum([
  "candidate",
  "job",
  "company",
  "team",
  "person",
  "skill",
  "project",
  "university",
  "article",
]);
export type GraphNodeType = z.infer<typeof GraphNodeType>;

export const GraphNode = z.object({
  id: z.string(),
  type: GraphNodeType,
  label: z.string(),
  sublabel: z.string().optional(),
  trust: TrustLabel,
});
export type GraphNode = z.infer<typeof GraphNode>;

export const GraphEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  relationship: z.string(),
  trust: TrustLabel,
});
export type GraphEdge = z.infer<typeof GraphEdge>;

export const OpportunityGraph = z.object({
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
  /** Ordered node ids representing the warmest contact path. */
  warmestPath: z.array(z.string()),
});
export type OpportunityGraph = z.infer<typeof OpportunityGraph>;

/* --- Outreach Studio (§5.13) --- */

export const OutreachMessage = z.object({
  id: z.string(),
  personId: z.string(),
  objective: z.string(),
  channel: z.enum(["email", "linkedin"]),
  subject: z.string(),
  full: z.string(),
  concise: z.string(),
  personalizationFacts: z.array(z.string()),
  evidenceUsed: z.array(z.string()),
  claimsToVerify: z.array(z.string()),
  recommendedSendTime: z.string(),
  followUpDate: z.string(),
  warnings: z.array(z.string()),
});
export type OutreachMessage = z.infer<typeof OutreachMessage>;

/* --- Resume & Application Studio (§5.8) --- */

export const ResumeRecommendation = z.object({
  id: z.string(),
  section: z.string(),
  original: z.string(),
  suggested: z.string(),
  reason: z.string(),
  requirementAddressed: z.string(),
  evidenceUsed: z.string(),
  confidence: Confidence,
  status: z.enum(["pending", "accepted", "rejected"]),
});
export type ResumeRecommendation = z.infer<typeof ResumeRecommendation>;

export const ClaimFlag = z.object({
  id: z.string(),
  text: z.string(),
  issue: z.enum([
    "unsupported",
    "exaggerated",
    "invented-metric",
    "weak-evidence",
    "inconsistent",
    "vague-buzzword",
  ]),
  severity: Level,
  note: z.string(),
});
export type ClaimFlag = z.infer<typeof ClaimFlag>;

/* --- Interview Preparation (§5.19) --- */

export const InterviewQuestion = z.object({
  id: z.string(),
  category: z.enum([
    "recruiter-screen",
    "behavioral",
    "technical",
    "project-deep-dive",
    "system-design",
    "domain",
    "company-specific",
    "role-specific",
    "weakness-challenge",
  ]),
  prompt: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  answerHints: z.array(z.string()),
  evidenceToUse: z.array(z.string()),
});
export type InterviewQuestion = z.infer<typeof InterviewQuestion>;

/* --- Job Comparison (§5.4) --- */

export const CompareDimension = z.object({
  category: z.string(),
  level: Level,
  note: z.string(),
});
export type CompareDimension = z.infer<typeof CompareDimension>;

export const JobComparison = z.object({
  jobId: z.string(),
  title: z.string(),
  company: z.string(),
  dimensions: z.array(CompareDimension),
  recommendation: z.enum([
    "apply-now",
    "build-campaign",
    "save-for-later",
    "research-further",
    "reject",
  ]),
});
export type JobComparison = z.infer<typeof JobComparison>;

/* ================================================================== */
/* PHASE 5 CONTRACTS — broader product (saved jobs, answers, GitHub).  */
/* ================================================================== */

/* --- Saved jobs (§5.2) --- */

export const SavedJob = z.object({
  id: z.string(),
  jobId: z.string(),
  status: z.enum(["saved", "applied", "interviewing", "rejected", "archived"]),
  interest: z.enum(["high", "medium", "low"]),
  notes: z.string(),
  savedAt: z.string(),
});
export type SavedJob = z.infer<typeof SavedJob>;

/* --- Application answer library / autofill (§5.9) --- */

export const ApplicationAnswer = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  tags: z.array(z.string()),
  updatedAt: z.string(),
});
export type ApplicationAnswer = z.infer<typeof ApplicationAnswer>;

/* --- GitHub analysis (§5.15) --- */

export const GitHubRepoAnalysis = z.object({
  name: z.string(),
  description: z.string(),
  language: z.string(),
  relevance: Level,
  readmeQuality: Level,
  supportsTargetRole: z.boolean(),
  recommendation: z.string(),
  suggestedAction: z.enum([
    "feature",
    "improve-readme",
    "add-tests",
    "add-demo",
    "leave-as-is",
  ]),
});
export type GitHubRepoAnalysis = z.infer<typeof GitHubRepoAnalysis>;

export const GitHubProfileAnalysis = z.object({
  username: z.string(),
  summary: z.string(),
  repos: z.array(GitHubRepoAnalysis),
  skillsWithPublicProof: z.array(z.string()),
  claimedSkillsLackingProof: z.array(z.string()),
});
export type GitHubProfileAnalysis = z.infer<typeof GitHubProfileAnalysis>;
