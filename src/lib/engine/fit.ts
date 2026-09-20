import type {
  Candidate,
  Job,
  Person,
  FitDimension,
  Level,
} from "@/lib/types";
import { LEVEL_RANK } from "@/lib/engine/skills";
import { computeRequirementCoverage } from "@/lib/engine/keywords";

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
  // Coverage, not raw skill keys: an imported posting has no canonical
  // `skillKey`s, and reading only keyed requirements reported "meets 0 of 0"
  // for every real job while the coverage engine knew the actual answer.
  const coverage = computeRequirementCoverage(candidate, job);
  const minMatches = coverage.filter((r) => r.kind === "minimum");
  const prefMatches = coverage.filter((r) => r.kind === "preferred");
  const minReqs = minMatches;

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
  const jobText = `${job.company} ${job.team ?? ""} ${job.description}`.toLowerCase();
  const industryMatch = candidate.targetIndustries.some((industry) =>
    industry
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .some((word) => word.length > 3 && jobText.includes(word)),
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
  const closeToMet = coverage.filter((r) => r.state === "partially-covered").length;
  // Only a canonically-keyed preferred skill has a known quick path to proof.
  const weakPrefs = prefMatches.filter(
    (m) => m.skillKey && LEVEL_RANK[m.level] <= 1,
  ).length;
  const improvementLevel: Level =
    closeToMet >= 1 || weakPrefs >= 1 ? "strong" : "limited";
  const hasAlum = people.some((p) => /alum|same university/i.test(p.connection));

  return [
    {
      category: "role",
      label: "Role Fit",
      level: roleLevel,
      confidence: minReqs.length === 0 ? "low" : "high",
      explanation:
        minReqs.length === 0
          ? "This posting lists no minimum requirements we could read, so role fit cannot be judged from it."
          : `Meets ${metMin} of ${minReqs.length} minimum requirements with moderate-or-better evidence; ${
              metMin < minReqs.length
                ? `${minReqs.length - metMin} ${minReqs.length - metMin === 1 ? "is" : "are"} thinner or unanswered (see gaps).`
                : "coverage is broad."
            }`,
      supportingEvidenceIds: minMatches.flatMap((m) => m.supportingEvidenceIds),
    },
    {
      category: "evidence",
      label: "Evidence Fit",
      level: evidenceLevel,
      confidence: publicProof >= 2 ? "high" : "medium",
      explanation: `${publicProof} of the ${new Set(supportingIds).size} evidence items supporting this role have public proof someone can check.`,
      supportingEvidenceIds: supportingIds,
    },
    {
      category: "preference",
      label: "Preference Fit",
      level: preferenceLevel,
      confidence: "high",
      explanation:
        titleMatch && industryMatch
          ? "The title and the company's area both match your stated targets."
          : titleMatch
            ? "The title matches a role you are targeting; the company's area is outside your stated industries."
            : industryMatch
              ? "The company's area matches your stated industries, but the title is not one you listed as a target."
              : "Neither the title nor the company's area matches your stated targets — worth a deliberate decision before investing in it.",
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
          : people.length === 0
            ? "No contacts identified yet for this company."
            : `${strongRelevance} strongly-relevant contacts identified${hasAlum ? ", including someone from your university" : ""}. Reporting lines are inferred, not confirmed.`,
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
      explanation:
        closeToMet >= 1
          ? `${closeToMet} ${closeToMet === 1 ? "requirement is" : "requirements are"} partly met — a short focused sprint on wording and public proof could visibly strengthen this application.`
          : weakPrefs >= 1
            ? "A preferred skill is within reach of one small, focused project."
            : "Few requirements are partly met, so quick wins are limited; larger gaps need new evidence.",
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
