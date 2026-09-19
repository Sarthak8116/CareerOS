import type { IntakeAdapter } from "@/lib/intake/types";
import { greenhouseAdapter } from "@/lib/intake/adapters/greenhouse";
import { leverAdapter } from "@/lib/intake/adapters/lever";
import { ashbyAdapter } from "@/lib/intake/adapters/ashby";
import { workdayAdapter } from "@/lib/intake/adapters/workday";
import { genericAdapter } from "@/lib/intake/adapters/generic";

/**
 * Every adapter, in match order.
 *
 * `genericAdapter` MUST stay last — it matches everything, so anything after it
 * would be unreachable. The dedicated adapters match on hostname and path shape
 * only, so the order among them does not matter; the invariant is only that
 * generic is the fallback.
 */
export const ADAPTERS: readonly IntakeAdapter[] = [
  greenhouseAdapter,
  leverAdapter,
  ashbyAdapter,
  workdayAdapter,
  genericAdapter,
];

/** The first adapter that claims this URL. Never undefined — generic matches. */
export function adapterFor(url: URL): IntakeAdapter {
  return ADAPTERS.find((a) => a.matches(url)) ?? genericAdapter;
}

/** Capability list for the UI — what we can read, not what is switched on. */
export function adapterCapabilities(): { key: string; label: string }[] {
  return ADAPTERS.map((a) => ({ key: a.key, label: a.label }));
}
