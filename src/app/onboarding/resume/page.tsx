"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  UploadCloud,
  FileText,
  Check,
  ArrowRight,
} from "lucide-react";
import { Button, Pill } from "@/components/ui/primitives";
import { demoCandidate } from "@/lib/demo/candidate";
import type { Evidence } from "@/lib/types";

/**
 * Onboarding · Resume — DEMO MODE.
 * No real file is read or uploaded. "Use sample resume" flips local state to
 * reveal the pre-parsed evidence from demoCandidate, grouped by category, to
 * demonstrate what parsing produces. Fully deterministic, no network.
 */

const categoryLabels: Record<Evidence["category"], string> = {
  skill: "Skills",
  project: "Projects",
  experience: "Experience",
  education: "Education",
  achievement: "Achievements",
  leadership: "Leadership",
};

const strengthStyles: Record<Evidence["strength"], string> = {
  strong: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  moderate: "bg-amber-50 text-amber-700 ring-amber-600/20",
  limited: "bg-slate-100 text-slate-600 ring-slate-300",
  none: "bg-slate-100 text-slate-600 ring-slate-300",
};

export default function ResumeOnboarding() {
  const [parsed, setParsed] = useState(false);

  // Group demo evidence by category for a tidy parsed view.
  const grouped = demoCandidate.evidence.reduce<
    Record<string, Evidence[]>
  >((acc, ev) => {
    (acc[ev.category] ??= []).push(ev);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto w-full max-w-2xl">
        {/* Logo */}
        <Link href="/" className="mb-8 flex w-fit items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">CareerOS</span>
        </Link>

        <div className="mb-6">
          <span className="text-xs font-medium text-slate-400">Step 1 of 5</span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Add your resume
          </h1>
          <p className="mt-2 text-base leading-relaxed text-slate-600">
            CareerOS parses your resume into labeled evidence — every claim
            tagged by strength and source, never invented.
          </p>
        </div>

        {!parsed ? (
          <div className="card p-6 sm:p-8">
            {/* Dropzone-styled area (decorative — no real upload) */}
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <UploadCloud className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                Drag & drop your resume here
              </p>
              <p className="mt-1 text-sm text-slate-400">
                PDF or DOCX — or use our sample to see how parsing works.
              </p>
              <div className="mt-5">
                <Button onClick={() => setParsed(true)}>
                  <FileText className="h-4 w-4" />
                  Use sample resume
                </Button>
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
                <Pill className="bg-slate-50 text-slate-500 ring-slate-200">
                  Demo
                </Pill>
                No file leaves your browser — parsing is simulated.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="card flex items-center gap-3 border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Parsed {demoCandidate.name}&apos;s resume
                </p>
                <p className="text-sm text-slate-500">
                  {demoCandidate.evidence.length} evidence claims extracted and
                  labeled.
                </p>
              </div>
            </div>

            {Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="card p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {categoryLabels[category as Evidence["category"]] ?? category}
                </h2>
                <ul className="mt-3 space-y-3">
                  {items.map((ev) => (
                    <li key={ev.id} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800">{ev.claim}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Pill className={strengthStyles[ev.strength]}>
                            {ev.strength}
                          </Pill>
                          <Pill className="bg-slate-100 text-slate-600 ring-slate-300">
                            {ev.trust}
                          </Pill>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Link
            href="/onboarding"
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            ← Back to setup
          </Link>
          <Link
            href="/onboarding/github"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Next: GitHub <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
