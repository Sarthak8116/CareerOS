"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Job, JobComparison } from "@/lib/types";
import { LevelPill } from "@/components/pills";
import { Button } from "@/components/ui/primitives";
import { createCampaignFromJob } from "@/lib/store";

/**
 * Job Comparison table (§5.4). Rows are the categorical comparison dimensions,
 * columns are the cached jobs. Every conclusion is a categorical Level, this
 * view never invents compensation numbers or probabilities (build directive
 * §16); where a fact is unknown it is shown as "Unknown", not guessed.
 */

/** recommendation enum -> readable text + a tone class for the badge. */
const recommendationStyle: Record<
  JobComparison["recommendation"],
  { text: string; className: string }
> = {
  "apply-now": {
    text: "Apply now",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  "build-campaign": {
    text: "Build a campaign",
    className: "bg-brand-50 text-brand-700 ring-brand-600/20",
  },
  "research-further": {
    text: "Research further",
    className: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  "save-for-later": {
    text: "Save for later",
    className: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
  reject: {
    text: "Likely not worth it",
    className: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
};

function RecommendationBadge({
  recommendation,
}: {
  recommendation: JobComparison["recommendation"];
}) {
  const s = recommendationStyle[recommendation];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${s.className}`}
    >
      {s.text}
    </span>
  );
}

export function JobCompare({
  comparisons,
  jobs,
}: {
  comparisons: JobComparison[];
  jobs: Job[];
}) {
  const router = useRouter();
  const [buildingId, setBuildingId] = React.useState<string | null>(null);
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set());

  // Align each job column with its comparison; skip jobs without one.
  const byJobId = React.useMemo(() => {
    const m = new Map<string, JobComparison>();
    for (const c of comparisons) m.set(c.jobId, c);
    return m;
  }, [comparisons]);

  const columns = jobs
    .map((job) => ({ job, comparison: byJobId.get(job.id) }))
    .filter(
      (c): c is { job: Job; comparison: JobComparison } => !!c.comparison,
    );

  if (columns.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">
        No jobs available to compare.
      </div>
    );
  }

  // Row categories, in the engine's declared order, taken from the first column.
  const categories = columns[0].comparison.dimensions.map((d) => d.category);

  async function handleBuild(job: Job) {
    if (buildingId) return;
    setBuildingId(job.id);
    try {
      const campaign = await createCampaignFromJob(job);
      router.push("/campaigns/" + campaign.id);
    } catch {
      setBuildingId(null);
    }
  }

  function handleSave(jobId: string) {
    setSavedIds((prev) => new Set(prev).add(jobId));
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">
          Candidate fit compared across cached sample roles, by dimension.
        </caption>
        <thead>
          <tr className="border-b border-slate-200">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left align-bottom text-xs font-semibold uppercase tracking-wider text-slate-400"
            >
              Dimension
            </th>
            {columns.map(({ job }) => (
              <th
                key={job.id}
                scope="col"
                className="min-w-[200px] border-l border-slate-100 bg-slate-50 px-4 py-3 text-left align-bottom"
              >
                <div className="font-semibold text-slate-900">{job.title}</div>
                <div className="text-xs font-medium text-slate-500">
                  {job.company}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category, rowIdx) => (
            <tr
              key={category}
              className={rowIdx % 2 === 1 ? "bg-slate-50/40" : undefined}
            >
              <th
                scope="row"
                className="sticky left-0 z-10 bg-inherit px-4 py-3 text-left align-top font-medium text-slate-700"
              >
                {category}
              </th>
              {columns.map(({ job, comparison }) => {
                const dim = comparison.dimensions.find(
                  (d) => d.category === category,
                );
                return (
                  <td
                    key={job.id}
                    className="border-l border-slate-100 px-4 py-3 align-top"
                  >
                    {dim ? (
                      <div className="space-y-1.5">
                        <LevelPill level={dim.level} />
                        <p className="text-xs leading-relaxed text-slate-500">
                          {dim.note}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Unknown</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Recommendation + actions per job column. */}
          <tr className="border-t-2 border-slate-200 bg-white">
            <th
              scope="row"
              className="sticky left-0 z-10 bg-white px-4 py-4 text-left align-top font-medium text-slate-700"
            >
              Recommendation
            </th>
            {columns.map(({ job, comparison }) => {
              const saved = savedIds.has(job.id);
              const building = buildingId === job.id;
              return (
                <td
                  key={job.id}
                  className="border-l border-slate-100 px-4 py-4 align-top"
                >
                  <div className="space-y-3">
                    <RecommendationBadge
                      recommendation={comparison.recommendation}
                    />
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleBuild(job)}
                        disabled={building || !!buildingId}
                      >
                        {building ? "Building…" : "Build campaign"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSave(job.id)}
                        disabled={saved}
                        aria-pressed={saved}
                      >
                        {saved ? "Saved" : "Save for later"}
                      </Button>
                    </div>
                  </div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
