"use client";

import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import type { Campaign, CampaignTask } from "@/lib/types";
import { getCampaigns, setTaskStatus } from "@/lib/store";
import { Shell } from "@/components/Shell";
import { TaskRow } from "@/components/features";
import { Card, SectionTitle, EmptyState, Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Cross-campaign tasks board (§13 /tasks). Flattens every campaign's task
 * list into one scannable, priority-sorted view grouped by campaign, with a
 * status filter. Categorical throughout, no fake progress numbers.
 */

type Filter = "all" | "open" | "done";

/** Priority weight so critical/high float to the top. */
const priorityRank: Record<CampaignTask["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function isOpen(t: CampaignTask) {
  return t.status !== "done";
}

export default function TasksPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let active = true;
    getCampaigns().then((c) => {
      if (active) {
        setCampaigns(c);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleToggle(campaignId: string, task: CampaignTask) {
    const nextStatus: CampaignTask["status"] =
      task.status === "done" ? "todo" : "done";
    const updated = await setTaskStatus(campaignId, task.id, nextStatus);
    if (!updated) return;
    setCampaigns((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
  }

  // Campaigns that have at least one task matching the current filter, each with
  // its tasks priority-sorted. Sections themselves are ordered so the campaign
  // holding the most-urgent open work floats up.
  const sections = useMemo(() => {
    return campaigns
      .map((c) => {
        const tasks = c.tasks
          .filter((t) => {
            if (filter === "open") return isOpen(t);
            if (filter === "done") return !isOpen(t);
            return true;
          })
          .slice()
          .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
        return { campaign: c, tasks };
      })
      .filter((s) => s.tasks.length > 0)
      .sort((a, b) => {
        // Rank each section by its most-urgent open task (fallback: any task).
        const rank = (tasks: CampaignTask[]) => {
          const open = tasks.filter(isOpen);
          const pool = open.length > 0 ? open : tasks;
          return Math.min(...pool.map((t) => priorityRank[t.priority]));
        };
        return rank(a.tasks) - rank(b.tasks);
      });
  }, [campaigns, filter]);

  const totalTasks = useMemo(
    () => campaigns.reduce((n, c) => n + c.tasks.length, 0),
    [campaigns],
  );
  const openTasks = useMemo(
    () =>
      campaigns.reduce((n, c) => n + c.tasks.filter(isOpen).length, 0),
    [campaigns],
  );
  const campaignsWithOpen = useMemo(
    () => campaigns.filter((c) => c.tasks.some(isOpen)).length,
    [campaigns],
  );

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "done", label: "Done" },
  ];

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-brand-600" />
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Tasks
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-500" aria-live="polite">
              {loading
                ? "Loading tasks…"
                : totalTasks === 0
                  ? "No tasks yet."
                  : `${openTasks} open across ${campaignsWithOpen} ${
                      campaignsWithOpen === 1 ? "campaign" : "campaigns"
                    } · ${totalTasks} total`}
            </p>
          </div>

          {/* Status filter */}
          <div
            role="group"
            aria-label="Filter tasks by status"
            className="inline-flex rounded-xl bg-slate-100 p-1"
          >
            {filters.map((f) => (
              <Button
                key={f.key}
                variant="ghost"
                size="sm"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-lg",
                  filter === f.key
                    ? "bg-white text-slate-900 shadow-sm hover:bg-white"
                    : "text-slate-500",
                )}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </header>

        {!loading && totalTasks === 0 && (
          <EmptyState
            title="No tasks to show"
            body="Build a campaign from a job and CareerOS will generate the tasks that move it forward."
          />
        )}

        {!loading && totalTasks > 0 && sections.length === 0 && (
          <EmptyState
            title={filter === "done" ? "Nothing completed yet" : "No open tasks"}
            body={
              filter === "done"
                ? "Completed tasks will appear here as you check them off."
                : "Every task is done. Nice work."
            }
          />
        )}

        <div className="flex flex-col gap-6">
          {sections.map(({ campaign, tasks }) => {
            const openCount = campaign.tasks.filter(isOpen).length;
            return (
              <section key={campaign.id} aria-label={`Tasks for ${campaign.job.title}`}>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <SectionTitle>
                    {campaign.job.title} · {campaign.job.company}
                  </SectionTitle>
                  <span className="text-xs text-slate-400">
                    {openCount} open · {campaign.tasks.length} total
                  </span>
                </div>
                <Card className="flex flex-col gap-3">
                  {tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onToggle={() => handleToggle(campaign.id, t)}
                    />
                  ))}
                </Card>
              </section>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
