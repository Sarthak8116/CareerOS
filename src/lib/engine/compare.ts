import type {
  Candidate,
  Job,
  JobComparison,
  CompareDimension,
  Level,
} from "@/lib/types";
import { matchSkill, LEVEL_RANK, type SkillMatch } from "@/lib/engine/skills";

/**
 * Job Comparison engine (§5.4). Ranks a set of cached jobs for one candidate
 * across categorical dimensions. Every fit-related dimension is GROUNDED in
 * matchSkill over the job's canonical skillKeys, no invented scores, no fake
 * compensation numbers, no randomness or wall-clock reads (§16, §18).
 *
 * All conclusions are categorical Levels (strong / moderate / limited / none).
 */

const RANK_LEVEL: Level[] = ["none", "limited", "moderate", "strong"];

/** Average a set of Levels into a single categorical Level (empty -> "none"). */
function aggregateLevel(levels: Level[]): Level {
  if (levels.length === 0) return "none";
  const avg =
    levels.reduce((sum, l) => sum + LEVEL_RANK[l], 0) / levels.length;
  return RANK_LEVEL[Math.round(avg)];
}

/** Human-friendly count phrase for a level bucket, kept short for the table. */
function summarize(matches: SkillMatch[]): {
  metCount: number;
  gapCount: number;
} {
  const metCount = matches.filter((m) => m.level !== "none").length;
  const gapCount = matches.filter((m) => m.level === "none").length;
  return { metCount, gapCount };
}

/** Resolve the candidate's match for each requirement of a given kind that
 *  carries a canonical skillKey. */
function skillMatchesForKind(
  job: Job,
  candidate: Candidate,
  kind: "minimum" | "preferred",
): SkillMatch[] {
  return job.requirements
    .filter((r) => r.kind === kind && r.skillKey)
    .map((r) => matchSkill(r.skillKey as string, candidate));
}

function hardDimension(job: Job, candidate: Candidate): {
  dim: CompareDimension;
  level: Level;
} {
  const matches = skillMatchesForKind(job, candidate, "minimum");
  const level = aggregateLevel(matches.map((m) => m.level));
  const { metCount, gapCount } = summarize(matches);
  const note =
    matches.length === 0
      ? "No skill-mapped minimum requirements."
      : `${metCount}/${matches.length} hard requirements evidenced` +
        (gapCount ? `, ${gapCount} with no supporting evidence.` : ".");
  return { dim: { category: "Hard requirements", level, note }, level };
}

function preferredDimension(job: Job, candidate: Candidate): {
  dim: CompareDimension;
  level: Level;
} {
  const matches = skillMatchesForKind(job, candidate, "preferred");
  const level = aggregateLevel(matches.map((m) => m.level));
  const { metCount } = summarize(matches);
  const note =
    matches.length === 0
      ? "No preferred skills specified."
      : `${metCount}/${matches.length} preferred skills partially covered, the rest are upside.`;
  return { dim: { category: "Preferred requirements", level, note }, level };
}

/** Location fit is categorical: remote/hybrid is friction-free; onsite in the
 *  candidate's metro is strong; onsite elsewhere is a relocation (moderate for
 *  an internship). We compare metros by the state/city token, no distance math. */
function locationDimension(job: Job, candidate: Candidate): CompareDimension {
  if (job.remote === "remote") {
    return {
      category: "Location",
      level: "strong",
      note: "Remote, no relocation required.",
    };
  }
  const sameMetro = job.location
    .toLowerCase()
    .includes(candidate.location.split(",")[0].trim().toLowerCase());
  if (sameMetro) {
    return {
      category: "Location",
      level: "strong",
      note: `${job.location} matches the candidate's base.`,
    };
  }
  const level: Level = job.remote === "hybrid" ? "moderate" : "limited";
  return {
    category: "Location",
    level,
    note:
      job.remote === "hybrid"
        ? `${job.location}, hybrid, relocation for an internship, some on-site days.`
        : `${job.location}, on-site, requires relocating from ${candidate.location}.`,
  };
}

/** Sponsorship fit is grounded in the candidate's work authorization. A citizen
 *  who needs no sponsorship is never blocked; otherwise the job's policy governs. */
function sponsorshipDimension(job: Job, candidate: Candidate): CompareDimension {
  const needsNone = /citizen|no sponsorship/i.test(candidate.workAuthorization);
  if (needsNone) {
    return {
      category: "Sponsorship",
      level: "strong",
      note: "Candidate needs no sponsorship, not a constraint.",
    };
  }
  if (job.sponsorship === "offered") {
    return {
      category: "Sponsorship",
      level: "strong",
      note: "Employer offers sponsorship.",
    };
  }
  if (job.sponsorship === "not-offered") {
    return {
      category: "Sponsorship",
      level: "none",
      note: "Employer does not sponsor, likely a hard blocker.",
    };
  }
  return {
    category: "Sponsorship",
    level: "limited",
    note: "Sponsorship policy unclear, verify before investing.",
  };
}

