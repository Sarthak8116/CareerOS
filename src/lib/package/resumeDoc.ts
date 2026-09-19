import type {
  ApplicationForm,
  Candidate,
  Evidence,
  EvidenceCategory,
  Job,
  PackageClaim,
  PackageDocumentStatus,
} from "@/lib/types";
import { groundSentences } from "@/lib/package/claims";
import { overlap } from "@/lib/package/match";

/**
 * The resume document.
 *
 * SCOPE: P2 PACKAGES what already exists. This document is assembled from the
 * candidate's own evidence graph — every bullet is an Evidence claim VERBATIM,
 * with its source reference — and ordered so the work that answers this
 * posting's requirements comes first. Nothing is rewritten, because rewriting
 * is `engine/resume.ts`'s hardcoded recommendation bank, which is keyed to the
 * demo candidate's evidence ids; dropping that prose into a real person's
 * resume would be fabrication, and de-hardcoding it is P3.
 *
 * Bullets are graded by the same `groundSentences` pass as the cover letter,
 * so an evidence row the honesty pass distrusts (weak inference, unverifiable
 * metric) is marked unsupported here too rather than being laundered into a
 * resume by the act of copying it.
 *
 * Pure: no I/O, no Date, no randomness.
 */

const CATEGORY_ORDER: EvidenceCategory[] = [
  "experience",
  "project",
  "skill",
  "achievement",
  "leadership",
  "education",
];

const CATEGORY_HEADINGS: Record<EvidenceCategory, string> = {
  experience: "Experience",
  project: "Projects",
  skill: "Skills",
  achievement: "Achievements",
  leadership: "Leadership",
  education: "Education & Coursework",
};

/**
 * Evidence that answers a requirement in this posting, strongest match first.
 * Deterministic: ties break on evidence id.
 */
export function relevantEvidence(candidate: Candidate, job: Job): Evidence[] {
  const scored = candidate.evidence
    .map((evidence) => ({
      evidence,
      score: job.requirements.reduce(
        (best, requirement) =>
          Math.max(best, overlap(requirement.text, evidence.claim).shared),
        0,
      ),
    }))
    .filter((row) => row.score > 0);

  return scored
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.evidence.id.localeCompare(b.evidence.id),
    )
    .map((row) => row.evidence);
}

function bullet(evidence: Evidence): string {
  const ref =
    evidence.publicProof && evidence.sourceReference
      ? ` (${evidence.sourceReference})`
      : "";
  return `- ${evidence.claim}${ref}`;
}

export interface ResumeDocument {
  status: PackageDocumentStatus;
  content: string;
  claims: PackageClaim[];
  missing: string[];
}

export function buildResumeDocument(input: {
  candidate: Candidate;
  job: Job;
  form?: ApplicationForm;
}): ResumeDocument {
  const { candidate, job, form } = input;

  if (form?.resume === "not-requested") {
    return { status: "not-requested", content: "", claims: [], missing: [] };
  }

  const relevant = relevantEvidence(candidate, job);
  const relevantIds = new Set(relevant.map((e) => e.id));
  const rest = candidate.evidence.filter((e) => !relevantIds.has(e.id));

  const links = [
    candidate.links.github,
    candidate.links.linkedin,
    candidate.links.portfolio,
  ].filter((link): link is string => Boolean(link));

  const lines: string[] = [
    `# ${candidate.name}`,
    "",
    [candidate.headline, candidate.location].filter(Boolean).join(" · "),
  ];
  if (links.length > 0) lines.push(links.join(" · "));
  lines.push(
    "",
    `_Assembled by CareerOS from your recorded evidence for ${job.title} at ${job.company}. ` +
      "Every line below is something you already recorded — nothing was rewritten or added. " +
      "Format it into your own resume file before you upload it._",
    "",
    "## Education",
    "",
    `- ${candidate.degree}, ${candidate.university} (${candidate.graduationYear})`,
  );

  if (relevant.length > 0) {
    lines.push("", "## Most relevant to this role", "", ...relevant.map(bullet));
  }

  for (const category of CATEGORY_ORDER) {
    const inCategory = rest.filter((e) => e.category === category);
    if (inCategory.length === 0) continue;
    lines.push("", `## ${CATEGORY_HEADINGS[category]}`, "", ...inCategory.map(bullet));
  }

  const ordered = [...relevant, ...rest];
  const claims = groundSentences(
    ordered.map((evidence) => ({
      text: evidence.claim,
      role: "evidence" as const,
      evidenceId: evidence.id,
    })),
    candidate,
  );

  // The employer asks for a FILE. We produce a draft in Markdown, and saying
  // that out loud is the difference between a package the user can trust and
  // one that quietly overstates what it did.
  const missing =
    form?.resume === "required" || form?.resume === "optional"
      ? [
          "A resume file to upload — this package contains a Markdown draft assembled from your evidence, not a formatted PDF the employer's form will accept.",
        ]
      : [];

  return { status: "drafted", content: `${lines.join("\n")}\n`, claims, missing };
}
