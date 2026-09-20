"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Mail,
  CheckCircle2,
  ShieldCheck,
  PenLine,
} from "lucide-react";
import { Button, ButtonLink, Card, Pill } from "@/components/ui/primitives";

/**
 * Onboarding · Connect Gmail (DEMO MODE).
 *
 * SAFETY: No real OAuth. "Connect" only flips local state to a simulated
 * "connected" view. The honest explanation below describes how the REAL app
 * would use Gmail, draft/send only with explicit per-message approval,
 * but in this demo nothing is authorized, sent, or transmitted.
 */

const GUARANTEES = [
  "Outreach is only ever drafted, never sent without your explicit approval.",
  "Every message shows its evidence before you approve it.",
  "You can edit or discard any draft. Nothing leaves your outbox silently.",
];

export default function ConnectGmail() {
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
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500 text-white">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Connect Gmail
              </h1>
              <Pill className="bg-amber-50 text-amber-700 ring-amber-600/20">
                Demo
              </Pill>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">Step 2 of 4</p>
          </div>
        </div>

        <p className="mt-5 text-base leading-relaxed text-slate-600">
          In the real app, Gmail access is used{" "}
          <span className="font-medium text-slate-800">
            only to draft and send outreach with your explicit approval
          </span>{" "}
         , one message at a time, never in bulk, never automatically. In this
          demo it&apos;s fully simulated: no account is linked and no email can
          be sent.
        </p>
      </div>

      <Card className="mt-8">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <PenLine className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              How the real app treats your inbox
            </p>
            <ul className="mt-2 space-y-1.5">
              {GUARANTEES.map((g) => (
                <li key={g} className="flex items-start gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-500" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card className="mt-5">
        {!connected ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-800">
              Mock connection, no real OAuth
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              This button does not open Google, request a token, or send any
              network request. It only simulates a successful connection.
            </p>
            <Button
              className="mt-6"
              onClick={() => setConnected(true)}
              aria-label="Simulate connecting Gmail in demo mode"
            >
              <Mail className="h-4 w-4" />
              Connect Gmail (demo)
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <div>
              <span className="text-sm font-semibold">Connected (demo)</span>
              <p className="text-sm font-normal text-slate-500">
                Simulated only, no inbox is linked and no email can be sent.
              </p>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-8 flex items-center justify-between">
        <ButtonLink href="/onboarding/github" variant="ghost" size="sm">
          Back: GitHub
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
