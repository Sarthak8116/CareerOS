"use client";

import { useState } from "react";
import { ClipboardPaste, ExternalLink, HelpCircle, ShieldCheck, X } from "lucide-react";
import type { ApplicationForm, ApplicationQuestion } from "@/lib/types";
import { formFromPastedQuestions } from "@/lib/intake/paste";
import { Button, Card, CardHeader, Pill } from "@/components/ui/primitives";

/**
 * What this application actually asks for — and, where we couldn't read it, an
 * honest admission plus a way for the user to supply it by hand.
 *
 * Two distinctions carry the honesty here:
 *   - "not requested" is a FACT we established from a complete form.
 *     "unknown" is an ADMISSION about us. They must never look alike.
 *   - `completeness` describes the QUESTION SET, not per-field requiredness.
 *     A complete form can still leave a résumé's mandatory status unstated,
 *     which means "it asks for one, but doesn't say if it's required" — not
 *     "optional", and not an error.
 */

const KIND_OPTIONS = [
  "short-text",
  "long-text",
  "single-select",
  "multi-select",
  "boolean",
  "file",
  "date",
  "url",
  "unknown",
] as const;

const inputClass =
  "block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export function ApplicationFormReview({
  form,
  disabled,
  onChange,
}: {
  form: ApplicationForm;
  disabled: boolean;
  onChange: (form: ApplicationForm) => void;
}) {
  const readable = form.completeness !== "none";
  /* Offer the manual paste only when we fetched and came up short. Re-pasting
     over a form the user already pasted would just be a loop. */
  const offerPaste = form.source !== "pasted" && form.completeness !== "complete";

  function updateQuestion(id: string, patch: Partial<ApplicationQuestion>) {
    onChange({
      ...form,
      questions: form.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    });
  }

  function removeQuestion(id: string) {
    onChange({ ...form, questions: form.questions.filter((q) => q.id !== id) });
  }

  return (
    <Card className="mt-4">
      <CardHeader
        title={
          readable
            ? "What this application asks for"
            : "We couldn't read the application form"
        }
        subtitle={
          readable
            ? "Read off the apply page. Correct anything we got wrong."
            : "The job itself parsed fine — only the application questions are out of reach."
        }
        action={
          form.source === "pasted" ? (
            <Pill className="bg-slate-100 text-slate-600 ring-slate-500/20">
              You pasted this
            </Pill>
          ) : (
            <Pill className="bg-brand-50 text-brand-700 ring-brand-600/20">
              {form.completeness === "complete" ? "Complete" : "Partial"}
            </Pill>
          )
        }
      />

      {readable && (
        <dl className="space-y-1.5">
          <RequirementRow
            label="Résumé"
            status={form.resume}
            complete={form.completeness === "complete"}
          />
          <RequirementRow
            label="Cover letter"
            status={form.coverLetter}
            complete={form.completeness === "complete"}
          />
          <RequirementRow
            label="Portfolio"
            status={form.portfolio}
            complete={form.completeness === "complete"}
          />
        </dl>
      )}

      {/* A deliberate omission, not a failure — so it isn't styled as one. */}
      {form.excludedSections.length > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-sm leading-relaxed text-slate-600">
            This application includes{" "}
            <span className="font-medium text-slate-700">
              {formatList(form.excludedSections)}
            </span>
            . CareerOS doesn&apos;t read or pre-fill those questions — you&apos;ll
            complete them on the employer&apos;s site.
          </p>
        </div>
      )}

      {/* Whatever we could not establish, in the parser's own words. */}
      {form.unknowns.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <HelpCircle className="h-3.5 w-3.5" />
            What we don&apos;t know
          </p>
          <ul className="mt-2 space-y-1">
            {form.unknowns.map((u) => (
              <li key={u} className="flex gap-2 text-sm leading-relaxed text-amber-900">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                {u}
              </li>
            ))}
          </ul>
        </div>
      )}

      {form.questions.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Questions ({form.questions.length})
          </p>
          {form.questions.map((q) => (
            <QuestionRow
              key={q.id}
              question={q}
              disabled={disabled}
              onChange={(patch) => updateQuestion(q.id, patch)}
              onRemove={() => removeQuestion(q.id)}
            />
          ))}
        </div>
      )}

      {offerPaste && (
        <PasteQuestions
          jobId={form.jobId}
          applyUrl={form.applyUrl}
          adapter={form.adapter}
          disabled={disabled}
          onParsed={onChange}
        />
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* One requirement — fact vs. admission vs. "asked but unstated"      */
/* ---------------------------------------------------------------- */

function RequirementRow({
  label,
  status,
  complete,
}: {
  label: string;
  status: string;
  complete: boolean;
}) {
  const { text, className } = describeRequirement(status, complete);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <dt className="font-medium text-slate-700">{label}</dt>
      <dd className={className}>{text}</dd>
    </div>
  );
}

function describeRequirement(status: string, complete: boolean) {
  switch (status) {
    case "required":
      return { text: "Required", className: "text-emerald-700" };
    case "optional":
      return { text: "Optional", className: "text-brand-700" };
    case "not-requested":
      return { text: "Not requested", className: "text-slate-500" };
    default:
      /* A complete question set that still doesn't say whether this is
         mandatory is a different claim from "we couldn't read the form". */
      return complete
        ? {
            text: "Asked for — the form doesn't say whether it's mandatory",
            className: "text-amber-700",
          }
        : {
            text: "Unknown — we couldn't read the form",
            className: "text-amber-700",
          };
  }
}

/* ---------------------------------------------------------------- */
/* One question — editable, because the user outranks the parser      */
/* ---------------------------------------------------------------- */

function QuestionRow({
  question,
  disabled,
  onChange,
  onRemove,
}: {
  question: ApplicationQuestion;
  disabled: boolean;
  onChange: (patch: Partial<ApplicationQuestion>) => void;
  onRemove: () => void;
}) {
  const requiredValue =
    question.required === undefined ? "" : question.required ? "yes" : "no";

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start gap-2">
        <label htmlFor={`q-${question.id}`} className="sr-only">
          Question wording
        </label>
        <input
          id={`q-${question.id}`}
          type="text"
          value={question.prompt}
          disabled={disabled}
          onChange={(e) => onChange({ prompt: e.target.value })}
          className={inputClass}
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove question: ${question.prompt}`}
          className="mt-2 shrink-0 text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`q-kind-${question.id}`}>
          Answer type
        </label>
        <select
          id={`q-kind-${question.id}`}
          value={question.kind}
          disabled={disabled}
          onChange={(e) =>
            onChange({ kind: e.target.value as ApplicationQuestion["kind"] })
          }
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor={`q-req-${question.id}`}>
          Is it required?
        </label>
        <select
          id={`q-req-${question.id}`}
          value={requiredValue}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              required: e.target.value === "" ? undefined : e.target.value === "yes",
            })
          }
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="">Not stated</option>
          <option value="yes">Required</option>
          <option value="no">Optional</option>
        </select>

        {question.maxLength !== undefined && (
          <span className="text-xs text-slate-400">
            max {question.maxLength} chars
          </span>
        )}
      </div>

      {question.helpText && (
        <p className="mt-1.5 text-xs text-slate-400">{question.helpText}</p>
      )}
      {question.options && question.options.length > 0 && (
        <p className="mt-1.5 text-xs text-slate-400">
          Choices: {question.options.join(" · ")}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Manual paste — the way past a login wall                          */
/* ---------------------------------------------------------------- */

function PasteQuestions({
  jobId,
  applyUrl,
  adapter,
  disabled,
  onParsed,
}: {
  jobId: string;
  applyUrl?: string;
  /** The board this apply page belongs to — recorded, never guessed. */
  adapter?: string;
  disabled: boolean;
  onParsed: (form: ApplicationForm) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  if (!open) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          <ClipboardPaste className="h-4 w-4" />
          Paste the application questions
        </Button>
        {applyUrl && (
          <a
            href={applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 underline hover:text-slate-700"
          >
            Open the apply page
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5">
      <label
        htmlFor="pasted-questions"
        className="block text-sm font-medium text-slate-700"
      >
        Paste the application questions
      </label>
      <p className="mt-0.5 text-xs text-slate-400">
        Copy the questions off the apply page and paste them here — one per line.
        We&apos;ll read them back to you before anything is saved.
      </p>
      <textarea
        id="pasted-questions"
        value={text}
        rows={7}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        placeholder="Why do you want to work here?&#10;Are you legally authorized to work in the US?&#10;Earliest start date"
        className={`mt-2 resize-y ${inputClass}`}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          disabled={disabled || text.trim().length < 3}
          onClick={() => {
            onParsed(
              formFromPastedQuestions({
                jobId,
                text,
                applyUrl,
                adapter,
                // The user pasted this just now; that's the honest timestamp.
                fetchedAt: new Date().toISOString(),
              }),
            );
            setOpen(false);
          }}
        >
          Read these back to me
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={disabled}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** "a voluntary EEO section" / "X and Y". */
function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
