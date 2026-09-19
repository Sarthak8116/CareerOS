"use client";

import * as React from "react";
import Link from "next/link";
import { Pill, Card, EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Campaign Inbox (build directive §5.20).
 *
 * A single unified view of every outreach conversation across all campaigns:
 * contact · organization · campaign · current status · next suggested action ·
 * follow-up date. Statuses are the §5.20 categorical set.
 *
 * DEMO HONESTY: this app has no live email/LinkedIn connection, so no replies
 * can have been received. Every status here is a DEMO-DERIVED STARTING state
 * (first-priority contact = a prepared draft; everyone else = not yet
 * contacted). Nothing claims a message was sent or answered.
 */

export type InboxStatus =
  | "Not contacted"
  | "Draft ready"
  | "Sent"
  | "Awaiting reply"
  | "Replied"
  | "Meeting scheduled";

export type ConversationRow = {
  campaignId: string;
  campaignTitle: string;
  company: string;
  contactName: string;
  contactTitle: string;
  objective: string;
  status: InboxStatus;
  nextAction: string;
  followUpDate: string;
};

/** All statuses in a stable display order (used for the filter + counts). */
export const INBOX_STATUSES: InboxStatus[] = [
  "Not contacted",
  "Draft ready",
  "Sent",
  "Awaiting reply",
  "Replied",
  "Meeting scheduled",
];

const statusStyle: Record<InboxStatus, string> = {
  "Not contacted": "bg-slate-100 text-slate-600 ring-slate-500/20",
  "Draft ready": "bg-brand-50 text-brand-700 ring-brand-600/20",
  Sent: "bg-violet-50 text-violet-700 ring-violet-600/20",
  "Awaiting reply": "bg-amber-50 text-amber-700 ring-amber-600/20",
  Replied: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  "Meeting scheduled": "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

function StatusPill({ status }: { status: InboxStatus }) {
  return <Pill className={statusStyle[status]}>{status}</Pill>;
}

export function CampaignInbox({ rows }: { rows: ConversationRow[] }) {
  const [filter, setFilter] = React.useState<InboxStatus | "all">("all");

  // Only offer filters for statuses that actually appear (plus "All").
  const present = React.useMemo(() => {
    const counts = new Map<InboxStatus, number>();
    for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return counts;
  }, [rows]);

  const visible = React.useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No conversations yet — build a campaign"
        body="Once you start a campaign, every outreach thread shows up here in one place."
      />
    );
  }

  const filters: Array<{ key: InboxStatus | "all"; label: string; count: number }> = [
    { key: "all", label: "All", count: rows.length },
    ...INBOX_STATUSES.filter((s) => present.has(s)).map((s) => ({
      key: s,
      label: s,
      count: present.get(s) ?? 0,
    })),
  ];

  return (
    <div className="space-y-4">
      {/* Status filter */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                active
                  ? "bg-brand-600 text-white ring-brand-600"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold",
                  active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
                )}
              >
                {f.count}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">
              Outreach conversations across all campaigns
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
                <th scope="col" className="px-5 py-3 font-semibold">Contact</th>
                <th scope="col" className="px-5 py-3 font-semibold">Organization</th>
                <th scope="col" className="px-5 py-3 font-semibold">Campaign</th>
                <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                <th scope="col" className="px-5 py-3 font-semibold">Next suggested action</th>
                <th scope="col" className="px-5 py-3 font-semibold">Follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((row, i) => (
                <tr
                  key={`${row.campaignId}:${row.contactName}:${i}`}
                  className="transition-colors hover:bg-slate-50/70"
                >
                  <td className="px-5 py-3 align-top">
                    <Link
                      href={`/campaigns/${encodeURIComponent(row.campaignId)}/outreach`}
                      className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {row.contactName}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">{row.contactTitle}</div>
                    <div className="mt-1 text-xs text-slate-400">{row.objective}</div>
                  </td>
                  <td className="px-5 py-3 align-top text-slate-700">{row.company}</td>
                  <td className="px-5 py-3 align-top">
                    <Link
                      href={`/campaigns/${encodeURIComponent(row.campaignId)}/outreach`}
                      className="text-slate-700 hover:text-brand-700 hover:underline"
                    >
                      {row.campaignTitle}
                    </Link>
                  </td>
                  <td className="px-5 py-3 align-top">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-5 py-3 align-top text-slate-600">{row.nextAction}</td>
                  <td className="px-5 py-3 align-top text-slate-500">{row.followUpDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {visible.length === 0 && (
        <EmptyState title={`No conversations with status "${filter}"`} />
      )}

      <p className="text-xs text-slate-400">
        Demo mode: statuses are the starting state for each conversation. No messages
        have been sent and no replies have been received.
      </p>
    </div>
  );
}
