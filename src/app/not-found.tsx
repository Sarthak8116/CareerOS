import Link from "next/link";
import { Sparkles, ArrowLeft } from "lucide-react";
import { ButtonLink } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
        <Sparkles className="h-5 w-5" />
      </div>
      <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-brand-600">
        404
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        This page isn&apos;t part of the campaign
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        The page you&apos;re looking for may have been reset, moved, or never
        existed. Head back to Mission Control to pick up where you left off.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <ButtonLink href="/dashboard">
          <ArrowLeft className="h-4 w-4" /> Back to Mission Control
        </ButtonLink>
        <Link
          href="/"
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          Go to landing
        </Link>
      </div>
    </div>
  );
}
