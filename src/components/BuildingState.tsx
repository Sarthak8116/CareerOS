"use client";

import { Loader2 } from "lucide-react";

/* The six agents that assemble a campaign, shown while building. */
export const BUILD_AGENTS = [
  "Job Parser",
  "Company Researcher",
  "Candidate Analyst",
  "Team Mapper",
  "People Researcher",
  "Campaign Planner",
];

/**
 * Animated "agents are working" state shown while a campaign builds.
 *
 * Lifted out of /jobs so the link-intake review step can reuse it unchanged.
 * Only show this for an actual campaign build, the intake fetch is a single
 * request, and dressing it in six agent names would imply work that isn't
 * happening.
 */
export function BuildingState() {
  return (
    <div className="card-accent mt-5 overflow-hidden p-4">
      <div aria-hidden className="brand-gradient -mx-4 -mt-4 mb-4 h-1 animate-pulse" />
      <p className="flex items-center gap-2 text-sm font-medium text-brand-900">
        <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
        Agents are building your campaign…
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Agents at work">
        {BUILD_AGENTS.map((agent, i) => (
          <li
            key={agent}
            className="animate-pulse rounded-full bg-white px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            {agent}
          </li>
        ))}
      </ul>
    </div>
  );
}
