"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardPaste,
  Link2,
  Loader2,
  RotateCw,
} from "lucide-react";
import type { ApplicationForm, Job } from "@/lib/types";
import type { IntakeErrorKind, IntakeResult } from "@/lib/intake/types";
import { isFetchableUrlShape, parseIntakeUrl } from "@/lib/intake/urls";
import { createCampaignFromJob } from "@/lib/store";
import { Button, Card, CardHeader, Pill } from "@/components/ui/primitives";
import { BuildingState } from "@/components/BuildingState";
import { ParsedJobReview } from "@/components/ParsedJobReview";
import { ApplicationFormReview } from "@/components/ApplicationFormReview";

/**
 * Job-link intake, the headline flow. Paste one link, review what we read,
 * and build the campaign.
 *
 * The review step is not ceremony: a parsed posting is a claim, not a fact,
 * so the user sees and corrects it before anything is saved (§11). When the
 * parse fails we say so plainly and hand the user to the paste form with
 * whatever we did manage to extract, the fallback is the honest path, not a
 * punishment.
 */

/** Reasons where "try again" is real advice rather than false hope. */
const RETRYABLE: ReadonlySet<IntakeErrorKind> = new Set([
  "rate-limited",
  "timeout",
  "upstream",
]);

type Parsed = {
  job: Job;
  form: ApplicationForm;
  descriptionFull: string;
  adapterLabel: string;
  fetchedAt: string;
  assumptions: string[];
  warnings: string[];
};

type Failure = {
  reason: IntakeErrorKind;
  message: string;
  fallback: "paste-job" | "paste-questions";
  partial?: { url: string; applyUrl?: string; title?: string; company?: string };
};

type Phase =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "parsed"; parsed: Parsed }
  | { kind: "failed"; failure: Failure }
  /* Carries the parsed job so the review stays on screen while it builds,
     the user should still be able to see what they just confirmed. */
  | { kind: "building"; parsed: Parsed };

