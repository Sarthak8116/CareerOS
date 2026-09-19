import type {
  Gap,
  Person,
  CampaignTask,
  AgentActivity,
  Job,
  Candidate,
  FitDimension,
} from "@/lib/types";

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
  _job: Job,
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
    title: "Prepare two technical topics (memory hierarchy, GPU basics)",
    category: "interview",
    priority: "medium",
    impact: "moderate",
    effort: "moderate",
    status: "todo",
    responsibleAgent: "Interview Strategist",
  });

  return tasks;
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
      message: `Identified likely team: ${job.team}. Role centers on GPU runtime/driver systems software.`,
      kind: "conclusion",
      confidence: "medium",
    },
    {
      agent: "Candidate Analyst",
      message: `Found strong source-backed evidence for Python and systems (C, cache simulator); ${roleFit} overall role fit.`,
      kind: "evidence",
      confidence: "high",
    },
    {
      agent: "Team Mapper",
      message: alum
        ? `Found ${people.length} relevant people, including ${alum.name} — a same-university alumnus likely on the team.`
        : `Mapped ${people.length} potentially relevant people.`,
      kind: "conclusion",
      confidence: "medium",
    },
    {
      agent: "Source Verifier",
      message: `Manager and reporting lines are inferred from public signals, not confirmed. Marked as strong/weak inference accordingly.`,
      kind: "conflict",
      confidence: "low",
    },
    {
      agent: "Gap Analyst",
      message: trueGap
        ? `One true skill gap (GPU/CUDA) and one resume-wording gap identified — both converted to concrete actions.`
        : `Gaps converted into actions.`,
      kind: "conclusion",
      confidence: "high",
    },
    {
      agent: "Campaign Planner",
      message: `Recommended shipping one small CUDA exercise and reframing the systems bullet before contacting the team.`,
      kind: "action",
    },
  ];
}
