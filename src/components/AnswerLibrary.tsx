"use client";

/**
 * Reusable answer library + autofill review UI (§5.9).
 *
 * Two halves:
 *  1. The library — editable Q&A cards the candidate curates once and reuses.
 *  2. Autofill preview — takes a mock application's questions and shows which
 *     saved answer WOULD populate each one, as a read-only review screen. This
 *     is deliberately review-only: the point is to demonstrate that nothing is
 *     ever auto-submitted. The candidate always sees and edits before sending.
 */

import * as React from "react";
import { Plus, Save, Trash2, Wand2, ShieldCheck } from "lucide-react";
import type { ApplicationAnswer } from "@/lib/types";
import { getAnswers, upsertAnswer, removeAnswer } from "@/lib/answers";
import {
  Card,
  CardHeader,
  Button,
  Pill,
  SectionTitle,
  EmptyState,
} from "@/components/ui/primitives";

/* ------------------------------------------------------------------ */
/* A mock application to demonstrate the autofill review flow.         */
/* Grounded in the demo NVIDIA systems-internship campaign.            */
/* ------------------------------------------------------------------ */

const MOCK_APPLICATION = {
  company: "NVIDIA",
  role: "Systems Software Intern",
  questions: [
    "Why are you interested in working at NVIDIA?",
    "How many years of C/C++ experience do you have?",
    "Are you authorized to work in the United States?",
  ],
};

/* ------------------------------------------------------------------ */
/* Lightweight question similarity (token overlap + tag hints).        */
/* No fake precision — used only to pick a suggested match to REVIEW.  */
/* ------------------------------------------------------------------ */

