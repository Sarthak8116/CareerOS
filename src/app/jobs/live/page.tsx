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
import type { Campaign } from "@/lib/types";
import { saveCampaign } from "@/lib/store";
import { Shell } from "@/components/Shell";
import { Button, Card, CardHeader, Pill } from "@/components/ui/primitives";

export default function LiveJobPage() {
  const router = useRouter();
  const [live, setLive] = useState<boolean | null>(null);
  const [model, setModel] = useState<string>("");
  const [resumeBase64, setResumeBase64] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [jobText, setJobText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onResumeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("That PDF is too large (max 8 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.split(",")[1] ?? "";
      setResumeBase64(base64);
      setResumeName(file.name);
      setError(null);
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsDataURL(file);
  }

  function clearResume() {
    setResumeBase64("");
    setResumeName("");
  }

  useEffect(() => {
    let active = true;
    fetch("/api/campaign")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setLive(!!d.live);
        setModel(d.model ?? "");
      })
      .catch(() => active && setLive(false));
    return () => {
      active = false;
    };
  }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumePdfBase64: resumeBase64, jobText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setBusy(false);
        return;
      }
      const campaign = data.campaign as Campaign;
      saveCampaign(campaign);
      router.push(`/campaigns/${campaign.id}`);
    } catch {
      setError("Could not reach the server. Is the dev server running?");
      setBusy(false);
    }
  }

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
          Upload your résumé (PDF) and paste a real job posting. CareerOS runs
          the full analysis with Claude and builds a live campaign — grounded in
          your evidence, with no fabricated people or numbers.
        </p>
      </div>

      {/* Live-mode availability banner */}
      {live === false && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Live mode is off.</p>
            <p className="mt-1 leading-relaxed text-amber-800">
              Add your Anthropic API key to a <code className="rounded bg-amber-100 px-1">.env.local</code>{" "}
              file at the project root as{" "}
              <code className="rounded bg-amber-100 px-1">ANTHROPIC_API_KEY=sk-ant-...</code>{" "}
              and restart the dev server. Your key stays on the server and is
              never sent to the browser. Meanwhile, the{" "}
              <a href="/demo" className="font-medium underline">demo campaign</a>{" "}
              works with no key.
            </p>
          </div>
        </div>
      )}
      {live && model && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Live mode ready · model {model}
        </p>
      )}

      <form onSubmit={run} className="mt-6 space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Your résumé" subtitle="Upload a PDF." />
            {resumeBase64 ? (
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
                  accept="application/pdf"
                  onChange={onResumeFile}
                  className="sr-only"
                />
              </label>
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
              Parsing your résumé, parsing the job, and building the campaign.
              This can take up to a minute or two — the model reasons through the
              fit, gaps, and outreach before returning.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={live === false || !resumeBase64 || jobText.trim().length < 40}
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
