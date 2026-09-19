"use client";

import { useEffect, useState } from "react";
import { ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import type { Campaign } from "@/lib/types";
import { getCampaigns, resetToDemo } from "@/lib/store";
import { Shell } from "@/components/Shell";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  SectionTitle,
} from "@/components/ui/primitives";
import { CampaignCard } from "@/components/features";
import { ImportancePill } from "@/components/pills";

/* A single recommended action derived honestly from a campaign. */
type RecommendedAction = {
  campaignId: string;
  campaignLabel: string;
  title: string;
  priority?: string;
  agent?: string;
};

/** Pull the strongest next action plus open tasks from every campaign. */
function deriveActions(campaigns: Campaign[]): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  for (const c of campaigns) {
    const label = `${c.job.title} · ${c.job.company}`;
    if (c.nextAction) {
      actions.push({
        campaignId: c.id,
        campaignLabel: label,
        title: c.nextAction,
      });
    }
    for (const task of c.tasks.filter((t) => t.status !== "done")) {
      actions.push({
        campaignId: c.id,
        campaignLabel: label,
        title: task.title,
        priority: task.priority,
        agent: task.responsibleAgent,
      });
    }
  }
  // Surface the highest-leverage items first, but keep it honest — no scores.
  const rank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return actions
    .sort((a, b) => (rank[a.priority ?? "low"] ?? 4) - (rank[b.priority ?? "low"] ?? 4))
    .slice(0, 6);
}

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let active = true;
    getCampaigns().then((c) => {
      if (active) setCampaigns(c);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleReset() {
    setResetting(true);
    setCampaigns(null);
    const fresh = await resetToDemo();
    setCampaigns(fresh);
    setResetting(false);
  }

  const loading = campaigns === null;
  const actions = campaigns ? deriveActions(campaigns) : [];

  return (
    <Shell>
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Mission Control
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every opportunity you&apos;re pursuing, with the single strongest next
            move for each.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReset}
            disabled={resetting}
            aria-label="Reset demo data"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {resetting ? "Resetting…" : "Reset demo"}
          </Button>
          <ButtonLink href="/jobs" size="sm">
            Build a campaign
            <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : campaigns.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No campaigns yet"
            body="Import a job to build your first evidence-backed campaign."
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Campaigns */}
          <div className="lg:col-span-2">
            <SectionTitle>Your campaigns</SectionTitle>
            <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {campaigns.map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </div>
          </div>

          {/* Recommended actions */}
          <div className="lg:col-span-1">
            <SectionTitle>Top recommended actions</SectionTitle>
            <Card className="mt-3">
              {actions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  You&apos;re all caught up — no open actions across your campaigns.
                </p>
              ) : (
                <ul className="space-y-4">
                  {actions.map((a, i) => (
                    <li key={`${a.campaignId}-${i}`} className="flex gap-3">
                      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <Sparkles className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {a.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {a.priority && <ImportancePill importance={a.priority} />}
                          <span className="truncate text-xs text-slate-400">
                            {a.campaignLabel}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </Shell>
  );
}

function LoadingState() {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-52 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70"
          />
        ))}
      </div>
      <div className="lg:col-span-1">
        <div className="h-52 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70" />
      </div>
    </div>
  );
}
