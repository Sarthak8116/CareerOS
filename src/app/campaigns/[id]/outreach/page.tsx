"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { Campaign, Candidate } from "@/lib/types";
import { getCampaign } from "@/lib/store";
import { getProfile } from "@/lib/profileStore";
import { generateAllOutreach } from "@/lib/engine/outreach";
import { Shell } from "@/components/Shell";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
import { OutreachComposer } from "@/components/OutreachComposer";

/**
 * Outreach Studio page (build directive §5.13, §5.14).
 *
 * Loads the campaign, deterministically drafts one grounded message per
 * mapped contact, and hands them to the composer. Nothing is ever sent
 * without an explicit two-step confirmation, and demo sends are simulated.
 */
export default function OutreachPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [campaign, setCampaign] = useState<Campaign | undefined>(undefined);
  const [candidate, setCandidate] = useState<Candidate | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const c = await getCampaign(id);
      if (!active) return;
      setCampaign(c);
      setCandidate(getProfile());
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const messages = useMemo(
    () =>
      campaign
        ? generateAllOutreach(candidate ?? getProfile(), campaign.job, campaign.people)
        : [],
    [campaign, candidate],
  );

  /* Loading + not-found guards (no hydration flash). */
  if (!loaded) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Sparkles className="h-4 w-4 animate-pulse" />
          Loading outreach…
        </div>
      </Shell>
    );
  }

  if (!campaign) {
    return (
      <Shell>
        <EmptyState
          title="Campaign not found"
          body="This campaign may have been reset or never existed."
        />
        <div className="mt-4">
          <ButtonLink href="/dashboard" variant="secondary" size="sm">
            Back to Home
          </ButtonLink>
        </div>
      </Shell>
    );
  }

  const { job } = campaign;

  return (
    <Shell>
      {/* Header */}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Outreach Studio
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {job.title} · {job.company}
            {job.team ? ` · ${job.team}` : ""}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-500">
        Each draft is grounded in your evidence and this contact's inferred
        role. Review carefully,{" "}
        <span className="font-medium text-slate-600">
          nothing is sent without your explicit confirmation
        </span>
        , and in demo mode no real email leaves the app.
      </p>

      <div className="mt-6">
        {campaign.people.length === 0 ? (
          <EmptyState
            title="No contacts to reach out to yet"
            body="The network agent hasn't surfaced any people for this role, so there's nothing to draft."
          />
        ) : (
          <OutreachComposer
            messages={messages}
            people={campaign.people}
            isDemo={campaign.isDemo}
          />
        )}
      </div>
    </Shell>
  );
}