export function JobLinkIntake({
  disabled,
  onBuildingChange,
  onFallbackToPaste,
}: {
  /** Another intake path on the page is mid-build. */
  disabled: boolean;
  /** Lets the page disable its other paths while this one builds. */
  onBuildingChange: (building: boolean) => void;
  /** Hands the paste form whatever we managed to extract, for the user to correct. */
  onFallbackToPaste: (partial: {
    url?: string;
    title?: string;
    company?: string;
  }) => void;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  // A link handed over from Home or the landing page: filled in, never
  // fetched until the user presses the button themselves.
  useEffect(() => {
    const handed = new URLSearchParams(window.location.search).get("link");
    if (handed) setUrl(handed.slice(0, 2000));
  }, []);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [shapeError, setShapeError] = useState<string | null>(null);
  const [adapters, setAdapters] = useState<{ key: string; label: string }[]>([]);

  /* Capability list only, never a gate. Any https URL is accepted, and an
     unsupported one fails honestly at POST time. */
  useEffect(() => {
    let active = true;
    fetch("/api/intake")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setAdapters(Array.isArray(d.adapters) ? d.adapters : []);
      })
      .catch(() => {
        /* The sentence is a nicety; its absence changes nothing. */
      });
    return () => {
      active = false;
    };
  }, []);

  /* A shape-only hint as the user types. "generic" is the catch-all rather
     than a recognised board, so naming it would overstate what we know. */
  const detectedKey = url.trim() ? parseIntakeUrl(url.trim())?.adapter : undefined;
  const detected =
    detectedKey && detectedKey !== "generic"
      ? (adapters.find((a) => a.key === detectedKey) ?? {
          key: detectedKey,
          label: detectedKey.charAt(0).toUpperCase() + detectedKey.slice(1),
        })
      : undefined;

  const busy = phase.kind === "fetching" || phase.kind === "building";
  const locked = disabled || busy;

  async function read(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!isFetchableUrlShape(trimmed)) {
      setShapeError("That doesn't look like a job link. Paste the full URL, starting with https://");
      return;
    }
    setShapeError(null);
    setPhase({ kind: "fetching" });
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      // The body is always an IntakeResult; the status is not load-bearing.
      const body = (await res.json()) as IntakeResult;
      if (body.ok) {
        setPhase({
          kind: "parsed",
          parsed: {
            job: body.job,
            form: body.form,
            descriptionFull: body.descriptionFull,
            adapterLabel: body.adapterLabel,
            fetchedAt: body.fetchedAt,
            assumptions: body.assumptions,
            warnings: body.warnings,
          },
        });
      } else {
        setPhase({
          kind: "failed",
          failure: {
            reason: body.reason,
            message: body.message,
            fallback: body.fallback,
            partial: body.partial,
          },
        });
      }
    } catch {
      setPhase({
        kind: "failed",
        failure: {
          reason: "upstream",
          message: "Could not reach the server. Is the dev server running?",
          fallback: "paste-job",
        },
      });
    }
  }

  async function build(parsed: Parsed) {
    setPhase({ kind: "building", parsed });
    onBuildingChange(true);
    try {
      const campaign = await createCampaignFromJob(parsed.job, parsed.form);
      router.push(`/campaigns/${campaign.id}`);
    } catch {
      onBuildingChange(false);
      setPhase({
        kind: "failed",
        failure: {
          reason: "upstream",
          message: "We read the posting, but building the campaign failed. Try again.",
          fallback: "paste-job",
        },
      });
    }
  }

  function reset() {
    setPhase({ kind: "idle" });
  }

  return (
    <div>
      <Card className="mt-3">
        <CardHeader
          title="Paste a job link"
          subtitle="One link is all it takes. We read the posting, show you what we found, and build the campaign once you've checked it."
          action={
            detected ? (
              <Pill className="bg-brand-50 text-brand-700 ring-brand-600/20">
                {detected.label} detected
              </Pill>
            ) : undefined
          }
        />

        <form onSubmit={read} noValidate>
          <label htmlFor="job-url" className="sr-only">
            Job posting URL
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="job-url"
                type="url"
                inputMode="url"
                value={url}
                disabled={locked}
                aria-invalid={!!shapeError}
                aria-describedby={shapeError ? "job-url-error" : undefined}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (shapeError) setShapeError(null);
                }}
                placeholder="https://boards.greenhouse.io/acme/jobs/1234567"
                className="block h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <Button type="submit" disabled={locked || !url.trim()} className="shrink-0">
              {phase.kind === "fetching" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading the posting…
                </>
              ) : (
                <>
                  Build My Campaign
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {shapeError && (
            <p id="job-url-error" role="alert" className="mt-2 text-sm text-rose-600">
              {shapeError}
            </p>
          )}

          {/* Coverage is stated at its real size. Four ATSs read reliably;
              everything else falls to JSON-LD, which often isn't there, so
              paste is the honest fallback, not a footnote. */}
          {adapterLabels(adapters).length > 0 && phase.kind === "idle" && (
            <p className="mt-2.5 text-xs text-slate-400">
              Works with {formatAdapterList(adapterLabels(adapters))} links. For
              other sites, paste the posting below and we&apos;ll use that.
            </p>
          )}
        </form>

        {phase.kind === "fetching" && (
          <p className="mt-4 text-sm text-slate-500">
            Fetching the posting and reading the application form. This is a single
            request, usually a couple of seconds.
          </p>
        )}
      </Card>

      {phase.kind === "failed" && (
        <FailureState
          failure={phase.failure}
          retryable={RETRYABLE.has(phase.failure.reason)}
          disabled={locked}
          onRetry={() => setPhase({ kind: "idle" })}
          onPaste={() => {
            onFallbackToPaste({
              url: phase.failure.partial?.url ?? url.trim(),
              title: phase.failure.partial?.title,
              company: phase.failure.partial?.company,
            });
            reset();
          }}
        />
      )}

      {(phase.kind === "parsed" || phase.kind === "building") && (
        <ParsedResult
          parsed={phase.parsed}
          building={phase.kind === "building"}
          disabled={locked}
          onChange={(parsed) => setPhase({ kind: "parsed", parsed })}
          onBuild={build}
          onDiscard={reset}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Review + build                                                    */
/* ---------------------------------------------------------------- */

function ParsedResult({
  parsed,
  building,
  disabled,
  onChange,
  onBuild,
  onDiscard,
}: {
  parsed: Parsed;
  building: boolean;
  disabled: boolean;
  onChange: (parsed: Parsed) => void;
  onBuild: (parsed: Parsed) => void;
  onDiscard: () => void;
}) {
  const canBuild = parsed.job.title.trim() !== "" && parsed.job.company.trim() !== "";

  return (
    <div>
      <ParsedJobReview
        job={parsed.job}
        descriptionFull={parsed.descriptionFull}
        assumptions={parsed.assumptions}
        warnings={parsed.warnings}
        adapterLabel={parsed.adapterLabel}
        fetchedAt={parsed.fetchedAt}
        disabled={disabled}
        onChange={(job) => onChange({ ...parsed, job })}
      />

      <ApplicationFormReview
        form={parsed.form}
        disabled={disabled}
        onChange={(form) => onChange({ ...parsed, form })}
      />

      {building ? (
        <BuildingState />
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={disabled || !canBuild}
            onClick={() => onBuild(parsed)}
          >
            Looks right, build my campaign
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" onClick={onDiscard} disabled={disabled}>
            Start over
          </Button>
          {!canBuild && (
            <span className="text-xs text-amber-700">
              A job title and company are needed before we can build.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Failure, say what happened, then offer the way through            */
/* ---------------------------------------------------------------- */

function FailureState({
  failure,
  retryable,
  disabled,
  onRetry,
  onPaste,
}: {
  failure: Failure;
  retryable: boolean;
  disabled: boolean;
  onRetry: () => void;
  onPaste: () => void;
}) {
  const prefilled = !!(failure.partial?.title || failure.partial?.company);

  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        {/* The server's message is already user-safe; render it as written. */}
        <p className="text-sm font-medium text-amber-900">{failure.message}</p>
        <p className="mt-1 text-sm leading-relaxed text-amber-800">
          {failure.fallback === "paste-questions"
            ? "You can still build the campaign by pasting the posting below."
            : "Pasting the description works just as well, it's the same campaign, built from text you control."}
          {prefilled && " We've filled in what we could guess from the link; check it before you build."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={onPaste} disabled={disabled}>
            <ClipboardPaste className="h-4 w-4" />
            Paste the description instead
          </Button>
          {retryable && (
            <Button type="button" variant="ghost" onClick={onRetry} disabled={disabled}>
              <RotateCw className="h-4 w-4" />
              Try the link again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The named ATSs only. "generic" is a JSON-LD attempt that frequently finds
 * nothing, so listing it as a supported source would overstate our coverage.
 */
function adapterLabels(adapters: { key: string; label: string }[]): string[] {
  return adapters.filter((a) => a.key !== "generic").map((a) => a.label);
}

/** "Greenhouse, Lever, Ashby and Workday". */
function formatAdapterList(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
