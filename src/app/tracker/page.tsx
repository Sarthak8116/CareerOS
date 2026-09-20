"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import type { Campaign, CampaignStage } from "@/lib/types";
import { deleteCampaign, getCampaigns, setCampaignStage } from "@/lib/store";
import { Shell } from "@/components/Shell";
import { LevelPill } from "@/components/pills";
import { ButtonLink, Card, EmptyState, Pill, SectionTitle } from "@/components/ui/primitives";

/**
 * Application Tracker: every campaign, grouped by where it actually stands.
 *
 * The stage is the USER's statement of fact (CareerOS never submits an
 * application or reads an inbox), so it is set here by hand and persisted.
 * Nothing on this page is inferred.
 */

const COLUMNS: { title: string; hint: string; stages: CampaignStage[] }[] = [
  { title: "Preparing", hint: "Analysed, not yet applied", stages: ["created", "researching", "analyzed", "outreach"] },
  { title: "Applied", hint: "Application submitted", stages: ["applied"] },
  { title: "Interviewing", hint: "In conversations", stages: ["interviewing"] },
  { title: "Closed", hint: "Offer, rejection or withdrawn", stages: ["closed"] },
];

const STAGE_LABEL: Record<CampaignStage, string> = {
  created: "Created",
  researching: "Researching",
  analyzed: "Ready to work",
  outreach: "Reaching out",
  applied: "Applied",
  interviewing: "Interviewing",
  closed: "Closed",
};

export default function TrackerPage() {
  const [campaigns, setCampaigns] = React.useState<Campaign[] | null>(null);

  React.useEffect(() => {
    let active = true;
    void getCampaigns().then((all) => active && setCampaigns(all));
    return () => {
      active = false;
    };
  }, []);

  async function move(id: string, stage: CampaignStage) {
    const updated = await setCampaignStage(id, stage);
    if (updated) setCampaigns((all) => (all ?? []).map((c) => (c.id === id ? updated : c)));
  }

  function remove(id: string) {
    deleteCampaign(id);
    setCampaigns((all) => (all ?? []).filter((c) => c.id !== id));
  }

  const all = campaigns ?? [];
  const openTasks = all.reduce((n, c) => n + c.tasks.filter((t) => t.status !== "done").length, 0);

  return (
    <Shell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Application tracker</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Every role you are pursuing, by where it stands. You set the stage:
            CareerOS never submits an application or reads your inbox, so it never guesses.
          </p>
        </div>
        <ButtonLink href="/jobs" size="sm">
          New campaign
          <ArrowRight className="h-4 w-4" />
        </ButtonLink>
      </div>

      {campaigns === null ? (
        <p className="mt-8 text-sm text-slate-400">Loading…</p>
      ) : all.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nothing to track yet" body="Start a campaign from a job link and it will appear here." />
        </div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Campaigns", value: all.length },
              { label: "Applied", value: all.filter((c) => c.stage === "applied").length },
              { label: "Interviewing", value: all.filter((c) => c.stage === "interviewing").length },
              { label: "Open tasks", value: openTasks },
            ].map((stat) => (
              <Card key={stat.label} className="p-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{stat.label}</dt>
                <dd className="brand-gradient-text mt-1 text-2xl font-bold">{stat.value}</dd>
              </Card>
            ))}
          </dl>

          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            {COLUMNS.map((column) => {
              const items = all.filter((c) => column.stages.includes(c.stage));
              return (
                <section key={column.title} aria-label={column.title} className="min-w-0">
                  <div className="flex items-baseline justify-between">
                    <SectionTitle>{column.title}</SectionTitle>
                    <span className="text-xs text-slate-400">{items.length}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{column.hint}</p>
                  <div className="mt-3 space-y-3">
                    {items.length === 0 && (
                      <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                        Empty
                      </p>
                    )}
                    {items.map((c) => {
                      const open = c.tasks.filter((t) => t.status !== "done").length;
                      return (
                        <Card key={c.id} className="p-4">
                          <Link href={`/campaigns/${c.id}`} className="block hover:underline">
                            <p className="text-sm font-semibold leading-snug text-slate-900">{c.job.title}</p>
                          </Link>
                          <p className="mt-0.5 text-xs text-slate-500">{c.job.company}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <LevelPill level={c.readiness} label="Readiness" />
                            {c.isDemo && <Pill className="bg-brand-50 text-brand-700 ring-brand-600/20">Sample</Pill>}
                            {open > 0 && (
                              <Pill className="bg-slate-100 text-slate-600 ring-slate-500/20">
                                {open} open {open === 1 ? "task" : "tasks"}
                              </Pill>
                            )}
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-slate-600">
                            <span className="font-medium text-slate-700">Next:</span> {c.nextAction}
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <label className="sr-only" htmlFor={`stage-${c.id}`}>
                              Stage for {c.job.title}
                            </label>
                            <select
                              id={`stage-${c.id}`}
                              value={c.stage}
                              onChange={(e) => void move(c.id, e.target.value as CampaignStage)}
                              className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
                            >
                              {(Object.keys(STAGE_LABEL) as CampaignStage[]).map((stage) => (
                                <option key={stage} value={stage}>
                                  {STAGE_LABEL[stage]}
                                </option>
                              ))}
                            </select>
                            {!c.isDemo && (
                              <button
                                type="button"
                                onClick={() => remove(c.id)}
                                aria-label={`Delete campaign for ${c.job.title}`}
                                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <p className="mt-6 text-sm text-slate-500">
            Looking for messages?{" "}
            <Link href="/inbox" className="font-medium text-brand-600 hover:underline">
              See every outreach draft across campaigns
            </Link>
            .
          </p>
        </>
      )}
    </Shell>
  );
}
