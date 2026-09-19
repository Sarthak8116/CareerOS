"use client";

import { useMemo } from "react";
import { Check, X, ArrowRight, ShieldCheck, FileText } from "lucide-react";
import type { ResumeRecommendation, ClaimFlag, Level } from "@/lib/types";
import { Card, CardHeader, Button, Pill, SectionTitle } from "@/components/ui/primitives";
import { ConfidencePill, LevelPill } from "@/components/pills";
import { cn } from "@/lib/utils";

/**
 * Resume & Application Studio (§5.8).
 *
 * Two evidence-grounded surfaces:
 *  1. Tailored recommendations — accept/reject each rewrite, before → after,
 *     traced to the requirement it addresses and the evidence behind it.
 *  2. Claim verification — the honesty pass. Flags risky claims so the
 *     candidate fixes them first; CareerOS never fabricates experience.
 *
 * Accept/reject is CONTROLLED: the status shown is the one on the
 * recommendation, and every decision is handed to `onDecide` so the owner can
 * persist it. This component holds no decision state of its own — it used to,
 * which meant "you approve or deny each one" lasted until the next render.
 * Nothing here invents metrics or upgrades a claim beyond its evidence.
 */

type RecStatus = ResumeRecommendation["status"]; // pending | accepted | rejected

/* Issue enum → human-readable label (local map, §5.8). */
const issueText: Record<ClaimFlag["issue"], string> = {
  unsupported: "Unsupported claim",
  exaggerated: "Exaggerated",
  "invented-metric": "Invented metric",
  "weak-evidence": "Weak evidence",
  inconsistent: "Inconsistent",
  "vague-buzzword": "Vague buzzword",
};

/**
 * Higher severity → warmer, more urgent tone. Severity is a Level; `strong`
 * severity is the *worst* problem (rose), so this is intentionally distinct
 * from the LevelPill's green-is-good scale.
 */
const severityTone: Record<Level, { row: string; badge: string }> = {
  strong: {
    row: "border-l-rose-400 bg-rose-50/40",
    badge: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
  moderate: {
    row: "border-l-amber-400 bg-amber-50/40",
    badge: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  limited: {
    row: "border-l-slate-300 bg-slate-50/60",
    badge: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
  none: {
    row: "border-l-slate-200 bg-white",
    badge: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
};

/* ------------------------------------------------------------------ */
/* Recommendation card                                                 */
/* ------------------------------------------------------------------ */

function RecommendationCard({
  rec,
  status,
  onDecide,
}: {
  rec: ResumeRecommendation;
  status: RecStatus;
  onDecide: (next: RecStatus) => void;
}) {
  const accepted = status === "accepted";
  const rejected = status === "rejected";

  return (
    <Card
      className={cn(
        "border-l-4 transition-colors",
        accepted && "border-l-emerald-500 bg-emerald-50/30",
        rejected && "border-l-slate-300 bg-slate-50/60",
        status === "pending" && "border-l-brand-400",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pill className="bg-slate-100 text-slate-600 ring-slate-500/20">
          {rec.section}
        </Pill>
        <div className="flex items-center gap-2">
          <ConfidencePill confidence={rec.confidence} />
          {accepted && (
            <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
              <Check className="h-3 w-3" /> Accepted
            </Pill>
          )}
          {rejected && (
            <Pill className="bg-slate-100 text-slate-500 ring-slate-500/20">
              Rejected
            </Pill>
          )}
        </div>
      </div>

      {/* Before → after */}
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Current
          </p>
          <p className="mt-1 text-sm text-slate-500 line-through decoration-slate-300">
            {rec.original}
          </p>
        </div>
        <div className="hidden items-center justify-center text-slate-300 sm:flex">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">
            Suggested
          </p>
          <p className="mt-1 text-sm font-medium text-slate-800">{rec.suggested}</p>
        </div>
      </div>

      {/* Rationale */}
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold text-slate-500">Why this helps</dt>
          <dd className="text-slate-700">{rec.reason}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold text-slate-500">
            Requirement addressed
          </dt>
          <dd className="text-slate-700">{rec.requirementAddressed}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold text-slate-500">Evidence used</dt>
          <dd className="flex items-start gap-1.5 text-slate-700">
            <Pill className="mt-0.5 shrink-0 bg-brand-50 text-brand-700 ring-brand-600/20">
              Source-backed
            </Pill>
            <span>{rec.evidenceUsed}</span>
          </dd>
        </div>
      </dl>

      {/* Decision */}
      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          variant={accepted ? "primary" : "secondary"}
          aria-pressed={accepted}
          onClick={() => onDecide(accepted ? "pending" : "accepted")}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {accepted ? "Accepted" : "Accept"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={rejected}
          onClick={() => onDecide(rejected ? "pending" : "rejected")}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          {rejected ? "Rejected" : "Reject"}
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Claim flag row                                                      */
/* ------------------------------------------------------------------ */

function ClaimFlagRow({ flag }: { flag: ClaimFlag }) {
  const tone = severityTone[flag.severity] ?? severityTone.none;
  return (
    <div className={cn("rounded-xl border border-slate-200 border-l-4 p-4", tone.row)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pill className={tone.badge}>{issueText[flag.issue]}</Pill>
        <LevelPill level={flag.severity} label="Severity" />
      </div>
      <p className="mt-2 text-sm font-medium text-slate-800">“{flag.text}”</p>
      <p className="mt-1 text-sm text-slate-600">{flag.note}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Studio                                                              */
/* ------------------------------------------------------------------ */

export function ResumeStudio({
  recommendations,
  flags,
  onDecide,
}: {
  recommendations: ResumeRecommendation[];
  flags: ClaimFlag[];
  /** Called with the user's decision. The owner persists it and re-renders. */
  onDecide: (recommendationId: string, status: RecStatus) => void;
}) {
  const acceptedCount = useMemo(
    () => recommendations.filter((r) => r.status === "accepted").length,
    [recommendations],
  );

  return (
    <div className="space-y-10">
      {/* Section 1: recommendations */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand-600" aria-hidden="true" />
            <SectionTitle className="text-slate-500">
              Tailored recommendations
            </SectionTitle>
          </div>
          <span
            aria-live="polite"
            className="text-xs font-medium text-slate-500"
          >
            {acceptedCount} of {recommendations.length} accepted
          </span>
        </div>

        {recommendations.length === 0 ? (
          <p className="text-sm text-slate-500">
            No rewrites suggested — your evidence already frames this role well.
          </p>
        ) : (
          <div className="space-y-4">
            {recommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                status={rec.status}
                onDecide={(next) => onDecide(rec.id, next)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Section 2: claim verification */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <SectionTitle className="text-slate-500">Claim verification</SectionTitle>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          CareerOS never fabricates experience — it flags claims your evidence
          doesn’t fully support so you can fix them before an employer does.
        </p>

        {flags.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <p className="text-sm font-medium text-emerald-800">
              No risky claims detected.
            </p>
            <p className="mt-1 text-sm text-emerald-700">
              Every claim traces to labelled evidence. That clean pass is the point.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {flags.map((flag) => (
              <ClaimFlagRow key={flag.id} flag={flag} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
