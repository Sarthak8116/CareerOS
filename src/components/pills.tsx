import type { Level, Confidence, TrustLabel, Recency } from "@/lib/types";
import { Pill } from "@/components/ui/primitives";
import {
  levelStyle,
  confidenceStyle,
  trustStyle,
  recencyStyle,
  importanceStyle,
} from "@/lib/labels";

export function LevelPill({ level, label }: { level: Level; label?: string }) {
  const s = levelStyle[level];
  return <Pill className={s.className}>{label ? `${label}: ${s.text}` : s.text}</Pill>;
}

export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  const s = confidenceStyle[confidence];
  return <Pill className={s.className}>{s.text}</Pill>;
}

export function TrustPill({ trust }: { trust: TrustLabel }) {
  const s = trustStyle[trust];
  return <Pill className={s.className}>{s.text}</Pill>;
}

export function RecencyPill({ recency }: { recency: Recency }) {
  const s = recencyStyle[recency];
  return <Pill className={s.className}>{s.text}</Pill>;
}

export function ImportancePill({ importance }: { importance: string }) {
  const s = importanceStyle[importance] ?? importanceStyle.low;
  return <Pill className={s.className}>{s.text}</Pill>;
}
