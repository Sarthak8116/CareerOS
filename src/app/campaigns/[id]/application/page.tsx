"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Package, Sparkles } from "lucide-react";
import type {
  ApplicationPackage,
  Campaign,
  Candidate,
  ResumeRecommendation,
} from "@/lib/types";
import { getCampaign, setResumeRecommendationStatus } from "@/lib/store";
import { getAnswers } from "@/lib/answers";
import { getProfile } from "@/lib/profileStore";
import { getResumeRecommendations, verifyClaims } from "@/lib/engine/resume";
import type { ResumeStyleMemory } from "@/lib/engine/resume";
import { computeRequirementCoverage } from "@/lib/engine/keywords";
import {
  getStyleMemory,
  recordResumeDecision,
} from "@/lib/styleMemory";
import {
  CoverLetterDraft,
  type CoverLetterOrigin,
} from "@/lib/package/coverLetter";
import { buildApplicationPackage } from "@/lib/package/build";
import { buildPackageZip, packageZipName } from "@/lib/package/zip";
import { Shell } from "@/components/Shell";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
} from "@/components/ui/primitives";
import { ResumeStudio } from "@/components/ResumeStudio";
import { PackageReview } from "@/components/PackageReview";

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
  /**
   * The REAL candidate, from the profile store.
   *
   * Read in the effect below rather than during render: `getProfile()` is a
   * localStorage read, so a server render and the first client render would
   * otherwise disagree. It is `undefined` until that effect runs, and nothing
   * that consumes it is rendered before then.
   *
   * This page used to ground everything in `demoCandidate`, which meant a real
   * user was shown claim verification and resume recommendations computed
   * against SOMEONE ELSE'S evidence, the honesty surface asserting things
   * about a different person and calling it their check. Never reintroduce a
   * demo fallback here; `getProfile()` already falls back to one internally,
   * once, in the one place that owns that decision.
   */
  const [candidate, setCandidate] = useState<Candidate | undefined>(undefined);
  const [styleMemory, setStyleMemory] = useState<ResumeStyleMemory | undefined>(
    undefined,
  );
  const [loaded, setLoaded] = useState(false);

  /* The package is built ON REQUEST, not on mount: with a key present it costs
     a real model call, and a page visit is not consent to spend one. */
  const [pkg, setPkg] = useState<ApplicationPackage | undefined>(undefined);
  const [origin, setOrigin] = useState<CoverLetterOrigin | "none">("none");
  const [building, setBuilding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | undefined>(undefined);
  const [buildError, setBuildError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    (async () => {
      const c = await getCampaign(id);
      if (!active) return;
      setCampaign(c);
      setCandidate(getProfile());
      setStyleMemory(getStyleMemory());
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  /**
   * Rewrites are DERIVED from the candidate's evidence and this job, then
   * carry the user's PERSISTED decision. Only the decision is stored (see
   * `Campaign.resumeDecisions`): a rewrite saved as prose would outlive the
   * evidence it was generated from.
   */
  const recommendations = useMemo(() => {
    if (!campaign || !candidate) return [];
    const decisions = campaign.resumeDecisions ?? {};
    return getResumeRecommendations(candidate, campaign.job, styleMemory).map((rec) => ({
      ...rec,
      status: decisions[rec.id] ?? rec.status,
    }));
  }, [campaign, candidate, styleMemory]);

  const coverage = useMemo(
    () =>
      campaign && candidate
        ? computeRequirementCoverage(candidate, campaign.job)
        : [],
    [campaign, candidate],
  );

  const decideRecommendation = useCallback(
    (recommendationId: string, status: ResumeRecommendation["status"]) => {
      void (async () => {
        const current = recommendations.find((rec) => rec.id === recommendationId);
        const updated = await setResumeRecommendationStatus(
          id,
          recommendationId,
          status,
        );
        if (!updated) return;
        setCampaign(updated);
        if (current) {
          setStyleMemory(
            recordResumeDecision({
              original: current.original,
              suggested: current.suggested,
              previousStatus: current.status,
              nextStatus: status,
            }),
          );
        }
      })();
    },
    [id, recommendations],
  );
  const flags = useMemo(
    () => (candidate ? verifyClaims(candidate) : []),
    [candidate],
  );

  /**
   * Assemble the package.
   *
   * The live draft is best-effort: a 503 (no key) or any failure is the
   * SUPPORTED path, not an error, `buildApplicationPackage` then assembles
   * the letter from the evidence graph instead. Which of the two happened is
   * reported to the user rather than glossed over, because "a model wrote
   * this" and "your own evidence was assembled into this" are different
   * claims about the same file.
   */
  const build = useCallback(async () => {
    if (!campaign || !candidate) return;
    setBuilding(true);
    setExportError(undefined);
    setBuildError(undefined);

    let coverLetter: CoverLetterDraft | undefined;
    try {
      const res = await fetch("/api/package/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate, job: campaign.job }),
      });
      if (res.ok) {
        const body: unknown = await res.json();
        /* Validated at the boundary, a malformed draft is dropped rather
           than rendered, and we fall back to the deterministic letter. */
        const parsed = CoverLetterDraft.safeParse(
          (body as { draft?: unknown })?.draft,
        );
        if (parsed.success) coverLetter = parsed.data;
      }
    } catch {
      /* Offline or route unreachable, deterministic letter, same as no key. */
    }

    try {
      const built = buildApplicationPackage({
        campaign,
        candidate,
        library: getAnswers(),
        builtAt: new Date().toISOString(),
        coverLetter,
      });
      setPkg(built.package);
      setOrigin(built.coverLetterOrigin);
    } catch {
      /* The builder validates its own assembly and throws rather than emit a
         malformed package. Say so plainly instead of showing a stuck button. */
      setBuildError(
        "CareerOS could not assemble a package it was willing to stand behind. Nothing was produced.",
      );
    } finally {
      setBuilding(false);
    }
  }, [campaign, candidate]);

  /** Download the .zip the user just reviewed, not a freshly rebuilt one. */
  const exportZip = useCallback(async () => {
    if (!pkg) return;
    setExporting(true);
    setExportError(undefined);
    /* Declared OUT here on purpose. Held inside the try, a failure anywhere
       after createObjectURL, the anchor click, the DOM insert, would skip
       the revoke and leak the blob for the life of the page. That blob holds
       the user's cover letter and personal information, so it is their data
       left in memory, not just a handle. `finally` revokes it on every path. */
    let url: string | undefined;
    try {
      const bytes = await buildPackageZip(pkg);
      url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = packageZipName(pkg);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setExportError(
        "The archive could not be created. Nothing was downloaded.",
      );
    } finally {
      if (url) URL.revokeObjectURL(url);
      setExporting(false);
    }
  }, [pkg]);

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
            Back to Home
          </ButtonLink>
        </div>
      </Shell>
    );
  }

  const { job } = campaign;

  return (
    <Shell>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Application studio
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tailoring your resume for {job.title} at {job.company}, every rewrite
          traced to your real evidence.
        </p>
      </header>

      <div className="mt-8">
        <ResumeStudio
          coverage={coverage}
          evidence={candidate?.evidence ?? []}
          recommendations={recommendations}
          flags={flags}
          onDecide={decideRecommendation}
        />
      </div>

      <div className="mt-10">
        {pkg ? (
          <>
            {/* Only said when a letter was actually produced: origin "none"
                means this posting doesn't ask for one, and describing how a
                non-existent document was written would be a claim about
                nothing. */}
            {origin !== "none" && (
              <p className="mb-4 text-sm text-slate-500">
                {origin === "model"
                  ? "The cover letter was drafted by the model, then every sentence was graded against your evidence, the grading below is what counts, not the drafting."
                  : "The cover letter was assembled from your evidence rather than written by a model."}
              </p>
            )}
            <PackageReview
              pkg={pkg}
              onChange={setPkg}
              onExport={exportZip}
              exporting={exporting}
              exportError={exportError}
            />
          </>
        ) : (
          <Card>
            <CardHeader
              title="Application package"
              subtitle="Assemble everything this posting asks for into one folder you can download."
            />
            <p className="text-sm text-slate-600">
              You&apos;ll see each document, what it claims, and what CareerOS
              could not produce, before anything is exported.
            </p>
            {buildError && (
              <p className="mt-3 text-sm text-rose-700" role="alert">
                {buildError}
              </p>
            )}
            <div className="mt-4">
              <Button onClick={build} disabled={building}>
                <Package className="h-4 w-4" aria-hidden="true" />
                {building ? "Assembling…" : "Build the application package"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </Shell>
  );
}
