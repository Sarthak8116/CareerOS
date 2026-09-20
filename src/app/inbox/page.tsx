"use client";

import * as React from "react";
import { Shell } from "@/components/Shell";
import {
  CampaignInbox,
  type ConversationRow,
  type InboxStatus,
} from "@/components/CampaignInbox";
import { getCampaigns } from "@/lib/store";
import { generateAllOutreach } from "@/lib/engine/outreach";
import { getProfile } from "@/lib/profileStore";
import type { Campaign, Candidate, Person } from "@/lib/types";

/**
 * Campaign Inbox page (build directive §5.20).
 *
 * Flattens every campaign's outreach into one conversation list. Statuses are
 * demo-derived starting states — see CampaignInbox for the honesty note.
 */

/** Demo-derived starting status: the first-priority contact has a prepared draft. */
function initialStatus(person: Person | undefined): InboxStatus {
  return person?.outreachPriority === "first" ? "Draft ready" : "Not contacted";
}

function nextActionFor(status: InboxStatus): string {
  switch (status) {
    case "Draft ready":
      return "Review and send the prepared draft";
    case "Sent":
      return "Wait for a reply, then follow up";
    case "Awaiting reply":
      return "Send a follow-up if no response";
    case "Replied":
      return "Reply and propose a next step";
    case "Meeting scheduled":
      return "Prepare for the conversation";
    case "Not contacted":
    default:
      return "Draft an outreach message";
  }
}

function buildRows(campaigns: Campaign[], candidate: Candidate): ConversationRow[] {
  const rows: ConversationRow[] = [];
  for (const campaign of campaigns) {
    const byId = new Map(campaign.people.map((p) => [p.id, p] as const));
    const messages = generateAllOutreach(
      candidate,
      campaign.job,
      campaign.people,
    );
    for (const msg of messages) {
      const person = byId.get(msg.personId);
      const status = initialStatus(person);
      rows.push({
        campaignId: campaign.id,
        campaignTitle: `${campaign.job.title} · ${campaign.job.company}`,
        company: campaign.job.company,
        contactName: person?.name ?? "Unknown contact",
        contactTitle: person?.title ?? "",
        objective: msg.objective,
        status,
        nextAction: nextActionFor(status),
        followUpDate: msg.followUpDate,
      });
    }
  }
  return rows;
}

export default function InboxPage() {
  const [rows, setRows] = React.useState<ConversationRow[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getCampaigns()
      .then((campaigns) => {
        if (!cancelled) setRows(buildRows(campaigns, getProfile()));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Campaign Inbox
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Every outreach conversation across your campaigns, in one place.
        </p>
      </div>

      {rows === null ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading conversations…
        </div>
      ) : (
        <CampaignInbox rows={rows} />
      )}
    </Shell>
  );
}
