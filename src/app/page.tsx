import Link from "next/link";
import {
  Sparkles,
  Network,
  Target,
  Send,
  GraduationCap,
  ArrowRight,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/primitives";

const features = [
  {
    icon: Target,
    title: "Evidence-backed fit",
    body: "Every conclusion is grounded in your real projects, GitHub, and coursework — labeled by strength and confidence, never invented.",
  },
  {
    icon: Network,
    title: "Hiring-network map",
    body: "Find the people around a role and the warmest realistic path to a referral, with inferred relationships clearly marked.",
  },
  {
    icon: Sparkles,
    title: "Gap-to-action engine",
    body: "Turns each weakness into the single best next step — a rewrite, a small project, an outreach — instead of generic criticism.",
  },
  {
    icon: Send,
    title: "Approved outreach",
    body: "Draft personalized, evidence-backed messages and send through Gmail — only ever with your explicit approval.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-serif text-lg font-semibold tracking-tight">CareerOS</span>
        </div>
        <ButtonLink href="/demo" variant="secondary" size="sm">
          Open the demo
        </ButtonLink>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-600/20">
            <GraduationCap className="h-3.5 w-3.5" />
            Built for students and professionals
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Turn every job opportunity into a complete campaign for getting hired.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            CareerOS doesn&apos;t just help you apply. It researches each opportunity,
            understands your evidence, maps the hiring network, and runs a full
            campaign designed to help you win the role.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <ButtonLink href="/dashboard" size="lg">
              Open Mission Control <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/jobs" variant="secondary" size="lg">
              Build a campaign
            </ButtonLink>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Runs in demo mode with a real sample campaign — no sign-up, no API keys.
          </p>
        </div>

        {/* The transformation line */}
        <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-slate-200 bg-slate-50/60 p-6 text-center">
          <p className="text-sm font-medium text-slate-500">
            The complete transformation
          </p>
          <p className="mt-2 text-base font-medium text-slate-800">
            Find job → understand job → assess fit → find people → create strategy
            → send outreach → prepare interview.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-5 sm:grid-cols-2">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-slate-400">
          CareerOS — foundation + first vertical slice. Demo-mode build.
          <Link href="/dashboard" className="ml-2 font-medium text-brand-600 hover:underline">
            Enter the app →
          </Link>
        </div>
      </footer>
    </div>
  );
}
