"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { Campaign } from "@/lib/types";
import { getCampaign } from "@/lib/store";
import { demoCandidate } from "@/lib/demo/candidate";
import { getResumeRecommendations, verifyClaims } from "@/lib/engine/resume";
import { Shell } from "@/components/Shell";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
import { ResumeStudio } from "@/components/ResumeStudio";

/**
 * Resume & Application Studio page (§5.8).
 *
 * Loads the campaign, then derives evidence-grounded resume rewrites and the
 * honesty-pass claim flags from the demo candidate against the campaign's job.
 * Both are deterministic (no keys, DEMO MODE).
 */
export default function ApplicationStudioPage() {
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

  const recommendations = useMemo(
    () =>
      campaign ? getResumeRecommendations(demoCandidate, campaign.job) : [],
    [campaign],
  );
  const flags = useMemo(() => verifyClaims(demoCandidate), []);

  /* Loading + not-found guards (no hydration flash). */
  if (!loaded) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Sparkles className="h-4 w-4 animate-pulse" />
          Loading application studio…
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

  return (
    <Shell>
      <div className="mb-3">
        <ButtonLink href={`/campaigns/${campaign.id}`} variant="ghost" size="sm">
          ← Back to campaign
        </ButtonLink>
      </div>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Application studio
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tailoring your resume for {job.title} at {job.company} — every rewrite
          traced to your real evidence.
        </p>
      </header>

      <div className="mt-8">
        <ResumeStudio recommendations={recommendations} flags={flags} />
      </div>
    </Shell>
  );
}
