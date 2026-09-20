import { z } from "zod";
import {
  Confidence,
  HarvestProvenance,
  Level,
  TrustLabel,
} from "@/lib/types/core";

/* ================================================================== */
/* PHASE 3 CONTRACTS, shared schemas for the parallel agent fleet.    */
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
/* PHASE 5 CONTRACTS, broader product (saved jobs, answers, GitHub).  */
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

/* ================================================================== */
/* P2 CONTRACTS, the application package (the downloadable .zip).     */
/* Frozen before implementation; additive to everything above.         */
/* ================================================================== */

/**
 * What a sentence in a generated document actually rests on.
 *
 *  - "evidenced"    , it cites an Evidence row in the candidate's graph.
 *  - "user-provided", it restates something the user themselves supplied
 *                      (a stored profile field, a saved answer, their own
 *                      stated intent to apply). Not evidence, but not ours.
 *  - "unsupported"  , nothing backs it. The UI flags these BEFORE export is
 *                      offered; a package may legitimately contain them, but
 *                      the user must see them first.
 */
export const PackageClaimSupport = z.enum([
  "evidenced",
  "user-provided",
  "unsupported",
]);
export type PackageClaimSupport = z.infer<typeof PackageClaimSupport>;

/**
 * One factual statement from a generated document, with what backs it.
 *
 * Cover-letter prose is the highest-risk generation in this product, free
 * text about a real person, so every sentence carries one of these rather
 * than the document carrying a single overall verdict.
 */
export const PackageClaim = z.object({
  text: z.string(),
  support: PackageClaimSupport,
  /** Set only when `support` is "evidenced": the Evidence id it cites. */
  evidenceId: z.string().optional(),
});
export type PackageClaim = z.infer<typeof PackageClaim>;

export const PackageDocumentKind = z.enum([
  "resume",
  "cover-letter",
  "short-answers",
  "personal-info",
]);
export type PackageDocumentKind = z.infer<typeof PackageDocumentKind>;

/**
 * How a document came to be. The "drafted"/"reused" split is load-bearing:
 * calling a library answer "drafted" would claim the product wrote something
 * for this posting when it pulled it from a drawer.
 *
 *  - "drafted"      , CareerOS produced this FOR this posting.
 *  - "reused"       , pulled from the answer library / stored profile as-is.
 *  - "needs-you"    , the application asks for it and we could not supply it;
 *                      the file says exactly what the user must write.
 *  - "not-requested", we read the WHOLE form and it does not ask for this.
 *                      Only a form whose completeness is "complete" can say
 *                      this; anything less says "needs-you" and asks.
 */
export const PackageDocumentStatus = z.enum([
  "drafted",
  "reused",
  "needs-you",
  "not-requested",
]);
export type PackageDocumentStatus = z.infer<typeof PackageDocumentStatus>;

export const PackageDocument = z.object({
  kind: PackageDocumentKind,
  /** SANITIZED, derives from scraped title/company. See lib/package/filenames.ts. */
  fileName: z.string(),
  status: PackageDocumentStatus,
  content: z.string(),
  claims: z.array(PackageClaim),
});
export type PackageDocument = z.infer<typeof PackageDocument>;

/**
 * Everything the posting asks for, assembled into one downloadable folder.
 *
 * `completeness` is DERIVED from `missing` and must never be set directly,
 * see `deriveCompleteness` in `lib/package/build.ts`, which is the only place
 * that computes it. "Complete" is a claim about the employer's form, not a
 * label we get to apply because four files exist.
 */
export const ApplicationPackage = z.object({
  campaignId: z.string(),
  jobId: z.string(),
  builtAt: z.string(),
  /** SANITIZED, the single folder every entry lives under. */
  folderName: z.string(),
  documents: z.array(PackageDocument),
  /** DERIVED from `missing`. Never assign this directly. */
  completeness: z.enum(["complete", "partial"]),
  /** Plain-language sentences: what the form asks for that we did NOT produce. */
  missing: z.array(z.string()),
  /** Carried through from ApplicationForm, the EEO block we never parse. */
  excludedSections: z.array(z.string()),
});
export type ApplicationPackage = z.infer<typeof ApplicationPackage>;
