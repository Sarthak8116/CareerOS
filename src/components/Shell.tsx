"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PlusCircle,
  UserCircle2,
  Sparkles,
  GitCompare,
  KanbanSquare,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * App shell. Navigation is organised around what the product DOES: start a
 * campaign, track applications, work the task list, compare roles, keep the
 * profile current. Inside a campaign, a tab bar keeps every workspace one
 * click away instead of behind "back to campaign".
 */
const nav = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, match: ["/dashboard"] },
  { href: "/jobs", label: "New campaign", icon: PlusCircle, match: ["/jobs"], exclude: ["/jobs/compare"] },
  { href: "/tracker", label: "Tracker", icon: KanbanSquare, match: ["/tracker", "/inbox", "/campaigns"] },
  { href: "/tasks", label: "Tasks", icon: ListChecks, match: ["/tasks"] },
  { href: "/jobs/compare", label: "Compare", icon: GitCompare, match: ["/jobs/compare"] },
  { href: "/profile", label: "Profile", icon: UserCircle2, match: ["/profile", "/onboarding"] },
];

const campaignTabs = [
  { path: "", label: "Overview" },
  { path: "/intelligence", label: "Company" },
  { path: "/application", label: "Résumé & application" },
  { path: "/outreach", label: "Outreach" },
  { path: "/interview", label: "Interview" },
  { path: "/graph", label: "Graph" },
];

function isActive(pathname: string, item: (typeof nav)[number]) {
  if (item.exclude?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-glow">
        <Sparkles className="h-4 w-4" />
      </span>
      <span className="font-serif text-lg font-semibold tracking-tight">CareerOS</span>
    </Link>
  );
}

type Status = { nemotron: boolean; voice: boolean; linkedin: boolean };

/** What is actually switched on, read from the server. Not a static label. */
function CapabilityStatus() {
  const [status, setStatus] = React.useState<Status | null>(null);
  React.useEffect(() => {
    let active = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((d: Status) => active && setStatus(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const rows: { label: string; on: boolean }[] = [
    { label: "NVIDIA Nemotron", on: !!status?.nemotron },
    { label: "Voice interview", on: !!status?.voice },
    { label: "LinkedIn network", on: !!status?.linkedin },
  ];
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
      <p className="font-medium text-slate-700">Capabilities</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", row.on ? "bg-emerald-500" : "bg-slate-300")} />
            {row.label}
            <span className="ml-auto text-slate-400">{status ? (row.on ? "on" : "off") : "…"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 leading-relaxed">Everything else runs offline, with no keys.</p>
    </div>
  );
}

function CampaignTabs({ pathname }: { pathname: string }) {
  const match = /^\/campaigns\/([^/]+)/.exec(pathname);
  if (!match) return null;
  const base = `/campaigns/${match[1]}`;
  return (
    <nav aria-label="Campaign sections" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {campaignTabs.map((tab) => {
        const href = `${base}${tab.path}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.path}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "text-brand-700" : "text-slate-500 hover:text-slate-800",
            )}
          >
            {tab.label}
            {active && <span className="brand-gradient absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-backdrop min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar */}
      <aside className="hidden border-r border-slate-200/80 bg-white/80 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-16 items-center px-6">
          <Logo />
        </div>
        <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-4">
          {nav.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-gradient-to-r from-brand-50 to-violet-50 text-brand-700 ring-1 ring-inset ring-brand-100"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Icon className="h-[1.125rem] w-[1.125rem]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200/80 p-4">
          <CapabilityStatus />
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen min-w-0 flex-col">
        {/* Mobile: brand + the same navigation, scrollable */}
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center px-4">
            <Logo />
          </div>
          <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-2">
            {nav.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium",
                    active ? "brand-gradient text-white" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <CampaignTabs pathname={pathname} />
          {children}
        </main>
      </div>
    </div>
  );
}
