"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { Campaign, Candidate } from "@/lib/types";
import { getCampaign } from "@/lib/store";
import { buildOpportunityGraph } from "@/lib/engine/graph";
import { getCompanyIntel } from "@/lib/engine/company";
import { getProfile } from "@/lib/profileStore";
import { Shell } from "@/components/Shell";
import { Card, CardHeader, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { OpportunityGraphView } from "@/components/OpportunityGraph";

/**
 * Opportunity graph page (§5.12), the relationship map for a campaign.
 * Answers: who to contact first, the warmest path in, and which evidence
 * supports the role. All inferred links are labeled, never presented as fact.
 */
export default function CampaignGraphPage() {
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

  if (!loaded) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Sparkles className="h-4 w-4 animate-pulse" />
          Loading graph…
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
            Back to Mission Control
          </ButtonLink>
        </div>
      </Shell>
    );
  }

  const { job } = campaign;
  const graph = buildOpportunityGraph({
    candidate: candidate ?? getProfile(),
    job,
    people: campaign.people,
    company: getCompanyIntel(job, campaign.harvest),
  });

  return (
    <Shell>
      {/* Back link */}
      <div className="mb-3">
        <ButtonLink href={`/campaigns/${campaign.id}`} variant="ghost" size="sm">
          ← Back to campaign
        </ButtonLink>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Opportunity graph
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {job.title} · {job.company}
          {job.team ? ` · ${job.team}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader
          title="How you connect to this role"
          subtitle="The warmest path in is highlighted. Inferred relationships are labeled, not confirmed."
        />
        <OpportunityGraphView graph={graph} />
        <p className="mt-4 text-xs text-slate-500">
          Inferred relationships are labeled, not confirmed. Verify people and reporting lines
          before you reach out.
        </p>
      </Card>
    </Shell>
  );
}
