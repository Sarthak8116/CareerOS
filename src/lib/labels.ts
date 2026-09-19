import type { Level, Confidence, TrustLabel, Recency } from "@/lib/types";

/**
 * Central mapping from categorical values -> display text + Tailwind styles.
 * The product deliberately uses these labels instead of invented percentages
 * (build directive §16). One place to tune the whole visual language.
 */

type Style = { text: string; className: string };

export const levelStyle: Record<Level, Style> = {
  strong: { text: "Strong", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  moderate: { text: "Moderate", className: "bg-brand-50 text-brand-700 ring-brand-600/20" },
  limited: { text: "Limited", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  none: { text: "None", className: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

export const confidenceStyle: Record<Confidence, Style> = {
  high: { text: "High confidence", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  medium: { text: "Medium confidence", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  low: { text: "Low confidence", className: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

export const trustStyle: Record<TrustLabel, Style> = {
  verified: { text: "Verified", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  "user-provided": { text: "User-provided", className: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  "source-backed": { text: "Source-backed", className: "bg-brand-50 text-brand-700 ring-brand-600/20" },
  "strong-inference": { text: "Strong inference", className: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  "weak-inference": { text: "Weak inference", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  unknown: { text: "Unknown", className: "bg-slate-100 text-slate-500 ring-slate-500/20" },
};

export const recencyStyle: Record<Recency, Style> = {
  current: { text: "Current", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  recent: { text: "Recent", className: "bg-brand-50 text-brand-700 ring-brand-600/20" },
  dated: { text: "Dated", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  unknown: { text: "Unknown", className: "bg-slate-100 text-slate-500 ring-slate-500/20" },
};

export const importanceStyle: Record<string, Style> = {
  critical: { text: "Critical", className: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  high: { text: "High", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  medium: { text: "Medium", className: "bg-brand-50 text-brand-700 ring-brand-600/20" },
  low: { text: "Low", className: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

export const gapClassificationText: Record<string, string> = {
  "true-skill-gap": "True skill gap",
  "evidence-gap": "Evidence gap",
  "resume-wording-gap": "Resume wording gap",
  "experience-gap": "Experience gap",
  "low-priority-gap": "Low-priority gap",
  "hard-blocker": "Hard blocker",
  "uncertain-gap": "Uncertain gap",
};

export const effortText: Record<string, string> = {
  quick: "Quick win",
  moderate: "Moderate effort",
  significant: "Significant effort",
};
