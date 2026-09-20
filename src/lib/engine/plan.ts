import type {
  Gap,
  Person,
  CampaignTask,
  AgentActivity,
  Job,
  Candidate,
  FitDimension,
} from "@/lib/types";
import { ELIGIBILITY } from "@/lib/engine/gaps";

/**
 * Campaign Planner (build directive §5.18) — turns gaps + network into an
 * ordered, dependency-aware task list, each with a responsible agent.
 */

const IMPORTANCE_TO_PRIORITY: Record<
  Gap["importance"],
  CampaignTask["priority"]
> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

const ACTION_TO_CATEGORY: Record<string, CampaignTask["category"]> = {
  "rewrite-bullet": "resume",
  "add-evidence": "resume",
  "improve-readme": "resume",
  "highlight-project": "resume",
  "build-project": "learning",
  "learning-sprint": "learning",
  "prep-interview-story": "interview",
  "ask-employee": "outreach",
  "apply-anyway": "application",
  "do-not-apply": "application",
};

export function computeTasks(
  gaps: Gap[],
  people: Person[],
  job: Job,
): CampaignTask[] {
  const tasks: CampaignTask[] = [];

  // 1) One task per meaningful gap.
  for (const gap of gaps) {
    if (gap.action.kind === "apply-anyway") continue;
    tasks.push({
      id: `task_${gap.id}`,
      title: gap.action.summary,
      category: ACTION_TO_CATEGORY[gap.action.kind] ?? "application",
      priority: IMPORTANCE_TO_PRIORITY[gap.importance],
      impact: gap.action.expectedImpact,
      effort: gap.action.effort,
      status: "todo",
      sourceGapId: gap.id,
      responsibleAgent: "Resume Strategist",
    });
  }

  // 2) Outreach to the strongest warm lead.
  const firstContact =
    people.find((p) => p.outreachPriority === "first") ?? people[0];
  if (firstContact) {
    tasks.push({
      id: "task_outreach_first",
      title: `Reach out to ${firstContact.name} (${firstContact.connection.split(" —")[0]})`,
      category: "outreach",
      priority: "high",
      impact: "strong",
      effort: "quick",
      status: "todo",
      responsibleAgent: "Outreach Strategist",
    });
  }

  // 3) Submit the application.
  tasks.push({
    id: "task_apply",
    title: "Submit a tailored application",
    category: "application",
    priority: "high",
    impact: "strong",
    effort: "moderate",
    status: "todo",
    responsibleAgent: "Campaign Planner",
  });

  // 4) Interview prep.
  tasks.push({
    id: "task_interview",
    title: interviewPrepTitle(job),
    category: "interview",
    priority: "medium",
    impact: "moderate",
    effort: "moderate",
    status: "todo",
    responsibleAgent: "Interview Strategist",
  });

  return tasks;
}

/** Prep topics come from what THIS posting asks for, not a fixed syllabus. */
function interviewPrepTitle(job: Job): string {
  const topics = job.requirements
    .filter((r) => r.kind !== "responsibility" && !ELIGIBILITY.test(r.text))
    .slice(0, 2)
    .map((r) => (r.text.length > 48 ? `${r.text.slice(0, 45).trimEnd()}…` : r.text));
  return topics.length > 0
    ? `Prepare to speak to: ${topics.join("; ")}`
    : "Prepare two stories from your strongest recorded work";
}

/**
 * Agent Activity feed (§7): concise actions/conclusions with confidence —
 * never private model reasoning. This is the "visible swarm" the demo shows.
 */
export function computeActivity(
  candidate: Candidate,
  job: Job,
  fit: FitDimension[],
  gaps: Gap[],
  people: Person[],
): AgentActivity[] {
  const roleFit = fit.find((f) => f.category === "role")?.level ?? "moderate";
  const trueGap = gaps.find((g) => g.classification === "true-skill-gap");
  const alum = people.find((p) => p.outreachPriority === "first");

  return [
    {
      agent: "Job Parser",
      message: `Parsed "${job.title}" at ${job.company} into ${job.requirements.length} structured requirements.`,
      kind: "action",
    },
    {
      agent: "Company Researcher",
      message: job.team
        ? `Identified likely team: ${job.team}.`
        : `The posting does not name a team at ${job.company}.`,
      kind: "conclusion",
      confidence: "medium",
    },
    {
      agent: "Candidate Analyst",
      message: `${candidate.evidence.filter((e) => e.trust === "source-backed" || e.trust === "verified").length} of ${candidate.evidence.length} evidence items are source-backed; role fit: ${roleFit}.`,
      kind: "evidence",
      confidence: "high",
    },
    {
      agent: "Team Mapper",
      message: alum
        ? `Found ${people.length} relevant people; ${alum.name} is the warmest first contact.`
        : `Mapped ${people.length} potentially relevant people.`,
      kind: "conclusion",
      confidence: "medium",
    },
    {
      agent: "Source Verifier",
      message:
        people.length > 0
          ? "Manager and reporting lines are inferred from public signals, not confirmed. Marked as strong/weak inference accordingly."
          : "No people were researched for this company, so nothing about its team is asserted.",
      kind: "conflict",
      confidence: "low",
    },
    {
      agent: "Gap Analyst",
      message:
        gaps.length === 0
          ? "No gaps found against the requirements this posting lists."
          : `${gaps.length} ${gaps.length === 1 ? "gap" : "gaps"} identified${trueGap ? `, led by: ${trueGap.requirement}` : ""} — each converted to a concrete action.`,
      kind: "conclusion",
      confidence: "high",
    },
    {
      agent: "Campaign Planner",
      message: gaps[0]
        ? `Recommended first step: ${gaps[0].action.summary}.`
        : "Recommended tailoring the résumé and applying.",
      kind: "action",
    },
  ];
}
