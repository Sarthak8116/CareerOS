/**
 * LinkedIn URL helpers.
 *
 * Pure string work, safe on both server and client (the onboarding page checks
 * a URL before posting it). Validation here is a boundary guard: we only ever
 * hand linkedin.com URLs to the scraper, never an arbitrary user-supplied URL.
 */

/** Strip scheme, `www.`, query string, and trailing slashes. */
function bare(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
}

/** Is this a LinkedIn *member* profile URL (`/in/handle`)? */
export function isLinkedInProfileUrl(url: string): boolean {
  if (!url) return false;
  return /^([a-z]{2,3}\.)?linkedin\.com\/in\/[^/]+$/.test(bare(url));
}

/** Is this a LinkedIn *company* page URL (`/company/handle`)? */
export function isLinkedInCompanyUrl(url: string): boolean {
  if (!url) return false;
  return /^([a-z]{2,3}\.)?linkedin\.com\/company\/[^/]+$/.test(bare(url));
}

/** Canonical `https://www.linkedin.com/...` form, for stable cache keys. */
export function canonicalLinkedInUrl(url: string): string {
  return `https://www.${bare(url)}`;
}

/**
 * Best-effort company page URL from a company name.
 *
 * LinkedIn company slugs are usually the lowercased, hyphenated name. This is a
 * GUESS, when it is wrong the company lookup simply returns nothing and the
 * caller keeps its existing fallback, so a bad guess costs one failed call and
 * never produces wrong data.
 */
export function guessCompanyUrl(companyName: string): string | undefined {
  const slug = companyName
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return undefined;
  return `https://www.linkedin.com/company/${slug}`;
}
