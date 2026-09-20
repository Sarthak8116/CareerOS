import Link from "next/link";
import {
  Github,
  ArrowRight,
  CheckCircle2,
  Circle,
  Users,
  ArrowUpRight,
} from "lucide-react";
import type {
  Evidence,
  FitDimension,
  Gap,
  Campaign,
  Person,
  AgentActivity,
  Level,
} from "@/lib/types";
import { Card, Pill } from "@/components/ui/primitives";
import {
  LevelPill,
  ConfidencePill,
  TrustPill,
  RecencyPill,
  ImportancePill,
} from "@/components/pills";
import { gapClassificationText, effortText, levelStyle } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { proposeProject } from "@/lib/engine/projectBooster";

/* ---------------------------------------------------------------- */
/* Evidence card (§5.1 evidence graph)                               */
/* ---------------------------------------------------------------- */

export function EvidenceCard({ evidence }: { evidence: Evidence }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-800">{evidence.claim}</p>
        <span className="shrink-0 text-xs uppercase tracking-wide text-slate-400">
          {evidence.category}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <LevelPill level={evidence.strength} label="Strength" />
        <RecencyPill recency={evidence.recency} />
        <TrustPill trust={evidence.trust} />
        {evidence.publicProof && (
          <Pill className="bg-slate-100 text-slate-600 ring-slate-500/20">
            <Github className="h-3 w-3" /> Public proof
          </Pill>
        )}
      </div>
      {evidence.sourceReference && (
        <p className="mt-2 truncate text-xs text-slate-400">
          {evidence.sourceReference}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Fit dimension row (§5.3, §5.7) — categorical, no fake %           */
/* ---------------------------------------------------------------- */

const fitFillWidth: Record<string, string> = {
  strong: "w-full",
  moderate: "w-2/3",
  limited: "w-1/3",
  none: "w-2",
};
const fitFillColor: Record<string, string> = {
  strong: "bg-emerald-500",
  moderate: "bg-brand-500",
  limited: "bg-amber-500",
  none: "bg-slate-300",
};

export function FitDimensionRow({ dimension }: { dimension: FitDimension }) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-800">{dimension.label}</span>
        <div className="flex items-center gap-1.5">
          <LevelPill level={dimension.level} />
          <ConfidencePill confidence={dimension.confidence} />
        </div>
      </div>
      {/* Qualitative bar — a visual aid, not a precise number. */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", fitFillWidth[dimension.level], fitFillColor[dimension.level])} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{dimension.explanation}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Gap -> action card (Signature Feature 4)                          */
/* ---------------------------------------------------------------- */

export function GapActionCard({ gap }: { gap: Gap }) {
  const project = proposeProject(gap);

  return (
    <Card className="border-l-4 border-l-brand-500">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill className="bg-slate-100 text-slate-700 ring-slate-500/20">
          {gapClassificationText[gap.classification]}
        </Pill>
        <ImportancePill importance={gap.importance} />
      </div>
      <p className="mt-3 text-sm text-slate-500">Requirement</p>
      <p className="text-sm font-medium text-slate-800">{gap.requirement}</p>

      <div className="mt-4 rounded-xl bg-brand-50/60 p-4">
        <div className="flex items-start gap-2">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <div>
            <p className="text-sm font-semibold text-brand-900">{gap.action.summary}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{gap.action.detail}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <LevelPill level={gap.action.expectedImpact} label="Impact" />
              <Pill className="bg-white text-slate-600 ring-slate-500/20">
                {effortText[gap.action.effort]}
              </Pill>
            </div>
          </div>
        </div>
      </div>

      {gap.evidenceNote && (
        <p className="mt-3 text-xs italic text-slate-400">{gap.evidenceNote}</p>
      )}

      {project && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Suggested project
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{project.title}</p>
          <p className="mt-1 text-sm text-slate-600">{project.goal}</p>
          <p className="mt-3 text-xs font-semibold text-slate-500">Deliverable</p>
          <p className="mt-1 text-sm text-slate-700">{project.deliverable}</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {project.milestones.map((milestone) => (
              <li key={milestone}>{milestone}</li>
            ))}
          </ol>
          <p className="mt-3 text-xs italic text-slate-500">{project.honestyNote}</p>
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* Person / hiring-network row (§5.10)                               */
/* ---------------------------------------------------------------- */

export function PersonRow({ person, highlight }: { person: Person; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        highlight ? "border-brand-300 bg-brand-50/50 ring-1 ring-brand-200" : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{person.name}</p>
          <p className="text-sm text-slate-500">{person.title}</p>
        </div>
        {person.outreachPriority === "first" && (
          <Pill className="bg-brand-600 text-white ring-brand-700/20">Contact first</Pill>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-600">{person.inferredRole}</p>
      <p className="mt-1 text-xs text-slate-500">{person.connection}</p>

      {/* Overlap-derived warmth. Present only for live, sourced contacts. */}
      {person.warmth && person.warmth.signals.length > 0 && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
          <p className="text-xs font-medium text-slate-600">
            Common ground (inferred)
          </p>
          <ul className="mt-1 space-y-0.5">
            {person.warmth.signals.map((s) => (
              <li key={`${s.kind}-${s.detail}`} className="text-xs text-slate-500">
                {s.detail}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
            {person.warmth.note}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <LevelPill level={person.relevance} label="Relevance" />
        <LevelPill level={person.influence} label="Influence" />
        <LevelPill level={person.accessibility} label="Access" />
        {person.warmth && <LevelPill level={person.warmth.level} label="Warmth" />}
        <TrustPill trust={person.trust} />
      </div>

      {/* Provenance — who told us this, and when. */}
      {person.provenance && (
        <p className="mt-2 text-[11px] text-slate-400">
          Source: LinkedIn via HarvestAPI ·{" "}
          {person.provenance.linkedinUrl ? (
            <a
              href={person.provenance.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-slate-600"
            >
              profile
            </a>
          ) : (
            "profile"
          )}{" "}
          · fetched {person.provenance.fetchedAt.slice(0, 10)}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Agent activity feed (§7)                                          */
/* ---------------------------------------------------------------- */

const activityDot: Record<AgentActivity["kind"], string> = {
  action: "bg-brand-500",
  evidence: "bg-emerald-500",
  conclusion: "bg-violet-500",
  conflict: "bg-amber-500",
};

export function AgentActivityFeed({ activity }: { activity: AgentActivity[] }) {
  return (
    <ol className="space-y-4">
      {activity.map((a, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", activityDot[a.kind])} />
            {i < activity.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
          </div>
          <div className="pb-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{a.agent}</span>
              {a.confidence && <ConfidencePill confidence={a.confidence} />}
            </div>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{a.message}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- */
/* Campaign card (Mission Control §5.21)                             */
/* ---------------------------------------------------------------- */

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const roleFit = campaign.fit.find((f) => f.category === "role");
  const network = campaign.fit.find((f) => f.category === "network");
  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-card transition-shadow hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-900">{campaign.job.title}</p>
          <p className="text-sm text-slate-500">
            {campaign.job.company} · {campaign.job.team ?? campaign.job.location}
          </p>
        </div>
        <ArrowUpRight className="h-5 w-5 text-slate-300 transition-colors group-hover:text-brand-600" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniStat label="Role fit" level={roleFit?.level ?? "none"} />
        <MiniStat label="Network" level={network?.level ?? "none"} />
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Strongest next action
        </p>
        <p className="mt-0.5 text-sm font-medium text-slate-700">{campaign.nextAction}</p>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <Users className="h-3.5 w-3.5" />
        {campaign.people.length} contacts · {campaign.tasks.filter((t) => t.status !== "done").length} open tasks
        {campaign.isDemo && (
          <Pill className="ml-auto bg-slate-100 text-slate-500 ring-slate-500/20">Demo</Pill>
        )}
      </div>
    </Link>
  );
}

const levelText: Record<Level, string> = {
  strong: "text-emerald-700",
  moderate: "text-brand-700",
  limited: "text-amber-700",
  none: "text-slate-600",
};

function MiniStat({ label, level }: { label: string; level: Level }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold", levelText[level])}>
        {levelStyle[level].text}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Task row (§5.18) — client toggle lives in the page               */
/* ---------------------------------------------------------------- */

export function TaskRow({
  task,
  onToggle,
}: {
  task: Campaign["tasks"][number];
  onToggle?: () => void;
}) {
  const done = task.status === "done";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <button
        onClick={onToggle}
        aria-label={done ? "Mark task incomplete" : "Mark task complete"}
        className="mt-0.5 shrink-0 text-slate-300 transition-colors hover:text-brand-600"
      >
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>
      <div className="flex-1">
        <p className={cn("text-sm font-medium", done ? "text-slate-400 line-through" : "text-slate-800")}>
          {task.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ImportancePill importance={task.priority} />
          <LevelPill level={task.impact} label="Impact" />
          <Pill className="bg-slate-100 text-slate-500 ring-slate-500/20">{task.category}</Pill>
          <span className="text-xs text-slate-400">· {task.responsibleAgent}</span>
        </div>
      </div>
    </div>
  );
}
