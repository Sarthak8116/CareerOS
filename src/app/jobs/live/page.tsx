"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  UploadCloud,
  FileText,
  X,
} from "lucide-react";
import { Candidate as CandidateSchema, type Campaign } from "@/lib/types";
import { saveCampaign } from "@/lib/store";
import { getProfile, saveProfile } from "@/lib/profileStore";
import { applyKnownConnections } from "@/lib/linkedin/match";
import { Shell } from "@/components/Shell";
import { Button, Card, CardHeader, Pill } from "@/components/ui/primitives";
import {
  rasterizeResumePdf,
  truncationNotice,
  ResumeRasterizeError,
  type RasterizedResume,
} from "@/lib/resume/rasterize";

export default function LiveJobPage() {
  const router = useRouter();
  const [live, setLive] = useState<boolean | null>(null);
  const [resume, setResume] = useState<RasterizedResume | null>(null);
  const [resumeName, setResumeName] = useState("");
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [jobText, setJobText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The résumé is rendered to page images HERE, in the browser, and only the
   * rendered pages are ever uploaded — the PDF itself never leaves the user's
   * machine. See `@/lib/resume/rasterize` for why that must stay true.
   *
   * Rendering happens on selection rather than on submit so the user learns
   * what CareerOS will actually read — how many pages, and whether any were
   * left out — before they commit to the analysis, not after.
   */
  async function onResumeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    // Some browsers and downloaded files report an empty or generic MIME type
    // even when the file is a PDF. pdf.js performs the authoritative signature
    // check below, so use the extension as the client-side picker guard too.
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError(null);
      setResumeName(file.name);
      setResume(null);
      setResumeError("Please upload a PDF file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(null);
      setResumeName(file.name);
      setResume(null);
      setResumeError("That PDF is too large (max 8 MB).");
      return;
    }

    setError(null);
    setResumeError(null);
    setResume(null);
    setResumeName(file.name);
    setReading(true);
    try {
      setResume(await rasterizeResumePdf(file));
    } catch (err) {
      // ResumeRasterizeError messages are written for the user and say what to
      // do next. Anything else is a bug, and is not dressed up as a result.
      setResumeError(
        err instanceof ResumeRasterizeError
          ? err.message
          : "Could not read that PDF. Try re-exporting it and uploading again.",
      );
    } finally {
      setReading(false);
    }
  }

  function clearResume() {
    setResume(null);
    setResumeName("");
    setResumeError(null);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/campaign")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setLive(!!d.live);
      })
      .catch(() => active && setLive(false));
    return () => {
      active = false;
    };
  }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!resume) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobText,
          resume: {
            pages: resume.pages,
            totalPages: resume.totalPages,
            truncated: resume.truncated,
            truncatedReason: resume.truncatedReason,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setBusy(false);
        return;
      }
      const received = data.campaign as Campaign;
      const candidate = CandidateSchema.safeParse(data.candidate);
      if (!candidate.success) {
        throw new Error("Live analysis returned an invalid candidate profile.");
      }
      const existingProfile = getProfile();
      saveProfile({
        ...candidate.data,
        linkedinConnections: existingProfile.linkedinConnections,
      });
      // The Connections.csv export never leaves this browser, so the match
      // against it happens here rather than on the server.
      const campaign: Campaign = {
        ...received,
        people: applyKnownConnections(
          received.people,
          existingProfile.linkedinConnections,
        ),
      };
      saveCampaign(campaign);
      router.push(`/campaigns/${campaign.id}`);
    } catch {
      setError("Could not reach the server. Is the dev server running?");
      setBusy(false);
    }
  }

  const notice = resume ? truncationNotice(resume) : null;

  return (
    <Shell>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Run a real job
          </h1>
          <Pill className="bg-brand-50 text-brand-700 ring-brand-600/20">Live</Pill>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Upload your résumé (PDF) and paste a real job posting. Your résumé is
          rendered to page images in your browser — the PDF itself never leaves
          your machine. CareerOS then runs the full analysis and builds a live
          campaign, grounded in your evidence, with no fabricated people or
          numbers.
        </p>
      </div>

      {/* Live-mode availability banner */}
      {live === false && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Live mode is off.</p>
            <p className="mt-1 leading-relaxed text-amber-800">
              Add your NVIDIA API key to a{" "}
              <code className="rounded bg-amber-100 px-1">.env.local</code>{" "}
              file at the project root and restart the dev server. The exact
              variable name is in the server&apos;s startup error. Your key
              stays on the server and is never sent to the browser — which is
              also why this page does not name it. Meanwhile, the{" "}
              <a href="/demo" className="font-medium underline">demo campaign</a>{" "}
              works with no key.
            </p>
          </div>
        </div>
      )}
      {live && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Live mode ready
        </p>
      )}

      <form onSubmit={run} className="mt-6 space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Your résumé"
              subtitle="Upload a PDF. It's read in your browser, not uploaded."
            />
            {reading ? (
              <div className="flex h-[19rem] flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
                <p className="text-sm font-medium text-slate-700">
                  Reading {resumeName}…
                </p>
                <p className="text-xs text-slate-400">
                  Rendering its pages here on your machine
                </p>
              </div>
            ) : resume ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
                    <FileText className="h-5 w-5 shrink-0 text-brand-600" />
                    <span className="truncate">{resumeName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={clearResume}
                    aria-label="Remove résumé"
                    className="shrink-0 text-slate-400 transition-colors hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {resume.pages.length} of {resume.totalPages}{" "}
                  {resume.totalPages === 1 ? "page" : "pages"} will be analysed.
                </p>
                {notice && (
                  <p
                    role="status"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"
                  >
                    {notice}
                  </p>
                )}
              </div>
            ) : (
              <label className="flex h-[19rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/50">
                <UploadCloud className="h-8 w-8 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Click to upload your résumé
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">PDF only · up to 8 MB</p>
                </div>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={onResumeFile}
                  className="sr-only"
                />
              </label>
            )}
            {resumeError && (
              <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <p className="font-medium">Could not load {resumeName || "that file"}</p>
                <p className="mt-1 text-xs text-rose-700">{resumeError}</p>
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="The job posting" subtitle="Paste the full description." />
            <label htmlFor="job" className="sr-only">Job description text</label>
            <textarea
              id="job"
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              rows={14}
              placeholder="Paste the job description here…"
              className="block w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </Card>
        </div>

        {error && (
          <p role="alert" className="text-sm text-rose-600">{error}</p>
        )}

        {busy ? (
          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-brand-900">
              <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
              Running the live analysis…
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Reading your résumé pages, parsing the job, and building the
              campaign. This can take up to a minute or two — the model reasons
              through the fit, gaps, and outreach before returning.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={
                live === false ||
                reading ||
                !resume ||
                jobText.trim().length < 40
              }
            >
              <Sparkles className="h-4 w-4" /> Build live campaign
              <ArrowRight className="h-4 w-4" />
            </Button>
            <span className="text-xs text-slate-400">
              Your key stays server-side · nothing is sent without your action
            </span>
          </div>
        )}
      </form>
    </Shell>
  );
}
