"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  MapPin,
  Users,
} from "lucide-react";
import type { Job } from "@/lib/types";
import {
  createCampaignFromJob,
  jobFromPastedText,
  DEMO_JOBS,
} from "@/lib/store";
import { Shell } from "@/components/Shell";
import { BuildingState } from "@/components/BuildingState";
import { JobLinkIntake } from "@/components/JobLinkIntake";
import {
  Button,
  Card,
  CardHeader,
  Pill,
  SectionTitle,
} from "@/components/ui/primitives";

/** What a failed link parse managed to salvage, for the paste form to prefill. */
type Prefill = { url?: string; title?: string; company?: string; nonce: number };

export default function JobsPage() {
  const router = useRouter();
  // Which job (if any) is currently building, so we can show per-card state.
  const [building, setBuilding] = useState<string | null>(null);
  // Set when a link parse falls back to paste; remounts the form with values.
  const [prefill, setPrefill] = useState<Prefill | null>(null);

  async function build(job: Job) {
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
          New campaign
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Paste one job link and CareerOS does the rest, or start from the
          sample role, or paste a description by hand. Every path builds the
          same full, evidence-backed campaign.
        </p>
      </div>

      {/* Section 0, the headline flow: one link in, a campaign out */}
      <section className="mt-6">
        <SectionTitle>Start from a job link</SectionTitle>
        <JobLinkIntake
          disabled={building !== null}
          onBuildingChange={(b) => setBuilding(b ? "link" : null)}
          onFallbackToPaste={({ url, title, company }) => {
            setPrefill({ url, title, company, nonce: Date.now() });
            // Put the fallback in front of the user rather than making them hunt.
            requestAnimationFrame(() => {
              document
                .getElementById("paste-fallback")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
        />
      </section>

      {/* Live mode entry point */}
      <a
        href="/jobs/live"
        className="card-accent mt-6 flex items-center justify-between gap-3 p-4 transition hover:-translate-y-0.5"
      >
        <div>
          <p className="text-sm font-semibold text-brand-900">
            Run a real job with your own résumé →
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            Live mode uses NVIDIA Nemotron to analyze any real posting against
            your real profile. Requires an NVIDIA API key.
          </p>
        </div>
        <Pill className="brand-gradient shrink-0 text-white ring-white/20">Live</Pill>
      </a>

      {/* Section A, sample role */}
      <section className="mt-8">
        <SectionTitle>Sample role</SectionTitle>
        {DEMO_JOBS.map((job) => (
          <SampleJobCard
            key={job.id}
            job={job}
            building={building === job.id}
            disabled={building !== null}
            onBuild={() => build(job)}
          />
        ))}
      </section>

      {/* Section B, import a job. The fallback when a link can't be parsed,
          and the only route into a login-walled portal. Always available. */}
      <section className="mt-10" id="paste-fallback">
        <SectionTitle>Or paste the description</SectionTitle>
        <ImportJobForm
          // Remount when a failed parse hands us values to prefill.
          key={prefill?.nonce ?? "blank"}
          disabled={building !== null}
          building={building === "import"}
          initialTitle={prefill?.title ?? ""}
          initialCompany={prefill?.company ?? ""}
          unverified={!!(prefill?.title || prefill?.company)}
          onSubmit={(title, company, text) => {
            setBuilding("import");
            const job = jobFromPastedText(title, company, text);
            // Keep the link the user gave us, they supplied it, so it's theirs.
            const withUrl = prefill?.url ? { ...job, url: prefill.url } : job;
            // Reuse the same build path; swap the sentinel id for the real one.
            void (async () => {
              try {
                const campaign = await createCampaignFromJob(withUrl);
                router.push(`/campaigns/${campaign.id}`);
              } catch {
                setBuilding(null);
              }
            })();
          }}
        />
      </section>
    </Shell>
  );
}

/* ---------------------------------------------------------------- */
/* Sample job card                                                   */
/* ---------------------------------------------------------------- */

function SampleJobCard({
  job,
  building,
  disabled,
  onBuild,
}: {
  job: Job;
  building: boolean;
  disabled: boolean;
  onBuild: () => void;
}) {
  const topRequirements = job.requirements
    .filter((r) => r.kind === "minimum")
    .slice(0, 4);

  return (
    <Card className="mt-3">
      <CardHeader
        title={job.title}
        subtitle={`${job.company}${job.team ? ` · ${job.team}` : ""}`}
        action={<Pill className="bg-brand-50 text-brand-700 ring-brand-600/20">Cached demo</Pill>}
      />

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-slate-400" />
          {job.location}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="h-4 w-4 text-slate-400" />
          {job.seniority}
        </span>
        {job.deadline && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            Apply by {job.deadline}
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Key requirements
        </p>
        <ul className="mt-2 space-y-1.5">
          {topRequirements.map((r) => (
            <li key={r.id} className="flex gap-2 text-sm text-slate-700">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
              {r.text}
            </li>
          ))}
        </ul>
      </div>

      {building ? (
        <BuildingState />
      ) : (
        <div className="mt-5">
          <Button onClick={onBuild} disabled={disabled}>
            Build My Campaign
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* Import job form                                                   */
/* ---------------------------------------------------------------- */

function ImportJobForm({
  disabled,
  building,
  initialTitle = "",
  initialCompany = "",
  unverified = false,
  onSubmit,
}: {
  disabled: boolean;
  building: boolean;
  /** Prefilled from a failed link parse, a guess for the user to confirm. */
  initialTitle?: string;
  initialCompany?: string;
  unverified?: boolean;
  onSubmit: (title: string, company: string, text: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [company, setCompany] = useState(initialCompany);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("A job title is required to build a campaign.");
      return;
    }
    setError(null);
    onSubmit(title.trim(), company.trim(), text);
  }

  return (
    <Card className="mt-3">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Deliberately doesn't name which fields: the generic adapter can
            only offer a title (from the page title), never a company, so
            promising both would itself be a guess. */}
        {unverified && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            We filled in what we could read from the link you pasted, check it
            before you build. Nothing here is saved until you do.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="job-title"
              className="block text-sm font-medium text-slate-700"
            >
              Job title <span className="text-rose-500">*</span>
            </label>
            <input
              id="job-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Backend Engineer, New Grad"
              aria-required="true"
              aria-invalid={!!error}
              aria-describedby={error ? "job-title-error" : undefined}
              className="mt-1.5 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <div>
            <label
              htmlFor="job-company"
              className="block text-sm font-medium text-slate-700"
            >
              Company
            </label>
            <input
              id="job-company"
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Stripe"
              className="mt-1.5 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="job-description"
            className="block text-sm font-medium text-slate-700"
          >
            Job description
          </label>
          <textarea
            id="job-description"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste the full job description here…"
            className="mt-1.5 block w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        {error && (
          <p id="job-title-error" role="alert" className="text-sm text-rose-600">
            {error}
          </p>
        )}

        {building ? (
          <BuildingState />
        ) : (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={disabled}>
              Build campaign from paste
              <ArrowRight className="h-4 w-4" />
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <Users className="h-3.5 w-3.5" />
              Six agents assemble your campaign
            </span>
          </div>
        )}
      </form>
    </Card>
  );
}
