"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Building2,
  Network,
  FileText,
  Send,
  MessagesSquare,
} from "lucide-react";
import type { Campaign, CampaignStage } from "@/lib/types";
import { getCampaign, setTaskStatus } from "@/lib/store";
import { Shell } from "@/components/Shell";
import {
  Card,
  CardHeader,
  ButtonLink,
  Pill,
  SectionTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { LevelPill } from "@/components/pills";
import {
  AgentActivityFeed,
  FitDimensionRow,
  GapActionCard,
  PersonRow,
  TaskRow,
} from "@/components/features";
import { cn } from "@/lib/utils";

/** Stage → human label (categorical, never a fake percentage). */
const stageText: Record<CampaignStage, string> = {
  created: "Created",
  researching: "Researching",
  analyzed: "Analyzed",
  outreach: "Outreach",
  applied: "Applied",
  interviewing: "Interviewing",
  closed: "Closed",
};

const TABS = ["Overview", "Fit", "Network", "Gaps", "Tasks"] as const;
type Tab = (typeof TABS)[number];

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [campaign, setCampaign] = useState<Campaign | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("Overview");

  useEffect(() => {
    let active = true;
    (async () => {
      const c = await getCampaign(id);
      if (!active) return;
      setCampaign(c);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function toggleTask(taskId: string, current: Campaign["tasks"][number]["status"]) {
    if (!campaign) return;
    const next = current === "done" ? "todo" : "done";
    const updated = await setTaskStatus(campaign.id, taskId, next);
    if (updated) setCampaign(updated);
  }

  /* Loading + not-found guards (no hydration flash). */
  if (!loaded) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Sparkles className="h-4 w-4 animate-pulse" />
          Loading campaign…
        </div>
      </Shell>
    );
  }

  if (!campaign) {
    return (
      <Shell>
        <EmptyState
          title="Campaign not found"
          body="This campaign may have been reset or never existed."
        />
        <div className="mt-4">
          <ButtonLink href="/dashboard" variant="secondary" size="sm">
            Back to Mission Control
          </ButtonLink>
        </div>
      </Shell>
    );
  }

  const { job } = campaign;
  const doneCount = campaign.tasks.filter((t) => t.status === "done").length;

  return (
    <Shell>
      {/* Header */}
      <div className="mb-3">
        <ButtonLink href="/dashboard" variant="ghost" size="sm">
          ← Mission Control
        </ButtonLink>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {job.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {job.company}
            {job.team ? ` · ${job.team}` : ""} · {job.location}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill className="bg-slate-100 text-slate-700 ring-slate-500/20">
            {stageText[campaign.stage]}
          </Pill>
          <LevelPill level={campaign.readiness} label="Readiness" />
        </div>
      </div>

      {/* Next action highlight */}
      <Card className="mt-5 border-l-4 border-l-brand-500 bg-brand-50/40">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
          Strongest next action
        </p>
        <p className="mt-1 text-base font-medium text-slate-800">
          {campaign.nextAction}
        </p>
      </Card>

      {/* Deep-dive modules (sub-routes) */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { href: `/campaigns/${id}/intelligence`, label: "Company Intel", icon: Building2 },
          { href: `/campaigns/${id}/graph`, label: "Opportunity Graph", icon: Network },
          { href: `/campaigns/${id}/application`, label: "Resume Studio", icon: FileText },
          { href: `/campaigns/${id}/outreach`, label: "Outreach", icon: Send },
          { href: `/campaigns/${id}/interview`, label: "Interview Prep", icon: MessagesSquare },
        ].map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              href={m.href}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/60"
            >
              <Icon className="h-4 w-4 shrink-0 text-brand-600" />
              {m.label}
            </Link>
          );
        })}
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Campaign modules"
        className="mt-8 flex gap-1 overflow-x-auto border-b border-slate-200"
      >
        {TABS.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={cn(
                "relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                active ? "text-brand-700" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {t}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {tab === "Overview" && (
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="How this campaign was built"
                subtitle="Each agent shows its work, actions, evidence, and conclusions."
              />
              <AgentActivityFeed activity={campaign.activity} />
            </Card>
            <Card>
              <CardHeader title="Fit at a glance" />
              <div className="divide-y divide-slate-100">
                {campaign.fit.map((f) => (
                  <div
                    key={f.category}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="text-sm font-medium text-slate-700">
                      {f.label}
                    </span>
                    <LevelPill level={f.level} />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "Fit" && (
          <Card>
            <CardHeader
              title="Fit analysis"
              subtitle="Categorical judgments grounded in your evidence, never invented scores."
            />
            <div className="divide-y divide-slate-100">
              {campaign.fit.map((f) => (
                <FitDimensionRow key={f.category} dimension={f} />
              ))}
            </div>
          </Card>
        )}

        {tab === "Network" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Reporting lines and relationships shown here are{" "}
              <span className="font-medium text-slate-600">inferred, not confirmed</span>{" "}
             , verify before you reach out.
            </p>
            {campaign.people.length === 0 ? (
              <EmptyState
                title="No people mapped yet"
                body="The network agent hasn't surfaced contacts for this role."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {campaign.people.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    highlight={p.outreachPriority === "first"}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Gaps" && (
          <div className="space-y-4">
            <SectionTitle>Gap → action</SectionTitle>
            {campaign.gaps.length === 0 ? (
              <EmptyState
                title="No gaps to close"
                body="Your evidence already covers this role's requirements."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {campaign.gaps.map((g) => (
                  <GapActionCard key={g.id} gap={g} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Tasks" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle>Campaign tasks</SectionTitle>
              <span className="text-xs font-medium text-slate-500">
                {doneCount} of {campaign.tasks.length} done
              </span>
            </div>
            {campaign.tasks.length === 0 ? (
              <EmptyState title="No tasks yet" />
            ) : (
              <div className="space-y-3">
                {campaign.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={() => toggleTask(t.id, t.status)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
