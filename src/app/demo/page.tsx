"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  Target,
  Network,
  Send,
  GraduationCap,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Shell } from "@/components/Shell";
import {
  Card,
  ButtonLink,
  Pill,
  SectionTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { ensureSeededCampaigns, DEMO_CANDIDATE } from "@/lib/store";
import type { Campaign } from "@/lib/types";

/**
 * Guided demo intro (build directive §13 `/demo`, P0 #20 "preloaded demo works").
 * On mount we ensure the deterministic NVIDIA campaign is seeded, then hand the
 * viewer a short tour of the five things worth looking at, each deep-linking
 * into a real sub-route of the seeded campaign. No fabricated numbers: every
 * label here comes from the seeded campaign itself.
 */

type Stop = {
  icon: typeof Target;
  label: string;
  title: string;
  body: string;
  /** Sub-path appended to /campaigns/<id>. Empty string = the campaign overview. */
  path: string;
};

const STOPS: Stop[] = [
  {
    icon: Target,
    label: "Fit",
    title: "Evidence-backed fit",
    body: "See how each requirement is scored against Ava's real projects and coursework, labeled by strength and confidence.",
    path: "",
  },
  {
    icon: Network,
    label: "Opportunity Graph",
    title: "The hiring-network map",
    body: "Explore the people around the role and the warmest realistic path to a referral, with inferred links clearly marked.",
    path: "/graph",
  },
  {
    icon: Sparkles,
    label: "Gap → Action",
    title: "Every gap becomes one next step",
    body: "Turn each weakness into the single best action, a rewrite, a small project, an outreach, tracked on the overview.",
    path: "",
  },
  {
    icon: Send,
    label: "Outreach",
    title: "Approved, personalized outreach",
    body: "Review draft messages grounded in real evidence, ready to send only ever with explicit approval.",
    path: "/outreach",
  },
  {
    icon: GraduationCap,
    label: "Interview",
    title: "Interview preparation",
    body: "Work through tailored prep built from the role, the company, and Ava's own story.",
    path: "/interview",
  },
];

export default function DemoPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "empty">(
    "loading",
  );
  const [demo, setDemo] = useState<Campaign | null>(null);

  useEffect(() => {
    let active = true;
    ensureSeededCampaigns()
      .then((campaigns) => {
        if (!active) return;
        const found = campaigns.find((c) => c.isDemo) ?? null;
        setDemo(found);
        setStatus(found ? "ready" : "empty");
      })
      .catch(() => {
        if (active) setStatus("empty");
      });
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading") {
    return (
      <Shell>
        <div
          className="flex min-h-[60vh] flex-col items-center justify-center text-center"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden />
          <p className="mt-3 text-sm text-slate-500">
            Preparing the sample campaign…
          </p>
        </div>
      </Shell>
    );
  }

  if (status === "empty" || !demo) {
    return (
      <Shell>
        <div className="mx-auto max-w-lg py-16">
          <EmptyState
            title="Couldn't load the sample campaign"
            body="The preloaded demo isn't available right now. You can still start a fresh campaign from a job."
          />
          <div className="mt-6 text-center">
            <ButtonLink href="/jobs">
              Browse jobs <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>
      </Shell>
    );
  }

  const base = `/campaigns/${demo.id}`;

  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        {/* Intro */}
        <div className="text-center">
          <Pill className="bg-brand-50 text-brand-700 ring-brand-600/20">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Guided demo
          </Pill>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            A complete campaign, already running.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
            This is a preloaded sample: {DEMO_CANDIDATE.name} applying for the{" "}
            <span className="font-medium text-slate-800">
              {demo.job.title}
            </span>{" "}
            at{" "}
            <span className="font-medium text-slate-800">
              {demo.job.company}
            </span>
            . Everything below is real, deterministic output, no sign-up and no
            API keys. Follow the five stops, then open the full campaign.
          </p>
          <div className="mt-7">
            <ButtonLink href={base} size="lg">
              Open the demo campaign <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>

        {/* Tour */}
        <div className="mt-14">
          <SectionTitle>Five things to look at</SectionTitle>
          <ol className="mt-4 space-y-4">
            {STOPS.map((stop, i) => {
              const Icon = stop.icon;
              const href = `${base}${stop.path}`;
              return (
                <li key={stop.label}>
                  <Card className="flex items-start gap-4">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"
                      aria-hidden
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-400">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <h2 className="text-base font-semibold text-slate-900">
                          {stop.title}
                        </h2>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        {stop.body}
                      </p>
                    </div>
                    <ButtonLink
                      href={href}
                      variant="secondary"
                      size="sm"
                      className="mt-1 shrink-0"
                    >
                      <span>{stop.label}</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </ButtonLink>
                  </Card>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="mt-10 text-center text-sm text-slate-400">
          Want to try your own role instead?{" "}
          <a
            href="/jobs"
            className="font-medium text-brand-600 hover:underline"
          >
            Build a campaign from a job →
          </a>
        </p>
      </div>
    </Shell>
  );
}
