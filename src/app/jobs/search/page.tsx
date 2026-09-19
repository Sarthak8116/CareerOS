"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Building2,
  Info,
  MapPin,
  Search,
} from "lucide-react";
import type { Job } from "@/lib/types";
import { demoJobsPool } from "@/lib/demo/jobsPool";
import { createCampaignFromJob } from "@/lib/store";
import { saveJob, getSavedJobs } from "@/lib/savedJobs";
import { Shell } from "@/components/Shell";
import { Button, Card, Pill, SectionTitle } from "@/components/ui/primitives";

type RemoteFilter = "any" | Job["remote"];
type TypeFilter = "any" | Job["employmentType"];

const REMOTE_OPTIONS: { value: RemoteFilter; label: string }[] = [
  { value: "any", label: "Any location type" },
  { value: "onsite", label: "Onsite" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
  { value: "unknown", label: "Unspecified" },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "any", label: "Any type" },
  { value: "internship", label: "Internship" },
  { value: "full-time", label: "Full-time" },
  { value: "contract", label: "Contract" },
];

export default function JobSearchPage() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [remote, setRemote] = useState<RemoteFilter>("any");
  const [type, setType] = useState<TypeFilter>("any");
  const [building, setBuilding] = useState<string | null>(null);
  // Track which jobs are already saved so cards reflect it without a reload.
  const [savedIds, setSavedIds] = useState<Set<string>>(
    () => new Set(getSavedJobs().map((s) => s.jobId)),
  );

  const results = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return demoJobsPool.filter((job) => {
      if (remote !== "any" && job.remote !== remote) return false;
      if (type !== "any" && job.employmentType !== type) return false;
      if (!q) return true;
      const haystack = [
        job.title,
        job.normalizedTitle,
        job.company,
        job.team ?? "",
        job.location,
        job.seniority,
        job.description,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [keyword, remote, type]);

  function onSave(job: Job) {
    saveJob(job.id, { interest: "medium", status: "saved" });
    setSavedIds((prev) => new Set(prev).add(job.id));
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Search jobs
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Filter roles by keyword, type, and location arrangement, then save the
          promising ones or build a full campaign.
        </p>
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-sm text-brand-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        Demo search runs over a small cached pool of roles — no live listings are
        fetched. Filtering happens entirely in your browser.
      </p>

      {/* Search form */}
      <form
        className="mt-6"
        role="search"
        aria-label="Job search"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label
              htmlFor="job-keyword"
              className="block text-sm font-medium text-slate-700"
            >
              Role or keyword
            </label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="job-keyword"
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. software engineer, robotics, Python"
                className="block w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="job-type"
              className="block text-sm font-medium text-slate-700"
            >
              Employment type
            </label>
            <select
              id="job-type"
              value={type}
              onChange={(e) => setType(e.target.value as TypeFilter)}
              className="mt-1.5 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="job-remote"
              className="block text-sm font-medium text-slate-700"
            >
              Location type
            </label>
            <select
              id="job-remote"
              value={remote}
              onChange={(e) => setRemote(e.target.value as RemoteFilter)}
              className="mt-1.5 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              {REMOTE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      {/* Results */}
      <section className="mt-8">
        <SectionTitle>
          {results.length} {results.length === 1 ? "result" : "results"}
        </SectionTitle>
        {results.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">
            No cached roles match those filters. Try a broader keyword or reset
            the type and location filters.
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {results.map((job) => (
              <li key={job.id}>
                <ResultCard
                  job={job}
                  saved={savedIds.has(job.id)}
                  building={building === job.id}
                  disabled={building !== null}
                  onSave={() => onSave(job)}
                  onBuild={() => onBuild(job)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}

function ResultCard({
  job,
  saved,
  building,
  disabled,
  onSave,
  onBuild,
}: {
  job: Job;
  saved: boolean;
  building: boolean;
  disabled: boolean;
  onSave: () => void;
  onBuild: () => void;
}) {
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
          <Pill className="bg-slate-100 text-slate-600 ring-slate-500/20 capitalize">
            {job.employmentType.replace("-", " ")}
          </Pill>
          <Pill className="bg-brand-50 text-brand-700 ring-brand-600/20 capitalize">
            {job.remote}
          </Pill>
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

      <p className="mt-3 line-clamp-3 text-sm text-slate-600">{job.description}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onSave}
          disabled={saved}
          aria-pressed={saved}
        >
          {saved ? (
            <>
              <BookmarkCheck className="h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Bookmark className="h-4 w-4" />
              Save
            </>
          )}
        </Button>
        <Button type="button" size="sm" onClick={onBuild} disabled={disabled}>
          {building ? "Building…" : "Build campaign"}
          {!building && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </Card>
  );
}
