"use client";

import { Shell } from "@/components/Shell";
import { JobCompare } from "@/components/JobCompare";
import { compareJobs } from "@/lib/engine/compare";
import { getProfile } from "@/lib/profileStore";
import { demoJobsPool } from "@/lib/demo/jobsPool";

/**
 * Job Comparison view (§5.4). Compares the active candidate against a pool of
 * cached sample roles across categorical dimensions, deterministic, no live
 * calls, no invented numbers. The comparison is computed at render time from
 * the same fit engine used everywhere else.
 */
export default function JobComparePage() {
  const candidate = getProfile();
  const comparisons = compareJobs(candidate, demoJobsPool);

  return (
    <Shell>
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            Job comparison
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            How these roles stack up for {candidate.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            {candidate.headline}. Each role below is scored against the same
            evidence graph across categorical dimensions, hard requirements,
            location, sponsorship, learning upside and more. Conclusions are
            labels, never invented scores; where a fact is unknown it is marked
            as such. Pick a role to spin up a tailored campaign.
          </p>
        </header>

        <JobCompare comparisons={comparisons} jobs={demoJobsPool} />
      </div>
    </Shell>
  );
}
