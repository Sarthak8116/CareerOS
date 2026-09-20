"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, Info, ShieldAlert } from "lucide-react";
import type { Job } from "@/lib/types";
import { unstatedLabel } from "@/lib/labels";
import { Card, CardHeader, Pill } from "@/components/ui/primitives";

/**
 * Review what the parser actually read, before anything is built.
 *
 * This step is a contract requirement, not a nicety. Placeholders are only an
 * honest way to represent a silent posting BECAUSE the user sees and confirms
 * them here, an unconfirmed placeholder must never reach an engine dressed up
 * as something the posting said.
 *
 * Two cases hide inside `job.unstated`, and collapsing them would reintroduce
 * the exact dishonesty this design prevents:
 *   (a) the posting was SILENT      → "Not stated in the posting."
 *   (b) the posting SPOKE but we can't file it (employmentType only, signalled
 *       by `employmentTypeRaw`) → show the verbatim wording and ask the user to
 *       confirm the closest match.
 */

/** The fields a user can correct. Everything else is read-only provenance. */
const TEXT_FIELDS = [
  { key: "title", label: "Job title", placeholder: "e.g. Backend Engineer" },
  { key: "company", label: "Company", placeholder: "e.g. Stripe" },
  { key: "location", label: "Location", placeholder: "e.g. San Francisco, CA" },
  { key: "seniority", label: "Seniority", placeholder: "e.g. Entry level" },
] as const;

const SELECT_FIELDS = [
  {
    key: "remote",
    label: "Work arrangement",
    options: ["onsite", "hybrid", "remote", "unknown"],
    labels: { onsite: "On-site", hybrid: "Hybrid", remote: "Remote", unknown: "Unknown" },
  },
  {
    key: "employmentType",
    label: "Employment type",
    options: ["internship", "full-time", "contract"],
    labels: { internship: "Internship", "full-time": "Full-time", contract: "Contract" },
  },
  {
    key: "sponsorship",
    label: "Visa sponsorship",
    options: ["offered", "not-offered", "unclear"],
    labels: { offered: "Offered", "not-offered": "Not offered", unclear: "Unclear" },
  },
] as const;

/** Fields this card puts in front of the user as editable inputs. */
const EDITABLE_KEYS: string[] = [
  ...TEXT_FIELDS.map((f) => f.key),
  ...SELECT_FIELDS.map((f) => f.key),
];

