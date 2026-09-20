"use client";

import Link from "next/link";
import {
  Network,
  Github,
  Library,
  Linkedin,
  Globe,
  ArrowUpRight,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import { Shell } from "@/components/Shell";
import { Card, Pill, SectionTitle } from "@/components/ui/primitives";
import { LevelPill } from "@/components/pills";
import { getProfile } from "@/lib/profileStore";
import type { Evidence, Level } from "@/lib/types";

/**
 * §13, /profile, Career Workspace overview.
 *
 * Profile "completeness" is shown CATEGORICALLY (a LevelPill) rather than as
 * an invented percentage (build directive §16).
 */

const workspaceAreas = [
  {
    href: "/profile/evidence",
    icon: Network,
    title: "Evidence Graph",
    description:
      "Every skill and project claim, traced to its source with a trust label.",
  },
  {
    href: "/profile/github",
    icon: Github,
    title: "GitHub Analysis",
    description:
      "What your public repositories actually demonstrate about your work.",
  },
  {
    href: "/profile/answers",
    icon: Library,
    title: "Answer Library",
    description:
      "Reusable, honest answers to the questions applications keep asking.",
  },
] as const;

const categoryLabels: Record<Evidence["category"], string> = {
  skill: "Skills",
  project: "Projects",
  experience: "Experience",
  education: "Education",
  achievement: "Achievements",
  leadership: "Leadership",
};

/**
 * Categorical completeness: how much of the profile is backed by public,
 * source-backed proof vs. self-reported. Deliberately coarse, no percentages.
 */
function completenessLevel(evidence: Evidence[]): { level: Level; note: string } {
  const backed = evidence.filter(
    (e) => e.trust === "source-backed" || e.trust === "verified",
  ).length;
  const ratio = evidence.length === 0 ? 0 : backed / evidence.length;
  if (ratio >= 0.6)
    return { level: "strong", note: "Most claims are backed by public proof." };
  if (ratio >= 0.35)
    return {
      level: "moderate",
      note: "A solid core is proven; some claims are self-reported.",
    };
  return {
    level: "limited",
    note: "Most claims are self-reported, add public proof to strengthen them.",
  };
}

export default function ProfilePage() {
  const c = getProfile();

  // Count evidence by category, preserving a stable display order.
  const counts = c.evidence.reduce<Partial<Record<Evidence["category"], number>>>(
    (acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const categoryOrder: Evidence["category"][] = [
    "skill",
    "project",
    "experience",
    "education",
    "achievement",
    "leadership",
  ];
  const categoryCounts = categoryOrder
    .filter((cat) => counts[cat])
    .map((cat) => ({ cat, label: categoryLabels[cat], count: counts[cat]! }));

  const completeness = completenessLevel(c.evidence);

  const links = [
    c.links.github && {
      href: `https://${c.links.github}`,
      label: c.links.github,
      icon: Github,
    },
    c.links.linkedin && {
      href: `https://${c.links.linkedin}`,
      label: "LinkedIn",
      icon: Linkedin,
    },
    c.links.portfolio && {
      href: `https://${c.links.portfolio}`,
      label: c.links.portfolio,
      icon: Globe,
    },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Github }[];

  return (
    <Shell>
      <div className="space-y-10">
        {/* Header ------------------------------------------------------- */}
        <header className="space-y-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {c.name}
            </h1>
            <p className="text-base text-slate-600">{c.headline}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4 text-slate-400" />
              {c.university} · {c.degree} · {c.graduationYear}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-slate-400" />
              {c.workAuthorization}
            </span>
          </div>

          {links.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {links.map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </a>
              ))}
            </div>
          )}
        </header>

        {/* Career Workspace -------------------------------------------- */}
        <section className="space-y-4">
          <SectionTitle>Career Workspace</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaceAreas.map(({ href, icon: Icon, title, description }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <Card className="h-full transition-colors group-hover:border-brand-200 group-hover:bg-brand-50/30">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-brand-500" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">
                    {title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    {description}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* Snapshot ----------------------------------------------------- */}
        <section className="space-y-4">
          <SectionTitle>Snapshot</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Evidence by category */}
            <Card className="lg:col-span-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Evidence
                </h3>
                <Link
                  href="/profile/evidence"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  View graph
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {c.evidence.length} tracked claims across your profile
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {categoryCounts.map(({ cat, label, count }) => (
                  <div
                    key={cat}
                    className="rounded-xl bg-slate-50 px-3 py-2.5"
                  >
                    <dt className="text-xs font-medium text-slate-500">
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
                      {count}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>

            {/* Profile completeness, categorical, not a percentage */}
            <Card>
              <h3 className="text-sm font-semibold text-slate-900">
                Profile completeness
              </h3>
              <div className="mt-3">
                <LevelPill level={completeness.level} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                {completeness.note}
              </p>
            </Card>
          </div>

          {/* Targets */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <h3 className="text-sm font-semibold text-slate-900">
                Target roles
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {c.targetRoles.map((role) => (
                  <Pill
                    key={role}
                    className="bg-brand-50 text-brand-700 ring-brand-600/20"
                  >
                    {role}
                  </Pill>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-slate-900">
                Target industries
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {c.targetIndustries.map((industry) => (
                  <Pill
                    key={industry}
                    className="bg-slate-100 text-slate-600 ring-slate-500/20"
                  >
                    {industry}
                  </Pill>
                ))}
              </div>
            </Card>
          </div>
        </section>
      </div>
    </Shell>
  );
}
