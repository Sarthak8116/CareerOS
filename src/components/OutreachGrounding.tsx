"use client";

import {
  Mail,
  Linkedin,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Clock,
  CalendarClock,
  Target,
  Info,
  Save,
  X,
} from "lucide-react";
import type { OutreachMessage } from "@/lib/types";
import { Button, Card, Pill, SectionTitle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { OutreachStatus } from "@/lib/outreachStore";

type MessageStatus = OutreachStatus;

/** Why this message says what it says: objective, evidence, caveats, timing. */
export function OutreachGrounding({
  selected,
  personalizationFacts,
  claimsToVerify,
}: {
  selected: OutreachMessage;
  personalizationFacts: string[];
  claimsToVerify: string[];
}) {
  return (
    <Card>
      <SectionTitle>Why this message</SectionTitle>

      {/* Objective */}
      <div className="mt-3 flex items-start gap-2">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Objective
          </p>
          <p className="mt-0.5 text-sm text-slate-700">{selected.objective}</p>
        </div>
      </div>

      {/* Personalization facts (+ any live post excerpts) */}
      {personalizationFacts.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Personalization
          </p>
          <ul className="mt-1.5 space-y-1">
            {personalizationFacts.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Evidence used — source-backed pills */}
      {selected.evidenceUsed.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Evidence used
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {selected.evidenceUsed.map((e, i) => (
              <Pill
                key={i}
                className="bg-brand-50 text-brand-700 ring-brand-600/20"
              >
                <ShieldCheck className="h-3 w-3" /> {e}
              </Pill>
            ))}
          </div>
        </div>
      )}

      {/* Claims to verify — amber caution (+ any live lookup caveats) */}
      {claimsToVerify.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Verify before sending
          </p>
          <ul className="mt-1.5 space-y-1">
            {claimsToVerify.map((c, i) => (
              <li key={i} className="text-sm text-amber-800">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {selected.warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Warnings
          </p>
          <ul className="mt-1.5 space-y-1">
            {selected.warnings.map((w, i) => (
              <li key={i} className="text-sm text-rose-800">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timing */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Recommended send time
            </p>
            <p className="mt-0.5 text-sm text-slate-700">
              {selected.recommendedSendTime}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Follow up
            </p>
            <p className="mt-0.5 text-sm text-slate-700">
              {selected.followUpDate}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Second, explicit step before anything leaves — nothing sends on one click. */
export function SendConfirmPanel({
  recipient,
  viaGmail,
  handsOff,
  onConfirm,
  onCancel,
}: {
  recipient: string;
  viaGmail: boolean;
  /** True outside the demo: the draft opens in the user's own Gmail. */
  handsOff: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Confirm before sending</p>
            <p className="mt-1 text-sm text-amber-800">
              This is addressed to <span className="font-medium">{recipient}</span>
              {viaGmail ? " via Gmail" : ""}.{" "}
              {handsOff
                ? "It opens the draft in your own Gmail — you press Send there. CareerOS never sends on your behalf."
                : "In demo mode no real email is sent."}
            </p>
          </div>
        </div>
        <button
          onClick={onCancel}
          aria-label="Cancel send"
          className="shrink-0 text-amber-500 transition-colors hover:text-amber-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={onConfirm}>
          <CheckCircle2 className="h-4 w-4" />
          {handsOff ? "Open in Gmail" : "Confirm send"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Small presentational helpers                                      */
/* ---------------------------------------------------------------- */

export function ChannelIcon({
  channel,
  className,
}: {
  channel: OutreachMessage["channel"];
  className?: string;
}) {
  return channel === "email" ? (
    <Mail className={className} />
  ) : (
    <Linkedin className={className} />
  );
}

export function StatusDot({ status }: { status: MessageStatus }) {
  if (status === "sent")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  if (status === "draft")
    return <Save className="h-4 w-4 shrink-0 text-slate-400" />;
  return null;
}

export function StatusBadge({ status }: { status: MessageStatus }) {
  if (status === "sent")
    return (
      <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
        <CheckCircle2 className="h-3 w-3" /> Sent (demo)
      </Pill>
    );
  if (status === "draft")
    return (
      <Pill className="bg-slate-100 text-slate-600 ring-slate-500/20">
        <Save className="h-3 w-3" /> Draft
      </Pill>
    );
  return (
    <Pill className="bg-slate-100 text-slate-500 ring-slate-500/20">Not sent</Pill>
  );
}