const STOP = new Set([
  "the", "a", "an", "to", "of", "in", "at", "on", "for", "and", "or", "is",
  "are", "do", "you", "your", "what", "how", "why", "with", "have", "many",
  "working", "work", "interested", "please", "describe", "tell", "us", "me",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Returns the best-matching saved answer for a question, or null. */
function bestMatch(
  question: string,
  answers: ApplicationAnswer[],
): { answer: ApplicationAnswer; overlap: number } | null {
  const qt = new Set(tokens(question));
  let best: { answer: ApplicationAnswer; overlap: number } | null = null;
  for (const a of answers) {
    const at = new Set([...tokens(a.question), ...a.tags.map((t) => t.toLowerCase())]);
    let overlap = 0;
    for (const t of qt) if (at.has(t)) overlap++;
    if (overlap > 0 && (best === null || overlap > best.overlap)) {
      best = { answer: a, overlap };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Tag pills                                                           */
/* ------------------------------------------------------------------ */

function TagPill({ children }: { children: React.ReactNode }) {
  return <Pill className="bg-slate-100 text-slate-600 ring-slate-500/20">{children}</Pill>;
}

/* ------------------------------------------------------------------ */
/* Single editable answer card                                         */
/* ------------------------------------------------------------------ */

function AnswerCard({
  record,
  onSave,
  onRemove,
}: {
  record: ApplicationAnswer;
  onSave: (id: string, answer: string) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = React.useState(record.answer);
  const dirty = draft.trim() !== record.answer.trim();
  const textareaId = `answer-${record.id}`;

  React.useEffect(() => {
    setDraft(record.answer);
  }, [record.answer]);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{record.question}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(record.id)}
          aria-label={`Remove answer to "${record.question}"`}
        >
          <Trash2 className="h-4 w-4" />
          Remove
        </Button>
      </div>

      <label htmlFor={textareaId} className="sr-only">
        Answer to {record.question}
      </label>
      <textarea
        id={textareaId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        className="mt-3 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {record.tags.length === 0 ? (
            <span className="text-xs text-slate-400">No tags</span>
          ) : (
            record.tags.map((t) => <TagPill key={t}>{t}</TagPill>)
          )}
        </div>
        <Button
          size="sm"
          variant={dirty ? "primary" : "secondary"}
          disabled={!dirty}
          onClick={() => onSave(record.id, draft)}
        >
          <Save className="h-4 w-4" />
          {dirty ? "Save" : "Saved"}
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* New answer form                                                     */
/* ------------------------------------------------------------------ */

function NewAnswerForm({
  onCreate,
}: {
  onCreate: (q: string, a: string, tags: string[]) => void;
}) {
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [tags, setTags] = React.useState("");
  const canSave = question.trim().length > 0 && answer.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onCreate(question, answer, tagList);
    setQuestion("");
    setAnswer("");
    setTags("");
  }

  return (
    <Card>
      <CardHeader
        title="New answer"
        subtitle="Save an answer once, reuse it across applications."
      />
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="new-question" className="mb-1 block text-xs font-medium text-slate-600">
            Question
          </label>
          <input
            id="new-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What are your salary expectations?"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <div>
          <label htmlFor="new-answer" className="mb-1 block text-xs font-medium text-slate-600">
            Your answer
          </label>
          <textarea
            id="new-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder="Write it in your own words — you can edit it any time."
            className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <div>
          <label htmlFor="new-tags" className="mb-1 block text-xs font-medium text-slate-600">
            Tags <span className="text-slate-400">(comma-separated, optional)</span>
          </label>
          <input
            id="new-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="logistics, behavioral"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!canSave}>
            <Plus className="h-4 w-4" />
            Add answer
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Autofill preview (read-only review, never submits)                  */
/* ------------------------------------------------------------------ */

function AutofillPreview({ answers }: { answers: ApplicationAnswer[] }) {
  const rows = MOCK_APPLICATION.questions.map((q) => ({
    question: q,
    match: bestMatch(q, answers),
  }));
  const filled = rows.filter((r) => r.match !== null).length;

  return (
    <Card className="bg-slate-50/60">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-brand-600" />
            Autofill preview
          </span>
        }
        subtitle={`${MOCK_APPLICATION.company} · ${MOCK_APPLICATION.role} — ${filled} of ${rows.length} fields matched from your library`}
      />

      <div
        className="mb-4 flex items-start gap-2 rounded-xl bg-white p-3 text-xs text-slate-600 ring-1 ring-inset ring-slate-200"
        role="note"
      >
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>
          This is a review preview only. Nothing is submitted — you would confirm
          and edit every field on the real application before sending.
        </span>
      </div>

      <ol className="space-y-3">
        {rows.map((row, i) => (
          <li key={row.question} className="rounded-xl bg-white p-4 ring-1 ring-inset ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-800">
                <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                {row.question}
              </p>
              {row.match ? (
                <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Matched</Pill>
              ) : (
                <Pill className="bg-amber-50 text-amber-700 ring-amber-600/20">Needs input</Pill>
              )}
            </div>
            {row.match ? (
              <div className="mt-2 rounded-lg bg-slate-50 p-3">
                <p className="whitespace-pre-wrap text-sm text-slate-700">
                  {row.match.answer.answer}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  From your saved answer: “{row.match.answer.question}”
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                No saved answer matched — you would fill this one in manually.
              </p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export function AnswerLibrary() {
  const [answers, setAnswers] = React.useState<ApplicationAnswer[]>([]);

  // Load from localStorage after mount (SSR-safe — store guards window).
  React.useEffect(() => {
    setAnswers(getAnswers());
  }, []);

  function handleSave(id: string, answer: string) {
    const existing = answers.find((a) => a.id === id);
    if (!existing) return;
    upsertAnswer({ id, question: existing.question, answer, tags: existing.tags });
    setAnswers(getAnswers());
  }

  function handleCreate(question: string, answer: string, tags: string[]) {
    upsertAnswer({ question, answer, tags });
    setAnswers(getAnswers());
  }

  function handleRemove(id: string) {
    removeAnswer(id);
    setAnswers(getAnswers());
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      {/* Library column */}
      <div className="space-y-4">
        <SectionTitle>Saved answers ({answers.length})</SectionTitle>
        {answers.length === 0 ? (
          <EmptyState
            title="No saved answers yet"
            body="Add answers to common application questions below to speed up future applications."
          />
        ) : (
          <div className="space-y-4">
            {answers.map((a) => (
              <AnswerCard
                key={a.id}
                record={a}
                onSave={handleSave}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
        <NewAnswerForm onCreate={handleCreate} />
      </div>

      {/* Autofill review column */}
      <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
        <SectionTitle>Review before submit</SectionTitle>
        <AutofillPreview answers={answers} />
      </div>
    </div>
  );
}
