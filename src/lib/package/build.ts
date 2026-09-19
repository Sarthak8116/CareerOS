import type {
  ApplicationAnswer,
  ApplicationPackage,
  Campaign,
  Candidate,
  PackageDocument,
} from "@/lib/types";
import { ApplicationPackage as ApplicationPackageSchema } from "@/lib/types";
import { documentFileName, packageFolderName } from "@/lib/package/filenames";
import {
  coverLetterClaims,
  deterministicCoverLetter,
  renderCoverLetter,
  type CoverLetterDraft,
  type CoverLetterOrigin,
} from "@/lib/package/coverLetter";
import { buildResumeDocument } from "@/lib/package/resumeDoc";
import { buildShortAnswers } from "@/lib/package/shortAnswers";
import { buildPersonalInfo } from "@/lib/package/personalInfo";

/**
 * The application package builder.
 *
 * Assembles one campaign into the four documents the posting asks for, and —
 * just as importantly — the plain-language list of what it asks for that we
 * did NOT produce.
 *
 * "COMPLETE" IS A CLAIM, NOT A LABEL. `completeness` is derived from `missing`
 * by `deriveCompleteness` and by nothing else, so the two cannot drift: a
 * package is complete exactly when there is nothing left for the user to
 * supply. Four files existing is not the same thing.
 *
 * Pure: no I/O, no Date, no randomness. `builtAt` is passed in by the caller
 * and the live cover-letter draft (if any) is passed in already generated, so
 * the same inputs always produce the same package.
 */

export interface BuildPackageInput {
  campaign: Campaign;
  candidate: Candidate;
  /** The answer library. Passed in — `lib/answers.ts` is a client module. */
  library: ApplicationAnswer[];
  /** ISO timestamp from the caller. Never `new Date()` inside this engine. */
  builtAt: string;
  /**
   * A model-generated cover letter. ABSENT is the normal, supported case:
   * without an API key we assemble one from the evidence graph instead, the
   * same way the rest of live mode degrades.
   */
  coverLetter?: CoverLetterDraft;
}

/**
 * The ONLY place completeness is computed. Never assign the field directly.
 */
export function deriveCompleteness(missing: string[]): "complete" | "partial" {
  return missing.length === 0 ? "complete" : "partial";
}

export interface BuiltPackage {
  package: ApplicationPackage;
  /** How the cover letter was produced. Shown to the user, never inferred. */
  coverLetterOrigin: CoverLetterOrigin | "none";
}

export function buildApplicationPackage(input: BuildPackageInput): BuiltPackage {
  const { campaign, candidate, library, builtAt } = input;
  const job = campaign.job;
  const form = campaign.applicationForm;

  const folderName = packageFolderName(job);
  const missing: string[] = [];
  const documents: PackageDocument[] = [];

  /* --- Resume ----------------------------------------------------- */
  const resume = buildResumeDocument({ candidate, job, form });
  missing.push(...resume.missing);
  documents.push({
    kind: "resume",
    fileName: documentFileName("resume", job),
    status: resume.status,
    content: resume.content,
    claims: resume.claims,
  });

  /* --- Cover letter ----------------------------------------------- */
  let coverLetterOrigin: CoverLetterOrigin | "none" = "none";
  if (form?.coverLetter === "not-requested") {
    documents.push({
      kind: "cover-letter",
      fileName: documentFileName("cover-letter", job),
      status: "not-requested",
      content: "",
      claims: [],
    });
  } else {
    const draft = input.coverLetter ?? deterministicCoverLetter(candidate, job);
    coverLetterOrigin = input.coverLetter ? "model" : "deterministic";
    documents.push({
      kind: "cover-letter",
      fileName: documentFileName("cover-letter", job),
      status: "drafted",
      content: renderCoverLetter(draft),
      claims: coverLetterClaims(draft, candidate),
    });
  }

  /* --- Short answers ---------------------------------------------- */
  const shortAnswers = buildShortAnswers({
    form,
    library,
    jobTitle: job.title,
    company: job.company,
  });
  missing.push(...shortAnswers.missing);
  documents.push({
    kind: "short-answers",
    fileName: documentFileName("short-answers", job),
    status: shortAnswers.status,
    content: shortAnswers.content,
    claims: shortAnswers.claims,
  });

  /* --- Personal information --------------------------------------- */
  const personal = buildPersonalInfo({ candidate, form });
  missing.push(...personal.missing);
  documents.push({
    kind: "personal-info",
    fileName: documentFileName("personal-info", job),
    status: personal.status,
    content: personal.content,
    claims: personal.claims,
  });

  /* --- Things we produce no document for at all -------------------- */
  if (form?.portfolio === "required" || form?.portfolio === "optional") {
    missing.push(
      "A portfolio or work samples — this application asks for them and CareerOS does not assemble them.",
    );
  }

  /* --- What we could not read ------------------------------------- */
  // "We could not read this" and "we chose not to" are different things and
  // are never collapsed: unknowns land in `missing`, excludedSections are
  // carried through and disclosed separately.
  if (!form) {
    missing.push(
      "The application's own requirements — CareerOS never read a form for this posting, so this package is built on what it could infer from the job description alone.",
    );
  } else if (form.completeness !== "complete") {
    missing.push(
      "The rest of the application form — CareerOS read only part of it, so it cannot tell you this package is everything the employer asks for.",
    );
    missing.push(...form.unknowns);
  }

  const built: ApplicationPackage = {
    campaignId: campaign.id,
    jobId: job.id,
    builtAt,
    folderName,
    documents,
    completeness: deriveCompleteness(missing),
    missing,
    excludedSections: form?.excludedSections ?? [],
  };

  return {
    // Validate our own assembly before anyone renders or zips it.
    package: ApplicationPackageSchema.parse(built),
    coverLetterOrigin,
  };
}