const inputClass =
  "mt-1.5 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export function ParsedJobReview({
  job,
  descriptionFull,
  assumptions,
  warnings,
  adapterLabel,
  fetchedAt,
  disabled,
  onChange,
}: {
  job: Job;
  descriptionFull: string;
  assumptions: string[];
  warnings: string[];
  adapterLabel: string;
  fetchedAt: string;
  disabled: boolean;
  onChange: (job: Job) => void;
}) {
  const unstated = new Set(job.unstated ?? []);

  /**
   * Set a field and, because the user just stated it, drop it from `unstated`
   * on the Job we hand downstream. The corrected value is now user-provided
   * fact and must not travel as "we made this up".
   */
  function set<K extends keyof Job>(key: K, value: Job[K]) {
    const remaining = (job.unstated ?? []).filter((f) => f !== key);
    const next: Job = {
      ...job,
      [key]: value,
      unstated: remaining.length > 0 ? remaining : undefined,
    };
    // normalizedTitle feeds the preference-fit engine, so keep it in step with
    // the title the user just confirmed rather than leaving a stale parse.
    if (key === "title") next.normalizedTitle = String(value);
    onChange(next);
  }

  /* Case (b): the posting stated an employment type our enum can't represent.
     Only employmentType can be in this state, it's the one field with a Raw
     counterpart and no "unknown" enum member. */
  const rawUnrepresentable =
    unstated.has("employmentType") && !!job.employmentTypeRaw;

  /* Anything the posting didn't state that this card has no input for. Listed
     rather than silently dropped, surfacing it is the whole point. */
  const otherUnstated = [...unstated].filter((f) => !EDITABLE_KEYS.includes(f));

  return (
    <Card className="mt-3">
      <CardHeader
        title="Check what we read"
        subtitle="These values came off the posting. Correct anything that's wrong, nothing is saved until you build."
        action={
          <Pill className="bg-brand-50 text-brand-700 ring-brand-600/20">
            From link
          </Pill>
        }
      />

      {/* Provenance, where this came from, and when. */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
        <span>
          Read from {adapterLabel} · {formatFetchedAt(fetchedAt)}
        </span>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-slate-500 underline hover:text-slate-700"
          >
            View the original
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </p>

      {/* Injection flags, advisory, never blocking. */}
      {warnings.length > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs leading-relaxed text-amber-900">
            <p className="font-medium">
              This posting contains text that looks like instructions to an AI.
            </p>
            <p className="mt-0.5 text-amber-800">
              CareerOS treats everything in a posting as data, never as
              instructions. Shown here so you know it&apos;s there.
            </p>
          </div>
        </div>
      )}

      {/* Editable fields */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <div key={f.key}>
            <FieldLabel
              htmlFor={`parsed-${f.key}`}
              label={f.label}
              silent={unstated.has(f.key)}
            />
            <input
              id={`parsed-${f.key}`}
              type="text"
              value={String(job[f.key] ?? "")}
              placeholder={f.placeholder}
              disabled={disabled}
              onChange={(e) => set(f.key, e.target.value)}
              className={inputClass}
            />
          </div>
        ))}

        {SELECT_FIELDS.map((f) => {
          const isEmployment = f.key === "employmentType";
          // Case (b) gets its own framing; it is NOT "not stated".
          const silent = unstated.has(f.key) && !(isEmployment && rawUnrepresentable);
          return (
            <div key={f.key}>
              <FieldLabel
                htmlFor={`parsed-${f.key}`}
                label={f.label}
                silent={silent}
              />
              <select
                id={`parsed-${f.key}`}
                value={String(job[f.key] ?? "")}
                disabled={disabled}
                onChange={(e) => set(f.key, e.target.value as never)}
                className={inputClass}
              >
                {f.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {(f.labels as Record<string, string>)[opt] ?? opt}
                  </option>
                ))}
              </select>

              {/* The posting's own wording. Once confirmed it's just a fact
                  worth keeping on screen; while unconfirmed it's a request. */}
              {isEmployment && job.employmentTypeRaw && (
                <p
                  className={
                    rawUnrepresentable
                      ? "mt-1 text-xs text-amber-700"
                      : "mt-1 text-xs text-slate-400"
                  }
                >
                  {rawUnrepresentable ? (
                    <>
                      The posting says “{job.employmentTypeRaw}”, which
                      doesn&apos;t map to our categories, confirm the closest
                      match.
                    </>
                  ) : (
                    <>The posting said: “{job.employmentTypeRaw}”</>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Unstated fields with no input of their own, plus free-form notes. */}
      {(otherUnstated.length > 0 || assumptions.length > 0) && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Info className="h-3.5 w-3.5" />
            What the posting didn&apos;t tell us
          </p>
          {otherUnstated.length > 0 && (
            <p className="mt-2 text-sm text-slate-600">
              Not stated in the posting:{" "}
              <span className="font-medium text-slate-700">
                {otherUnstated.map(unstatedLabel).join(", ")}
              </span>
              .
            </p>
          )}
          {assumptions.length > 0 && (
            <ul className="mt-2 space-y-1">
              {assumptions.map((a) => (
                <li key={a} className="flex gap-2 text-sm text-slate-600">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Requirements the parser found, read-only, it's the posting's own text */}
      {job.requirements.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Requirements we found ({job.requirements.length})
          </p>
          <ul className="mt-2 space-y-1.5">
            {job.requirements.slice(0, 8).map((r) => (
              <li key={r.id} className="flex gap-2 text-sm text-slate-700">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                <span>
                  {r.text}
                  <span className="ml-1.5 text-xs text-slate-400">({r.kind})</span>
                </span>
              </li>
            ))}
          </ul>
          {job.requirements.length > 8 && (
            <p className="mt-2 text-xs text-slate-400">
              + {job.requirements.length - 8} more, all kept in the campaign.
            </p>
          )}
        </div>
      )}

      <DescriptionPreview text={descriptionFull || job.description} />
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* Field label, with the "the posting didn't say" mark               */
/* ---------------------------------------------------------------- */

function FieldLabel({
  htmlFor,
  label,
  silent,
}: {
  htmlFor: string;
  label: string;
  silent: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {silent && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          Not stated in the posting
        </span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Description preview                                               */
/* ---------------------------------------------------------------- */

function DescriptionPreview({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-xs font-medium uppercase tracking-wide text-slate-400 underline hover:text-slate-600"
      >
        {open ? "Hide" : "Show"} the description we read (
        {text.length.toLocaleString()} characters)
      </button>
      {open && (
        // Plain text by design, the parser strips markup, so it renders as
        // text with preserved newlines and never as HTML.
        <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-600">
          {text}
        </pre>
      )}
    </div>
  );
}

/** Absolute, readable, and honest about being a fetch time. */
function formatFetchedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "just now";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
