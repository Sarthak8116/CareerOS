"use client";

import * as React from "react";
import type { InterviewQuestion } from "@/lib/types";
import { evaluateAnswer, type AnswerEvaluation } from "@/lib/engine/interview";
import {
  Card,
  Button,
  Pill,
  EmptyState,
  SectionTitle,
} from "@/components/ui/primitives";
import {
  ListenButton,
  RecordAnswerButton,
  useInterviewCapabilities,
} from "@/components/InterviewVoice";

/* ---------------------------------------------------------------- */
/* Category + difficulty display (local to this view)                */
/* ---------------------------------------------------------------- */

const categoryText: Record<InterviewQuestion["category"], string> = {
  "recruiter-screen": "Recruiter screen",
  behavioral: "Behavioral",
  technical: "Technical",
  "project-deep-dive": "Project deep-dive",
  "system-design": "System design",
  domain: "Domain",
  "company-specific": "Company-specific",
  "role-specific": "Role-specific",
  "weakness-challenge": "Weakness challenge",
};

const difficultyStyle: Record<
  InterviewQuestion["difficulty"],
  { text: string; className: string }
> = {
  easy: { text: "Easy", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  medium: { text: "Medium", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  hard: { text: "Hard", className: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

/* ---------------------------------------------------------------- */
/* Mock interview (§5.19 P0), one question at a time, text mode      */
/* ---------------------------------------------------------------- */

export function MockInterview({ questions }: { questions: InterviewQuestion[] }) {
  const [index, setIndex] = React.useState(0);
  const [answer, setAnswer] = React.useState("");
  const [evaluation, setEvaluation] = React.useState<AnswerEvaluation | null>(null);
  const [showHints, setShowHints] = React.useState(false);
  const [skipped, setSkipped] = React.useState<Set<number>>(new Set());
  const [finished, setFinished] = React.useState(false);
  const [grading, setGrading] = React.useState(false);
  const [gradedBy, setGradedBy] = React.useState<"model" | "offline">("offline");
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const caps = useInterviewCapabilities();

  if (questions.length === 0) {
    return (
      <EmptyState
        title="No interview questions yet"
        body="This campaign doesn't have a question set. Analyze the job first, then come back to practice."
      />
    );
  }

  const total = questions.length;
  const current = questions[index];
  const isLast = index === total - 1;

  async function submit() {
    if (!answer.trim() || grading) return;
    // With an NVIDIA key, nemotron-3-super grades the answer. Any failure
    // falls back to the offline heuristic, and the label says which one ran.
    if (caps.grading) {
      setGrading(true);
      try {
        const res = await fetch("/api/interview/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: current.prompt,
            answer,
            answerHints: current.answerHints,
            evidenceToUse: current.evidenceToUse,
          }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.evaluation) {
          setGradedBy("model");
          setEvaluation(data.evaluation as AnswerEvaluation);
          return;
        }
      } catch {
        // fall through to the offline grader
      } finally {
        setGrading(false);
      }
    }
    setGradedBy("offline");
    setEvaluation(evaluateAnswer(current, answer));
  }

  function goNext() {
    if (isLast) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setAnswer("");
    setVoiceError(null);
    setEvaluation(null);
    setShowHints(false);
  }

  function skip() {
    setSkipped((prev) => new Set(prev).add(index));
    goNext();
  }

  function restart() {
    setIndex(0);
    setAnswer("");
    setEvaluation(null);
    setShowHints(false);
    setSkipped(new Set());
    setFinished(false);
  }

  if (finished) {
    return (
      <SummaryView
        questions={questions}
        skipped={skipped}
        onRestart={restart}
      />
    );
  }

  const answeredCount = index + (evaluation ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <SectionTitle>
          Question {index + 1} of {total}
        </SectionTitle>
        <div
          className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answeredCount}
          aria-label={`Progress: question ${index + 1} of ${total}`}
        >
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Pill className="bg-slate-100 text-slate-700 ring-slate-500/20">
            {categoryText[current.category]}
          </Pill>
          <Pill className={difficultyStyle[current.difficulty].className}>
            {difficultyStyle[current.difficulty].text}
          </Pill>
        </div>
        <p className="text-base font-medium leading-relaxed text-slate-900">
          {current.prompt}
        </p>
        {caps.voice && (
          <div className="mt-3">
            <ListenButton text={current.prompt} onError={setVoiceError} />
          </div>
        )}

        {/* Hints affordance */}
        {current.answerHints.length > 0 && (
          <div className="mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHints((s) => !s)}
              aria-expanded={showHints}
            >
              {showHints ? "Hide hints" : "Show hints"}
            </Button>
            {showHints && (
              <ul className="mt-2 list-disc space-y-1 rounded-xl bg-slate-50 p-4 pl-8 text-sm text-slate-600">
                {current.answerHints.map((hint, i) => (
                  <li key={i}>{hint}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {/* Answer */}
      {!evaluation && (
        <Card>
          <label
            htmlFor="mock-answer"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Your answer
          </label>
          <textarea
            id="mock-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={7}
            placeholder="Talk through your answer as you would out loud, the specifics, the trade-offs, and the evidence you'd cite."
            className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => void submit()} disabled={!answer.trim() || grading}>
              {grading ? "Grading…" : "Submit answer"}
            </Button>
            {caps.voice && (
              <RecordAnswerButton
                onError={setVoiceError}
                onTranscript={(text) => setAnswer((a) => (a.trim() ? `${a.trim()} ${text}` : text))}
              />
            )}
            <Button variant="ghost" size="md" onClick={skip}>
              Skip
            </Button>
          </div>
          {caps.voice && (
            <p className="mt-2 text-xs text-slate-400">
              Your recording is transcribed and discarded, check the transcript before you submit.
            </p>
          )}
          {voiceError && (
            <p role="alert" className="mt-2 text-sm text-rose-600">
              {voiceError}
            </p>
          )}
        </Card>
      )}

      {/* Feedback */}
      {evaluation && (
        <>
          <Feedback evaluation={evaluation} />
          <p className="text-xs text-slate-400">
            {gradedBy === "model"
              ? "Graded by NVIDIA Nemotron Super from what you said and your recorded evidence."
              : "Offline feedback, a keyword check against the answer hints, not a model."}
          </p>
          <div className="flex justify-end">
            <Button onClick={goNext}>
              {isLast ? "Finish" : "Next question"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Feedback, grounded strictly in the engine output                 */
/* ---------------------------------------------------------------- */

function Feedback({ evaluation }: { evaluation: AnswerEvaluation }) {
  const { strengths, missing, strongerAnswer } = evaluation;

  return (
    <div className="space-y-3">
      <SectionTitle>Feedback</SectionTitle>

      {strengths.length > 0 && (
        <Card className="border-emerald-100 bg-emerald-50/40">
          <h4 className="mb-2 text-sm font-semibold text-emerald-800">
            What you covered
          </h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-emerald-900/90">
            {strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Card>
      )}

      {missing.length > 0 && (
        <Card className="border-amber-100 bg-amber-50/40">
          <h4 className="mb-2 text-sm font-semibold text-amber-800">
            Gaps to close
          </h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900/90">
            {missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </Card>
      )}

      {strengths.length === 0 && missing.length === 0 && (
        <EmptyState title="No specific points detected for this answer." />
      )}

      <Card className="border-brand-100 bg-brand-50/50">
        <h4 className="mb-2 text-sm font-semibold text-brand-800">
          A stronger answer
        </h4>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {strongerAnswer}
        </p>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* End-of-session summary, categories covered                       */
/* ---------------------------------------------------------------- */

function SummaryView({
  questions,
  skipped,
  onRestart,
}: {
  questions: InterviewQuestion[];
  skipped: Set<number>;
  onRestart: () => void;
}) {
  const categories = Array.from(
    new Set(questions.map((q) => categoryText[q.category])),
  );
  const answered = questions.length - skipped.size;

  return (
    <Card className="text-center">
      <div className="mx-auto max-w-md space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Practice session complete
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            You worked through {answered} of {questions.length} question
            {questions.length === 1 ? "" : "s"}
            {skipped.size > 0 ? ` (${skipped.size} skipped)` : ""}.
          </p>
        </div>

        <div>
          <SectionTitle className="mb-2">Categories covered</SectionTitle>
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((c) => (
              <Pill
                key={c}
                className="bg-slate-100 text-slate-700 ring-slate-500/20"
              >
                {c}
              </Pill>
            ))}
          </div>
        </div>

        <p className="text-sm leading-relaxed text-slate-500">
          Feedback here is qualitative, it flags what you covered and where to
          add specifics. Re-run whenever you want another pass.
        </p>

        <Button variant="secondary" onClick={onRestart}>
          Practice again
        </Button>
      </div>
    </Card>
  );
}
