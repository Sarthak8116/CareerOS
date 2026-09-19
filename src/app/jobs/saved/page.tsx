"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  MapPin,
  Search,
  Trash2,
} from "lucide-react";
import type { Job, SavedJob } from "@/lib/types";
import { demoJobsPool } from "@/lib/demo/jobsPool";
import { createCampaignFromJob } from "@/lib/store";
import {
  getSavedJobs,
  removeSavedJob,
  updateSavedJob,
} from "@/lib/savedJobs";
import { Shell } from "@/components/Shell";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Pill,
  SectionTitle,
} from "@/components/ui/primitives";

/* Categorical styling for the saved-job labels (mirrors lib/labels.ts). */
const STATUS_STYLE: Record<SavedJob["status"], { text: string; className: string }> = {
  saved: { text: "Saved", className: "bg-brand-50 text-brand-700 ring-brand-600/20" },
  applied: { text: "Applied", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  interviewing: { text: "Interviewing", className: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  rejected: { text: "Rejected", className: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  archived: { text: "Archived", className: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

const INTEREST_STYLE: Record<SavedJob["interest"], { text: string; className: string }> = {
  high: { text: "High interest", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  medium: { text: "Medium interest", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  low: { text: "Low interest", className: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

const STATUS_OPTIONS: SavedJob["status"][] = [
  "saved",
  "applied",
  "interviewing",
  "rejected",
  "archived",
];

/** Index the cached pool by Job.id for the join with saved records. */
const jobsById = new Map<string, Job>(demoJobsPool.map((j) => [j.id, j]));

export default function SavedJobsPage() {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedJob[]>([]);
  const [building, setBuilding] = useState<string | null>(null);

  // localStorage is client-only; load after mount to avoid SSR mismatch.
  useEffect(() => {
    setSaved(getSavedJobs());
  }, []);

  // Join saved records with their jobs; drop any whose job left the pool.
  const rows = useMemo(
    () =>
      saved
        .map((s) => ({ saved: s, job: jobsById.get(s.jobId) }))
        .filter((r): r is { saved: SavedJob; job: Job } => !!r.job),
    [saved],
  );

  function onStatusChange(id: string, status: SavedJob["status"]) {
    updateSavedJob(id, { status });
    setSaved(getSavedJobs());
  }

  function onRemove(id: string) {
    removeSavedJob(id);
    setSaved(getSavedJobs());
  }

  async function onBuild(job: Job) {
    if (building) return;
    setBuilding(job.id);
    try {
      const campaign = await createCampaignFromJob(job);
      router.push(`/campaigns/${campaign.id}`);
    } catch {
      setBuilding(null);
    }
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Saved jobs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Roles you have shortlisted. Track their status and build a campaign
            when you are ready.
          </p>
        </div>
        <ButtonLink href="/jobs/search" variant="secondary" size="sm">
          <Search className="h-4 w-4" />
          Search jobs
        </ButtonLink>
      </div>

      <section className="mt-8">
        {rows.length === 0 ? (
          <EmptyState
            title="No saved jobs yet"
            body="Save roles from the search page to shortlist them and track your progress here."
          />
        ) : (
          <>
            <SectionTitle>
              {rows.length} saved {rows.length === 1 ? "role" : "roles"}
            </SectionTitle>
            <ul className="mt-3 space-y-4">
              {rows.map(({ saved: record, job }) => (
                <li key={record.id}>
                  <SavedJobCard
                    record={record}
                    job={job}
                    building={building === job.id}
                    disabled={building !== null}
                    onStatusChange={(status) =>
                      onStatusChange(record.id, status)
                    }
                    onRemove={() => onRemove(record.id)}
                    onBuild={() => onBuild(job)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </Shell>
  );
}

function SavedJobCard({
  record,
  job,
  building,
  disabled,
  onStatusChange,
  onRemove,
  onBuild,
}: {
  record: SavedJob;
  job: Job;
  building: boolean;
  disabled: boolean;
  onStatusChange: (status: SavedJob["status"]) => void;
  onRemove: () => void;
  onBuild: () => void;
}) {
  const statusStyle = STATUS_STYLE[record.status];
  const interestStyle = INTEREST_STYLE[record.interest];
  const selectId = `status-${record.id}`;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{job.title}</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {job.company}
            {job.team ? ` · ${job.team}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill className={statusStyle.className}>{statusStyle.text}</Pill>
          <Pill className={interestStyle.className}>{interestStyle.text}</Pill>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-slate-400" />
          {job.location}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="h-4 w-4 text-slate-400" />
          {job.seniority}
        </span>
      </div>

      {record.notes && (
        <p className="mt-3 text-sm text-slate-600">{record.notes}</p>
      )}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor={selectId}
            className="block text-xs font-medium text-slate-500"
          >
            Status
          </label>
          <select
            id={selectId}
            value={record.status}
            onChange={(e) =>
              onStatusChange(e.target.value as SavedJob["status"])
            }
            className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_STYLE[s].text}
              </option>
            ))}
          </select>
        </div>

        <Button type="button" size="sm" onClick={onBuild} disabled={disabled}>
          {building ? "Building…" : "Build campaign"}
          {!building && <ArrowRight className="h-4 w-4" />}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={`Remove ${job.title} from saved jobs`}
        >
          <Trash2 className="h-4 w-4" />
          Remove
        </Button>
      </div>
    </Card>
  );
}