/** Learning potential is HIGH when the role exposes the candidate to skills
 *  they lack or only weakly hold, i.e. the gaps are the upside. */
function learningDimension(job: Job, candidate: Candidate): CompareDimension {
  const all = [
    ...skillMatchesForKind(job, candidate, "minimum"),
    ...skillMatchesForKind(job, candidate, "preferred"),
  ];
  const stretch = all.filter(
    (m) => m.level === "none" || m.level === "limited",
  ).length;
  let level: Level;
  if (stretch >= 2) level = "strong";
  else if (stretch === 1) level = "moderate";
  else level = "limited";
  const note =
    stretch === 0
      ? "Mostly plays to existing strengths, modest new-skill growth."
      : `${stretch} skill area(s) beyond current evidence, strong room to grow.`;
  return { category: "Learning potential", level, note };
}

/** Likelihood of interview tracks hard-requirement fit (what screeners gate on),
 *  softened one notch when key evidence lacks public proof. */
function interviewDimension(hardLevel: Level, job: Job, candidate: Candidate): CompareDimension {
  const matches = skillMatchesForKind(job, candidate, "minimum");
  const lowConfidence =
    matches.length > 0 &&
    matches.every((m) => m.level === "none" || m.confidence === "low");
  let level = hardLevel;
  if (lowConfidence && level !== "none") {
    level = RANK_LEVEL[Math.max(0, LEVEL_RANK[level] - 1)];
  }
  const note =
    level === "strong"
      ? "Hard requirements well-evidenced, competitive at screen."
      : level === "moderate"
        ? "Core requirements met; a sharper resume lifts callback odds."
        : level === "limited"
          ? "Thin evidence on gating requirements, needs a build-campaign first."
          : "Missing gating requirements, a cold apply is unlikely to convert.";
  return { category: "Likelihood of interview", level, note };
}

/** Network opportunity is honest: without the outreach/graph engine we have no
 *  mapped contacts, so this is categorically unresolved (limited), not invented. */
function networkDimension(job: Job): CompareDimension {
  return {
    category: "Network opportunity",
    level: "limited",
    note: `No mapped contacts at ${job.company} yet, run the network engine to warm a path.`,
  };
}

/**
 * Recommendation is driven by what screeners actually gate on, the HARD
 * requirements, with preferred skills and sponsorship as modifiers.
 *  - clears the bar strongly AND already covers the nice-to-haves -> apply now
 *  - clears the bar but preferred skills are thin -> a short campaign sharpens it
 *  - partial on the bar -> research/close gaps first
 *  - sponsorship blocked -> reject
 */
function recommendationFor(
  hard: Level,
  preferred: Level,
  sponsorship: Level,
): JobComparison["recommendation"] {
  if (sponsorship === "none") return "reject"; // hard blocker
  if (hard === "strong") {
    return preferred === "strong" ? "apply-now" : "build-campaign";
  }
  if (hard === "moderate") return "build-campaign";
  if (hard === "limited") return "research-further";
  return "save-for-later"; // hard === "none"
}

/**
 * Compare a batch of jobs for one candidate. Deterministic; input order is
 * preserved so the flagship job stays first.
 */
export function compareJobs(
  candidate: Candidate,
  jobs: Job[],
): JobComparison[] {
  return jobs.map((job) => {
    const { dim: hardDim, level: hardLevel } = hardDimension(job, candidate);
    const { dim: prefDim, level: prefLevel } = preferredDimension(
      job,
      candidate,
    );

    // Overall fit is the categorical average of every skill-mapped requirement
    // (minimum + preferred), so genuine gaps pull it down honestly.
    const allMatches = [
      ...skillMatchesForKind(job, candidate, "minimum"),
      ...skillMatchesForKind(job, candidate, "preferred"),
    ];
    const overall = aggregateLevel(allMatches.map((m) => m.level));

    const location = locationDimension(job, candidate);
    const sponsorship = sponsorshipDimension(job, candidate);
    const learning = learningDimension(job, candidate);
    const interview = interviewDimension(hardLevel, job, candidate);
    const network = networkDimension(job);

    const overallNote =
      overall === "strong"
        ? "Strong all-around fit."
        : overall === "moderate"
          ? "Solid core fit with addressable gaps."
          : overall === "limited"
            ? "Partial fit, meaningful gaps to close first."
            : "Weak fit against the stated requirements.";

    const dimensions: CompareDimension[] = [
      { category: "Overall fit", level: overall, note: overallNote },
      hardDim,
      prefDim,
      location,
      sponsorship,
      learning,
      interview,
      network,
    ];

    return {
      jobId: job.id,
      title: job.title,
      company: job.company,
      dimensions,
      recommendation: recommendationFor(hardLevel, prefLevel, sponsorship.level),
    };
  });
}
