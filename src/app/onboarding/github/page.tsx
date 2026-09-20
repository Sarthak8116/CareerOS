"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Github,
  CheckCircle2,
  ShieldCheck,
  FolderGit2,
} from "lucide-react";
import { Button, ButtonLink, Card, Pill } from "@/components/ui/primitives";
import { demoCandidate } from "@/lib/demo/candidate";

/**
 * Onboarding · Connect GitHub (DEMO MODE).
 *
 * SAFETY: This performs NO real OAuth. "Connect" only flips local component
 * state to a simulated "connected" view and reveals a preview of the demo
 * candidate's public GitHub identity + a fixed list of detected demo repos.
 * No credentials, no network, no cookies.
 */

const DETECTED_REPOS = [
  {
    name: "cachesim",
    language: "C",
    summary: "CPU cache simulator, associativity + replacement policies",
  },
  {
    name: "neural-mini",
    language: "Python",
    summary: "Small neural-network training library built from scratch (NumPy)",
  },
];

export default function ConnectGithub() {
  const [connected, setConnected] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-12">
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to onboarding
      </Link>

      <div className="mt-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Github className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Connect GitHub
              </h1>
              <Pill className="bg-amber-50 text-amber-700 ring-amber-600/20">
                Demo
              </Pill>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">Step 1 of 4</p>
          </div>
        </div>

        <p className="mt-5 text-base leading-relaxed text-slate-600">
          In the real app, this reads your public repositories to build
          source-backed evidence for your skills. In this demo,{" "}
          <span className="font-medium text-slate-800">nothing connects</span>,
          clicking below just reveals the sample data we&apos;d detect.
        </p>
      </div>

      <Card className="mt-8">
        {!connected ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-800">
              Mock connection, no real OAuth
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              This button does not open GitHub, request a token, or send any
              network request. It only simulates a successful connection.
            </p>
            <Button
              className="mt-6"
              onClick={() => setConnected(true)}
              aria-label="Simulate connecting GitHub in demo mode"
            >
              <Github className="h-4 w-4" />
              Connect GitHub (demo)
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-semibold">Connected (demo)</span>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Detected account
              </p>
              <p className="mt-1 text-sm font-medium text-slate-800">
                {demoCandidate.links.github}
              </p>
            </div>

            <div className="mt-5">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Detected repositories
              </p>
              <ul className="mt-2 space-y-2">
                {DETECTED_REPOS.map((repo) => (
                  <li
                    key={repo.name}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <FolderGit2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {repo.name}
                        </span>
                        <Pill className="bg-brand-50 text-brand-700 ring-brand-600/20">
                          {repo.language}
                        </Pill>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {repo.summary}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-8 flex items-center justify-between">
        <ButtonLink href="/onboarding" variant="ghost" size="sm">
          Cancel
        </ButtonLink>
        <ButtonLink
          href="/onboarding/linkedin"
          variant={connected ? "primary" : "secondary"}
        >
          Next: LinkedIn
          <ArrowRight className="h-4 w-4" />
        </ButtonLink>
      </div>
    </main>
  );
}
