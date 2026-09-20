"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { Campaign, Candidate } from "@/lib/types";
import { getCampaign } from "@/lib/store";
import { getProfile } from "@/lib/profileStore";
import { getInterviewQuestions } from "@/lib/engine/interview";
import { Shell } from "@/components/Shell";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
import { MockInterview } from "@/components/MockInterview";

/**
 * Interview preparation page (build directive §5.19 P0).
 *
 * Resolves the campaign from the demo store, derives a deterministic question
 * set from the demo candidate + this campaign's job, and renders the text-mode
 * mock interview. Loading / not-found guards mirror the sibling pages so there
 * is no hydration flash.
 */
export default function CampaignInterviewPage() {
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
          Loading interview prep…
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
  const questions = getInterviewQuestions(
    candidate ?? getProfile(),
    job,
    campaign.harvest,
  );

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
          Mock interview
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {job.company}
          {job.team ? ` · ${job.team}` : ""}, practice one question at a time
          for {job.title}. Feedback is qualitative, grounded in your evidence.
        </p>
      </div>

      <MockInterview questions={questions} />
    </Shell>
  );
}
