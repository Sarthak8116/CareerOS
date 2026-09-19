"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { Campaign } from "@/lib/types";
import { getCampaign } from "@/lib/store";
import { getCompanyIntel } from "@/lib/engine/company";
import { Shell } from "@/components/Shell";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
import { CompanyIntelView } from "@/components/CompanyIntel";

/**
 * Company & team intelligence page (build directive §5.6).
 *
 * Resolves the campaign from the demo store, derives cached company intel from
 * its job, and renders the presentational view. Loading / not-found guards
 * mirror the campaign detail page so there is no hydration flash.
 */
export default function CampaignIntelligencePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [campaign, setCampaign] = useState<Campaign | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const c = await getCampaign(id);
      if (!active) return;
      setCampaign(c);
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
          Loading intelligence…
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
  const intel = getCompanyIntel(job, campaign.harvest);

  return (
    <Shell>
      {/* Back-link to the campaign */}
      <div className="mb-3">
        <ButtonLink href={`/campaigns/${campaign.id}`} variant="ghost" size="sm">
          ← Back to campaign
        </ButtonLink>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Company & team intelligence
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {job.company}
          {job.team ? ` · ${job.team}` : ""} — cached research for {job.title}
        </p>
      </div>

      <CompanyIntelView intel={intel} />
    </Shell>
  );
}
