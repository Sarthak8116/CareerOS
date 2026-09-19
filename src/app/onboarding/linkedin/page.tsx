"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Linkedin,
  CheckCircle2,
  ClipboardPaste,
  Upload,
  Sparkles,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button, ButtonLink, Card, Pill } from "@/components/ui/primitives";
import { demoCandidate } from "@/lib/demo/candidate";
import type { Evidence } from "@/lib/types";
import { isLinkedInProfileUrl } from "@/lib/harvest/urls";

/**
 * Onboarding · Import LinkedIn.
 *
 * DEMO MODE (the default): no real LinkedIn connection or scraping. The user
 * picks an import method; only "use sample" is wired up, and it reveals a few
 * fields from the demo candidate as if they'd been imported.
 *
 * LIVE MODE (only when HARVEST_ENABLED=true and APIFY_TOKEN are set): a fourth
 * method appears that fetches the user's OWN public profile through the
 * server-only Harvest route and maps it into evidence records. Never email
 * mode. When the flag is off this method is not offered at all and the page
 * behaves exactly as before.
 */

type Method = "paste" | "upload" | "sample" | "live";

const METHODS: { id: Method; icon: typeof Linkedin; label: string; hint: string }[] = [
  {
    id: "paste",
    icon: ClipboardPaste,
    label: "Paste profile text",
    hint: "Copy your profile and paste it in",
  },
  {
    id: "upload",
    icon: Upload,
    label: "Upload data export",
    hint: "LinkedIn → Settings → Get a copy of your data",
  },
  {
    id: "sample",
    icon: Sparkles,
    label: "Use sample profile",
    hint: "Try it with the demo candidate",
  },
];

const LIVE_METHOD = {
  id: "live" as const,
  icon: Linkedin,
  label: "Import my profile",
  hint: "Fetch your public LinkedIn profile",
};

interface LiveProfile {
  name: string;
  headline: string;
  location: string;
  linkedinUrl: string;
}

