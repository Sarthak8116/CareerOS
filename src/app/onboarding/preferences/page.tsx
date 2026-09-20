"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Check } from "lucide-react";
import { Button, Pill } from "@/components/ui/primitives";
import { demoCandidate } from "@/lib/demo/candidate";
import { getProfile, updateProfilePreferences } from "@/lib/profileStore";

/**
 * Onboarding · Preferences, DEMO MODE.
 * Form is pre-filled from the active profile and persists the edited preference
 * fields locally. "Finish setup" returns to the dashboard without submitting
 * anything externally.
 */
const inputClass =
  "mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1";

export default function PreferencesOnboarding() {
  const router = useRouter();

  // Local-only form state, seeded from the deterministic demo candidate.
  const [targetRoles, setTargetRoles] = useState(
    demoCandidate.targetRoles.join(", "),
  );
  const [targetIndustries, setTargetIndustries] = useState(
    demoCandidate.targetIndustries.join(", "),
  );
  const [location, setLocation] = useState(demoCandidate.location);
  const [workAuthorization, setWorkAuthorization] = useState(
    demoCandidate.workAuthorization,
  );

  useEffect(() => {
    const profile = getProfile();
    setTargetRoles(profile.targetRoles.join(", "));
    setTargetIndustries(profile.targetIndustries.join(", "));
    setLocation(profile.location);
    setWorkAuthorization(profile.workAuthorization);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto w-full max-w-2xl">
        {/* Logo */}
        <Link href="/" className="mb-8 flex w-fit items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">CareerOS</span>
        </Link>

        <div className="mb-6">
          <span className="text-xs font-medium text-slate-400">Step 5 of 5</span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Set your preferences
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-base leading-relaxed text-slate-600">
            <span>Pre-filled from your sample profile, edit anything.</span>
            <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
              <Check className="h-3 w-3" />
              Demo data loaded
            </Pill>
          </p>
        </div>

        <form
          className="card space-y-5 p-6 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            updateProfilePreferences({
              targetRoles: targetRoles.split(",").map((value) => value.trim()).filter(Boolean),
              targetIndustries: targetIndustries
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              location: location.trim(),
              workAuthorization: workAuthorization.trim(),
            });
            router.push("/dashboard");
          }}
        >
          <div>
            <label
              htmlFor="targetRoles"
              className="block text-sm font-medium text-slate-700"
            >
              Target roles
            </label>
            <input
              id="targetRoles"
              type="text"
              value={targetRoles}
              onChange={(e) => setTargetRoles(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Comma-separated, the roles CareerOS builds campaigns for.
            </p>
          </div>

          <div>
            <label
              htmlFor="targetIndustries"
              className="block text-sm font-medium text-slate-700"
            >
              Target industries
            </label>
            <input
              id="targetIndustries"
              type="text"
              value={targetIndustries}
              onChange={(e) => setTargetIndustries(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Comma-separated, used to prioritize opportunities.
            </p>
          </div>

          <div>
            <label
              htmlFor="location"
              className="block text-sm font-medium text-slate-700"
            >
              Location
            </label>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="workAuthorization"
              className="block text-sm font-medium text-slate-700"
            >
              Work authorization
            </label>
            <input
              id="workAuthorization"
              type="text"
              value={workAuthorization}
              onChange={(e) => setWorkAuthorization(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <Link
              href="/onboarding"
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              ← Back to setup
            </Link>
            <Button type="submit" size="lg">
              Finish setup <Check className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
