"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Shell } from "@/components/Shell";
import { AnswerLibrary } from "@/components/AnswerLibrary";

export default function AnswersPage() {
  return (
    <Shell>
      <div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          Answer library
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Reusable answers to common application questions speed up every
          application — and you always review before anything is submitted.
        </p>
      </div>

      <div className="mt-8">
        <AnswerLibrary />
      </div>
    </Shell>
  );
}
