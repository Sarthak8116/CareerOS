"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  FileText,
  Github,
  Mail,
  Linkedin,
  SlidersHorizontal,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button, Pill } from "@/components/ui/primitives";

/**
 * Onboarding overview, DEMO MODE.
 * A 5-step checklist. Every step is pre-satisfied with deterministic demo
 * data (nothing to actually connect), so each shows a "Demo data loaded" pill.
 * Steps with their own sub-route link there; the rest are informational.
 */
const steps = [
  {
    icon: FileText,
    title: "Resume",
    body: "Parsed into evidence claims, each labeled by strength and source.",
    href: "/onboarding/resume",
  },
  {
    icon: Github,
    title: "GitHub",
    body: "Repositories scanned to back up your skills with public proof.",
    href: "/onboarding/github",
  },
  {
    icon: Linkedin,
    title: "LinkedIn",
    body: "Import your Connections.csv to flag people you already know.",
    href: "/onboarding/linkedin",
  },
  {
    icon: SlidersHorizontal,
    title: "Preferences",
    body: "Target roles, industries, location, and work authorization.",
    href: "/onboarding/preferences",
  },
];

export default function Onboarding() {
  const router = useRouter();

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

        <div className="mb-8">
          <Pill className="bg-brand-50 text-brand-700 ring-brand-600/20">
            <Sparkles className="h-3.5 w-3.5" />
            Demo setup
          </Pill>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Welcome to CareerOS
          </h1>
          <p className="mt-2 text-base leading-relaxed text-slate-600">
            Your sample profile is ready. Here&apos;s everything CareerOS uses to
            build evidence-backed campaigns, all pre-loaded for the demo.
          </p>
        </div>

        <ol className="space-y-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const inner = (
              <div className="card flex items-start gap-4 p-4 sm:p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-400">
                      Step {i + 1}
                    </span>
                    <h2 className="text-base font-semibold text-slate-900">
                      {step.title}
                    </h2>
                    <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                      <Check className="h-3 w-3" />
                      Demo data loaded
                    </Pill>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {step.body}
                  </p>
                </div>
                {step.href && (
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                )}
              </div>
            );

            return (
              <li key={step.title}>
                {step.href ? (
                  <Link
                    href={step.href}
                    className="block rounded-2xl transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-sm text-slate-400">
            Everything&apos;s optional in the demo, you can dive in now.
          </p>
          <Button
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => router.push("/dashboard")}
          >
            Go to Home <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
