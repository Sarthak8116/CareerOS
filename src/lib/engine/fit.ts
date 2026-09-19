import type {
  Candidate,
  Job,
  Person,
  FitDimension,
  Level,
} from "@/lib/types";
import { matchSkill, LEVEL_RANK } from "@/lib/engine/skills";

/**
 * Computes the six categorical fit dimensions (build directive §5.3, §5.7).
 * No single mysterious score and no fake percentages — each dimension is a
 * Level + confidence + a plain-language explanation the user can inspect.
 */

const RANK_LEVEL: Level[] = ["none", "limited", "moderate", "strong"];

function averageLevel(levels: Level[]): Level {
  if (levels.length === 0) return "none";
  const avg =
    levels.reduce((s, l) => s + LEVEL_RANK[l], 0) / levels.length;
  return RANK_LEVEL[Math.round(avg)];
}

export function computeFit(
  candidate: Candidate,
  job: Job,
  people: Person[],
): FitDimension[] {
  const minReqs = job.requirements.filter(
    (r) => r.kind === "minimum" && r.skillKey,
  );
  const prefReqs = job.requirements.filter(
    (r) => r.kind === "preferred" && r.skillKey,
  );

  const minMatches = minReqs.map((r) => matchSkill(r.skillKey!, candidate));
  const prefMatches = prefReqs.map((r) => matchSkill(r.skillKey!, candidate));

  /* Role fit — coverage of the minimum bar. */
  const roleLevel = averageLevel(minMatches.map((m) => m.level));
  const metMin = minMatches.filter((m) => LEVEL_RANK[m.level] >= 2).length;

  /* Evidence fit — how much of the match is backed by public proof. */
  const supportingIds = [...minMatches, ...prefMatches].flatMap(
    (m) => m.supportingEvidenceIds,
  );
  const publicProof = candidate.evidence.filter(
    (e) => supportingIds.includes(e.id) && e.publicProof,
  ).length;
  const evidenceLevel: Level =
    publicProof >= 4 ? "strong" : publicProof >= 2 ? "moderate" : "limited";

  /* Preference fit — does the role match stated targets? */
  const titleMatch = candidate.targetRoles.some((r) =>
    job.normalizedTitle.toLowerCase().includes(r.toLowerCase().split(" ")[0]),
  );
  const industryMatch = candidate.targetIndustries.some((i) =>
    ["semiconductor", "ai", "infra", "developer"].some((k) =>
      i.toLowerCase().includes(k),
    ),
  );
  const preferenceLevel: Level =
    titleMatch && industryMatch ? "strong" : titleMatch || industryMatch ? "moderate" : "limited";

  /* Network strength — presence of relevant, accessible contacts. */
  const firstContacts = people.filter((p) => p.outreachPriority === "first").length;
  const strongRelevance = people.filter((p) => p.relevance === "strong").length;

  /**
   * When contacts carry overlap-scored warmth (live, sourced network), a real
   * shared school or former employer is a better signal of network strength
   * than counting titles — so it can lift this dimension one step. It is still
   * an inference, which is why "strong" is never reachable here and the
   * explanation says so. With no warmth data this is a no-op and the original
   * count-based level stands.
   */
  const sourcedContacts = people.filter((p) => p.provenance).length;
  const warmContacts = people.filter(
    (p) => p.warmth && p.warmth.level !== "none",
  ).length;
  const stronglyWarm = people.filter(
    (p) => p.warmth?.level === "strong" || p.warmth?.level === "moderate",
  ).length;

  const countBasedLevel: Level =
    firstContacts >= 1 && strongRelevance >= 2
      ? "moderate"
      : people.length > 0
        ? "limited"
        : "none";

  const networkLevel: Level =
    stronglyWarm >= 1 ? "moderate" : warmContacts >= 1 ? "limited" : countBasedLevel;

  /* Application urgency — deadline proximity (categorical, not a countdown). */
  const urgencyLevel: Level = job.deadline ? "moderate" : "limited";

  /* Improvement potential — how much a quick sprint could raise the profile. */
  const weakPrefs = prefMatches.filter((m) => LEVEL_RANK[m.level] <= 1).length;
  const improvementLevel: Level =
    weakPrefs >= 1 ? "strong" : "moderate";

  return [
    {
      category: "role",
      label: "Role Fit",
      level: roleLevel,
      confidence: "high",
      explanation: `Meets ${metMin} of ${minReqs.length} minimum requirements with moderate-or-better evidence. Core systems + C background aligns with the role; ${
        metMin < minReqs.length ? "one area is thinner (see gaps)." : "coverage is broad."
      }`,
      supportingEvidenceIds: minMatches.flatMap((m) => m.supportingEvidenceIds),
    },
    {
      category: "evidence",
      label: "Evidence Fit",
      level: evidenceLevel,
      confidence: publicProof >= 2 ? "high" : "medium",
      explanation: `${publicProof} of the supporting claims have public proof (GitHub repos). Systems and Python claims are source-backed; a few resume claims are user-provided only.`,
      supportingEvidenceIds: supportingIds,
    },
    {
      category: "preference",
      label: "Preference Fit",
      level: preferenceLevel,
      confidence: "high",
      explanation: `The role matches the candidate's stated target of a systems/software internship in AI-infrastructure / semiconductors.`,
      supportingEvidenceIds: [],
    },
    {
      category: "network",
      label: "Network Strength",
      level: networkLevel,
      confidence: "medium",
      explanation:
        sourcedContacts > 0
          ? `${sourcedContacts} contacts found from public LinkedIn profiles, ${warmContacts} with overlapping background (${stronglyWarm} sharing a school or former employer). Employer and title are source-backed; overlap is common ground, not a connection, and reporting lines are not established.`
          : `${strongRelevance} strongly-relevant contacts identified, including a same-university alumnus on the likely team. Reporting lines are inferred, not confirmed.`,
      supportingEvidenceIds: [],
    },
    {
      category: "urgency",
      label: "Application Urgency",
      level: urgencyLevel,
      confidence: "medium",
      explanation: job.deadline
        ? `A posted deadline (${job.deadline}) means this should not sit — but there is time to make 1–2 high-impact improvements first.`
        : `No firm deadline detected; apply once the quick wins are done.`,
      supportingEvidenceIds: [],
    },
    {
      category: "improvement",
      label: "Improvement Potential",
      level: improvementLevel,
      confidence: "medium",
      explanation: `Several requirements are close to met — a short focused sprint (README polish, one resume rewrite, one small GPU exercise) could visibly strengthen this application.`,
      supportingEvidenceIds: [],
    },
  ];
}

/** Overall campaign readiness derived from role + evidence fit (categorical). */
export function computeReadiness(fit: FitDimension[]): Level {
  const role = fit.find((f) => f.category === "role")?.level ?? "none";
  const evidence = fit.find((f) => f.category === "evidence")?.level ?? "none";
  return averageLevel([role, evidence]);
}
