"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Link2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * The shortest path into the product: paste a job link, land on the intake
 * with it filled in. Nothing is fetched here; the intake page does that after
 * the user confirms.
 */
export function QuickStart({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = React.useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    const link = url.trim();
    router.push(link ? `/jobs?link=${encodeURIComponent(link)}` : "/jobs");
  }

  return (
    <form onSubmit={go} className="card-accent flex flex-col gap-2 p-2 sm:flex-row sm:items-center">
      <label htmlFor="quick-link" className="sr-only">
        Job posting link
      </label>
      <div className="relative min-w-0 flex-1">
        <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id="quick-link"
          type="url"
          inputMode="url"
          autoFocus={autoFocus}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a job link to start a campaign"
          className="h-11 w-full rounded-xl border-0 bg-transparent pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />
      </div>
      <Button type="submit" size="lg" className="shrink-0">
        Start
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}