export default function ImportLinkedin() {
  const [method, setMethod] = useState<Method | null>(null);
  const [imported, setImported] = useState(false);

  /* Live-mode state. All inert unless the server reports Harvest is on. */
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [profileUrl, setProfileUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveProfile, setLiveProfile] = useState<LiveProfile | null>(null);
  const [liveEvidence, setLiveEvidence] = useState<Evidence[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/harvest/profile")
      .then((r) => r.json())
      .then((d) => active && setLiveAvailable(!!d.enabled))
      .catch(() => active && setLiveAvailable(false));
    return () => {
      active = false;
    };
  }, []);

  const methods = liveAvailable ? [...METHODS, LIVE_METHOD] : METHODS;

  async function runLiveImport() {
    setError(null);
    if (!isLinkedInProfileUrl(profileUrl)) {
      setError("Enter a LinkedIn profile URL, e.g. linkedin.com/in/your-name.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/harvest/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That import failed. Try again.");
        return;
      }
      setLiveProfile(data.profile);
      setLiveEvidence(Array.isArray(data.evidence) ? data.evidence : []);
    } catch {
      setError("Could not reach the import service.");
    } finally {
      setBusy(false);
    }
  }

  const importedFields: { label: string; value: string }[] = liveProfile
    ? [
        { label: "Name", value: liveProfile.name || "—" },
        { label: "Headline", value: liveProfile.headline || "—" },
        { label: "Location", value: liveProfile.location || "—" },
        { label: "Evidence found", value: `${liveEvidence.length} records` },
        { label: "LinkedIn", value: liveProfile.linkedinUrl },
      ]
    : [
        { label: "Name", value: demoCandidate.name },
        { label: "Headline", value: demoCandidate.headline },
        { label: "Location", value: demoCandidate.location },
        { label: "Education", value: `${demoCandidate.degree}, ${demoCandidate.university}` },
        { label: "LinkedIn", value: demoCandidate.links.linkedin ?? "—" },
      ];

  const showResults = imported || !!liveProfile;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-12">
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to onboarding
      </Link>

      <div className="mt-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-600 text-white">
            <Linkedin className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Import LinkedIn
              </h1>
              <Pill
                className={
                  liveAvailable
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    : "bg-amber-50 text-amber-700 ring-amber-600/20"
                }
              >
                {liveAvailable ? "Live" : "Demo"}
              </Pill>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">Step 3 of 4</p>
          </div>
        </div>

        <p className="mt-5 text-base leading-relaxed text-slate-600">
          {liveAvailable ? (
            <>
              Choose{" "}
              <span className="font-medium text-slate-800">Import my profile</span>{" "}
              to read your own public LinkedIn profile and turn your experience,
              education, and skills into evidence. Only your public profile is
              read — no email lookup, and nothing is posted on your behalf.
            </>
          ) : (
            <>
              LinkedIn has no import API here, so the real app takes a paste or a
              data export — never scraping. In this demo, pick{" "}
              <span className="font-medium text-slate-800">Use sample profile</span>{" "}
              to see the fields we&apos;d pull in. Nothing connects to LinkedIn.
            </>
          )}
        </p>
      </div>

      <Card className="mt-8">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Choose an import method
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {methods.map((m) => {
            const Icon = m.icon;
            const active = method === m.id;
            return (
              <button
                key={m.id}
                onClick={() => {
                  setMethod(m.id);
                  setImported(false);
                  setLiveProfile(null);
                  setError(null);
                }}
                aria-pressed={active}
                className={`rounded-xl border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                  active
                    ? "border-brand-500 bg-brand-50/60 ring-1 ring-inset ring-brand-500"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${active ? "text-brand-600" : "text-slate-500"}`}
                />
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {m.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{m.hint}</p>
              </button>
            );
          })}
        </div>

        {method && method !== "sample" && method !== "live" && (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
            This method is not wired up in the demo. Choose{" "}
            <span className="font-medium text-slate-700">Use sample profile</span>{" "}
            to continue.
          </p>
        )}

        {method === "live" && !liveProfile && (
          <div className="mt-4 space-y-3">
            <label
              htmlFor="linkedin-url"
              className="block text-sm font-medium text-slate-700"
            >
              Your LinkedIn profile URL
            </label>
            <input
              id="linkedin-url"
              type="url"
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder="https://www.linkedin.com/in/your-name"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <p className="text-xs text-slate-500">
              Only your public profile is read, and no email lookup is performed.
              Imported items become evidence marked{" "}
              <span className="font-medium text-slate-600">source-backed</span> —
              LinkedIn shows what someone wrote about themselves, which is not the
              same as confirmed.
            </p>
            {error && (
              <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                {error}
              </p>
            )}
            <Button onClick={runLiveImport} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Linkedin className="h-4 w-4" />
                  Import my profile
                </>
              )}
            </Button>
          </div>
        )}

        {method === "sample" && !imported && (
          <div className="mt-4 text-center">
            <Button
              onClick={() => setImported(true)}
              aria-label="Import the sample LinkedIn profile in demo mode"
            >
              <Sparkles className="h-4 w-4" />
              Import sample profile (demo)
            </Button>
          </div>
        )}

        {showResults && (
          <div className="mt-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-semibold">
                {liveProfile ? "Imported from LinkedIn" : "Imported (demo)"}
              </span>
            </div>

            <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {importedFields.map((f) => (
                <div
                  key={f.label}
                  className="grid grid-cols-3 gap-3 px-4 py-2.5 text-sm"
                >
                  <dt className="font-medium text-slate-500">{f.label}</dt>
                  <dd className="col-span-2 text-slate-800">{f.value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
              This profile will be compared against your resume to flag any
              inconsistencies — mismatched titles, dates, or claims — before it
              becomes evidence.
            </p>
          </div>
        )}
      </Card>

      <div className="mt-8 flex items-center justify-between">
        <ButtonLink href="/onboarding/gmail" variant="ghost" size="sm">
          Back: Gmail
        </ButtonLink>
        <ButtonLink
          href="/onboarding/preferences"
          variant={showResults ? "primary" : "secondary"}
        >
          Next: Preferences
          <ArrowRight className="h-4 w-4" />
        </ButtonLink>
      </div>
    </main>
  );
}
