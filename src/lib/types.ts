/**
 * CareerOS shared schemas (the cross-agent contract).
 *
 * This file is the ONE import path every module uses (`@/lib/types`). The
 * schemas live in three files that depend strictly forwards, so there is no
 * import cycle: core → campaign → features.
 *
 * Schema changes are ADDITIVE ONLY; types.regression.test.ts names the field
 * if one is not.
 */
export * from "@/lib/types/core";
export * from "@/lib/types/campaign";
export * from "@/lib/types/features";
