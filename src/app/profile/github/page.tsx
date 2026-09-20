"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Shell } from "@/components/Shell";
import { GitHubAnalysisView } from "@/components/GitHubAnalysis";
import { analyzeGitHub } from "@/lib/engine/github";
import { getProfile } from "@/lib/profileStore";

/**
 * §5.15 GitHub analysis page.
 * Runs the deterministic engine over the stored profile, no live API calls.
 */
export default function GitHubAnalysisPage() {
  const analysis = analyzeGitHub(getProfile());

  return (
    <Shell>
      <div className="mb-6">
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          GitHub analysis
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Which repositories to feature, which READMEs to strengthen, and which
          claimed skills still lack public evidence.
        </p>
      </div>

      <GitHubAnalysisView analysis={analysis} />
    </Shell>
  );
}
