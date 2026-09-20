import { z } from "zod";
import type {
  Candidate,
  Evidence,
  Job,
  JobRequirement,
  PackageClaim,
} from "@/lib/types";
import { groundSentences, type GroundedSentence } from "@/lib/package/claims";
import { overlap } from "@/lib/package/match";

/**
 * Cover-letter drafting, the highest-risk generation in the product.
 *
 * This module is PURE. It owns the shape a letter must take, the deterministic
 * letter we assemble when no model is available, the rendering, and the
 * grounding pass. The live model call lives in `lib/package/live.ts` behind a
 * `server-only` guard; it returns a draft in exactly this shape and is graded
 * by exactly the same `groundSentences` pass, so a live letter can never be
 * held to a weaker standard than the deterministic one.
 *
 * The sentence-level shape is the whole design. A letter is not a blob of
 * prose we check afterwards, the generator must commit, per sentence, to what
 * the sentence is doing and which evidence backs it. A sentence that cannot
 * name its evidence is either about the posting, or it is unsupported, and the
 * UI shows the user which before offering the download.
 */

export const CoverLetterSentence = z.object({
  text: z.string().min(1).max(400),
  /** "evidence" | "profile" | "intent", see lib/package/claims.ts. */
  role: z.enum(["evidence", "profile", "intent"]),
  /** REQUIRED for role "evidence": an Evidence id from the candidate's graph. */
  evidenceId: z.string().optional(),
});
export type CoverLetterSentence = z.infer<typeof CoverLetterSentence>;

export const CoverLetterDraft = z.object({
  /** No invented recipient name, "Dear Hiring Team," unless the posting named one. */
  greeting: z.string().min(1).max(120),
  paragraphs: z
    .array(z.object({ sentences: z.array(CoverLetterSentence).min(1).max(6) }))
    .min(1)
    .max(5),
  closing: z.string().min(1).max(200),
});
export type CoverLetterDraft = z.infer<typeof CoverLetterDraft>;

/** How the draft was produced. Shown to the user; never inferred later. */
export type CoverLetterOrigin = "model" | "deterministic";

export function letterSentences(draft: CoverLetterDraft): GroundedSentence[] {
  return draft.paragraphs.flatMap((p) => p.sentences);
}

/** Grade every sentence against the candidate's evidence graph. */
export function coverLetterClaims(
  draft: CoverLetterDraft,
  candidate: Candidate,
): PackageClaim[] {
  return groundSentences(letterSentences(draft), candidate);
}

/* ------------------------------------------------------------------ */
/* Deterministic assembly (no API key)                                 */
/* ------------------------------------------------------------------ */

const STRENGTH_RANK: Record<Evidence["strength"], number> = {
  strong: 3,
  moderate: 2,
  limited: 1,
  none: 0,
};

const REQUIREMENT_RANK: Record<JobRequirement["kind"], number> = {
  minimum: 0,
  preferred: 1,
  responsibility: 2,
};

/**
 * Pick the evidence that best answers each requirement, strongest first.
 *
 * Deterministic throughout: requirements are visited in (kind, original
 * order); ties between equally-overlapping evidence break on strength and then
 * on id, so the same candidate and job always produce the same letter.
 */
export function selectEvidenceForJob(
  candidate: Candidate,
  job: Job,
  limit: number,
): { evidence: Evidence; requirement?: JobRequirement }[] {
  const chosen: { evidence: Evidence; requirement?: JobRequirement }[] = [];
  const used = new Set<string>();

  const requirements = [...job.requirements].sort(
    (a, b) => REQUIREMENT_RANK[a.kind] - REQUIREMENT_RANK[b.kind],
  );

  for (const requirement of requirements) {
    if (chosen.length >= limit) break;
    const best = candidate.evidence
      .filter((e) => !used.has(e.id) && overlap(requirement.text, e.claim).shared > 0)
      .sort((a, b) => {
        const byMatch =
          overlap(requirement.text, b.claim).shared -
          overlap(requirement.text, a.claim).shared;
        if (byMatch !== 0) return byMatch;
        const byStrength = STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength];
        if (byStrength !== 0) return byStrength;
        return a.id.localeCompare(b.id);
      })[0];
    if (!best) continue;
    used.add(best.id);
    chosen.push({ evidence: best, requirement });
  }

  // Nothing matched (or the posting listed no requirements): fall back to the
  // candidate's strongest publicly-provable work, still deterministically.
  if (chosen.length === 0) {
    const fallback = [...candidate.evidence]
      .sort((a, b) => {
        const byStrength = STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength];
        if (byStrength !== 0) return byStrength;
        if (a.publicProof !== b.publicProof) return a.publicProof ? -1 : 1;
        return a.id.localeCompare(b.id);
      })
      .slice(0, limit);
    for (const evidence of fallback) chosen.push({ evidence });
  }

  return chosen.slice(0, limit);
}

