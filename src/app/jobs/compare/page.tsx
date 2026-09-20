"use client";

import * as React from "react";
import type { Job } from "@/lib/types";
import { Shell } from "@/components/Shell";
import { JobCompare } from "@/components/JobCompare";
import { compareJobs } from "@/lib/engine/compare";
import { getProfile } from "@/lib/profileStore";
import { getCampaigns } from "@/lib/store";
import { demoJobsPool } from "@/lib/demo/jobsPool";

/**
 * Job Comparison (§5.4). Compares the roles YOU are pursuing, side by side,
 * against the same evidence. Sample roles appear only while you have fewer
 * than two real campaigns, and are labelled as samples when they do.
 * Deterministic: categorical labels, no invented numbers.
 */
export default function JobComparePage() {
  const candidate = getProfile();
  const [own, setOwn] = React.useState<Job[] | null>(null);

  React.useEffect(() => {
    let active = true;
    void getCampaigns().then(
      (all) => active && setOwn(all.filter((c) => !c.isDemo).map((c) => c.job)),
    );
    return () => {
      active = false;
    };
  }, []);

  const usingSamples = (own?.length ?? 0) < 2;
  const jobs = usingSamples ? [...(own ?? []), ...demoJobsPool] : (own ?? []);
  const comparisons = compareJobs(candidate, jobs);

  return (
    <Shell>
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            Job comparison
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            How your roles stack up
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Each role is judged against the same evidence across hard
            requirements, location, sponsorship, learning upside and more.
            Conclusions are labels, never invented scores, and an unknown fact
            is marked unknown.
          </p>
          {own !== null && usingSamples && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              You have fewer than two campaigns of your own, so sample roles
              fill the table. Build campaigns from real job links and this page
              compares those instead.
            </p>
          )}
        </header>

        {own === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <JobCompare comparisons={comparisons} jobs={jobs} />
        )}
      </div>
    </Shell>
  );
}
