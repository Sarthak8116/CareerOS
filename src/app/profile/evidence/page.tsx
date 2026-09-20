"use client";

import Link from "next/link";
import { Github, Linkedin, Globe, GraduationCap } from "lucide-react";
import type { Evidence, EvidenceCategory } from "@/lib/types";
import { getProfile } from "@/lib/profileStore";
import { Shell } from "@/components/Shell";
import { Card, Pill, SectionTitle } from "@/components/ui/primitives";
import { EvidenceCard } from "@/components/features";

/** Category → display label + a stable render order. */
const categoryOrder: { key: EvidenceCategory; label: string }[] = [
  { key: "skill", label: "Skills" },
  { key: "project", label: "Projects" },
  { key: "experience", label: "Experience" },
  { key: "education", label: "Education" },
  { key: "achievement", label: "Achievements" },
  { key: "leadership", label: "Leadership" },
];

function groupByCategory(evidence: Evidence[]) {
  const map = new Map<EvidenceCategory, Evidence[]>();
  for (const e of evidence) {
    const list = map.get(e.category) ?? [];
    list.push(e);
    map.set(e.category, list);
  }
  return map;
}

export default function EvidencePage() {
  const c = getProfile();
  const grouped = groupByCategory(c.evidence);

  const links: { href: string; label: string; icon: typeof Github }[] = [];
  if (c.links.github) links.push({ href: c.links.github, label: c.links.github, icon: Github });
  if (c.links.linkedin) links.push({ href: c.links.linkedin, label: c.links.linkedin, icon: Linkedin });
  if (c.links.portfolio) links.push({ href: c.links.portfolio, label: c.links.portfolio, icon: Globe });

  return (
    <Shell>
      {/* Candidate header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{c.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{c.headline}</p>
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <GraduationCap className="h-4 w-4 text-slate-400" />
            {c.degree}, {c.university} · {c.graduationYear}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-500">{c.workAuthorization}</p>

        {links.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {links.map((l) => {
              const Icon = l.icon;
              const href = l.href.startsWith("http") ? l.href : `https://${l.href}`;
              return (
                <Link
                  key={l.href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20 transition-colors hover:bg-slate-200"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {l.label}
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <SectionTitle>Target roles</SectionTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.targetRoles.map((r) => (
                <Pill key={r} className="bg-brand-50 text-brand-700 ring-brand-600/20">
                  {r}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <SectionTitle>Target industries</SectionTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.targetIndustries.map((i) => (
                <Pill key={i} className="bg-slate-100 text-slate-600 ring-slate-500/20">
                  {i}
                </Pill>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Explainer */}
      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-slate-500">
        Every claim points to evidence and is labeled by strength, recency, and
        trust — nothing is invented.
      </p>

      {/* Evidence grouped by category */}
      <div className="mt-6 space-y-10">
        {categoryOrder.map(({ key, label }) => {
          const items = grouped.get(key);
          if (!items || items.length === 0) return null;
          return (
            <section key={key}>
              <div className="flex items-baseline justify-between">
                <SectionTitle>{label}</SectionTitle>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((e) => (
                  <EvidenceCard key={e.id} evidence={e} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