/** How many evidence sentences the deterministic letter body contains. */
export const DETERMINISTIC_BODY_SENTENCES = 3;

/**
 * How a body sentence names the requirement it answers.
 *
 * These are OUR words, keyed off the requirement's kind, the posting's own
 * wording is deliberately NOT quoted into the sentence. A graded sentence must
 * contain only what the candidate is asserting: quoting an employer who writes
 * "reduce p99 latency by 30%" would put the employer's number inside the
 * candidate's claim, where the numeric-precision check in `claims.ts` reads it
 * as precision the candidate invented. Keeping employer text out of the claim
 * is the fix; loosening that check would not be.
 */
const CONNECTIVE: Record<JobRequirement["kind"], string> = {
  minimum: "which is what you list as essential for this role",
  preferred: "which covers one of your preferred qualifications",
  responsibility: "which is the kind of work this role is responsible for",
};

/**
 * Assemble a letter from the evidence graph alone.
 *
 * Every body sentence QUOTES an evidence claim verbatim and cites its id, so
 * the grounding pass marks it "evidenced" without the module having to assert
 * anything of its own. It reads like an assembled letter because it is one,
 * that honesty is the point, not a limitation to paper over.
 */
export function deterministicCoverLetter(
  candidate: Candidate,
  job: Job,
): CoverLetterDraft {
  const opening: CoverLetterSentence[] = [
    {
      text: `I am writing to apply for the ${job.title} position at ${job.company}.`,
      role: "intent",
    },
  ];
  if (candidate.headline && candidate.location) {
    opening.push({
      text: `I am ${candidate.headline}, based in ${candidate.location}.`,
      role: "profile",
    });
  }

  const body: CoverLetterSentence[] = selectEvidenceForJob(
    candidate,
    job,
    DETERMINISTIC_BODY_SENTENCES,
  ).map(({ evidence, requirement }) => ({
    text: `${evidence.claim}${requirement ? `: ${CONNECTIVE[requirement.kind]}` : ""}.`,
    role: "evidence" as const,
    evidenceId: evidence.id,
  }));

  const close: CoverLetterSentence[] = [
    {
      text: `I would welcome the chance to talk about the ${job.title} role and where I could contribute.`,
      role: "intent",
    },
    {
      text: "This draft was assembled from my own recorded evidence; I have reviewed and edited it before sending.",
      role: "intent",
    },
  ];

  return {
    greeting: "Dear Hiring Team,",
    paragraphs: [
      { sentences: opening },
      ...(body.length > 0 ? [{ sentences: body }] : []),
      { sentences: close },
    ],
    closing: `Sincerely,\n${candidate.name}`,
  };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

/**
 * Render a draft to the plain text that goes in the .zip.
 *
 * No claim labels are written into the letter itself, it has to be a document
 * the user can actually send. The per-sentence grading rides alongside it on
 * `PackageDocument.claims`, which is what the UI shows before export.
 */
export function renderCoverLetter(draft: CoverLetterDraft): string {
  const body = draft.paragraphs
    .map((p) => p.sentences.map((s) => s.text.trim()).join(" "))
    .filter((p) => p.length > 0)
    .join("\n\n");
  return `${draft.greeting.trim()}\n\n${body}\n\n${draft.closing.trim()}\n`;
}
