import type {
  Campaign,
  CompanyIntel,
  HarvestCompanyFacts,
  Job,
  ResearchSource,
  SourcedPost,
} from "@/lib/types";
import { demoIntelByCompany } from "@/lib/demo/company";

/**
 * Company intelligence resolver (build directive §5.6).
 *
 * In DEMO MODE the researched companies are the cached ones (NVIDIA, and the
 * fictional startup Quillfeather AI) — for those we return the cached intel. For any other job we return a
 * minimal, HONEST intel object derived purely from the job's own fields, with
 * NO sources and clearly-labelled low-reliability notes. We never fabricate
 * research for a company we haven't cached.
 *
 * When live LinkedIn data is present (`harvest`), the company's own published
 * facts and recent posts are folded in as SOURCES — each with the company's
 * LinkedIn URL and the fetch time. That is a self-description, not independent
 * research, and the copy here says so. The fallback is unchanged: with no
 * harvest data this behaves exactly as it always has.
 *
 * Deterministic: no Math.random, no new Date(); output depends only on inputs.
 */
export function getCompanyIntel(
  job: Job,
  harvest?: Campaign["harvest"],
): CompanyIntel {
  const base = demoIntelByCompany[job.company] ?? genericIntel(job);
  if (!harvest?.company) return base;
  return withHarvest(base, harvest.company, harvest.companyPosts ?? []);
}

/** A LinkedIn record is a company describing ITSELF — moderate, not strong. */
const SELF_REPORTED_RELIABILITY = "moderate" as const;

/**
 * Fold the company's own LinkedIn facts into an intel object.
 *
 * Rules kept deliberately tight:
 *  - Only factual fields are merged (headcount, industries, specialities, HQ).
 *    No analysis is invented from them.
 *  - Nothing already researched is overwritten — harvest fills gaps and adds
 *    sources, so the curated NVIDIA profile keeps its hand-authored copy.
 *  - Every merged claim becomes a `ResearchSource` with the LinkedIn URL and
 *    the fetch timestamp, so the UI can attribute it.
 */
function withHarvest(
  base: CompanyIntel,
  facts: HarvestCompanyFacts,
  posts: SourcedPost[],
): CompanyIntel {
  const sources: ResearchSource[] = [...base.sources];

  const factLine = [
    facts.industries.length > 0 ? `Industries: ${facts.industries.join(", ")}` : "",
    facts.employeeCount ? `Reported headcount: ${facts.employeeCount}` : "",
    facts.headquarters ? `HQ: ${facts.headquarters}` : "",
    facts.foundedYear ? `Founded: ${facts.foundedYear}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  sources.push({
    id: "src_linkedin_company",
    url: facts.linkedinUrl,
    title: `${facts.name} — LinkedIn company page`,
    publisher: "LinkedIn (company self-description)",
    excerpt: facts.tagline ?? facts.description ?? factLine,
    reliability: SELF_REPORTED_RELIABILITY,
    retrievedAt: facts.provenance.fetchedAt,
  });

  for (const post of posts) {
    sources.push({
      id: `src_${post.id}`,
      url: post.url ?? facts.linkedinUrl,
      title: post.postedAt
        ? `${facts.name} post · ${post.postedAt}`
        : `${facts.name} — recent LinkedIn post`,
      publisher: "LinkedIn (company post)",
      excerpt: post.excerpt,
      reliability: SELF_REPORTED_RELIABILITY,
      retrievedAt: post.provenance.fetchedAt,
    });
  }

  // Only fill genuinely empty slots — never overwrite researched copy.
  const products =
    base.products.length > 0 ? base.products : facts.specialities.slice(0, 8);
  const description =
    base.sources.length > 0 || !facts.description
      ? base.description
      : `${facts.description} (The company's own LinkedIn description — self-reported, not independent research.)`;

  const risks = [
    ...base.risks,
    "LinkedIn company details and posts are the company's own self-description, not independent research. Verify anything you plan to repeat in an interview.",
  ];

  return {
    ...base,
    description,
    products,
    risks,
    sources,
    provenance: facts.provenance,
  };
}

/**
 * Build a truthful placeholder from job fields alone. Everything here is a
 * restatement of what the job posting already says — no external claims — so
 * the UI can distinguish "researched" from "not yet researched".
 */
function genericIntel(job: Job): CompanyIntel {
  const company = job.company || "This company";
  const role = job.title || "this role";

  return {
    company,
    description: `No cached research is available for ${company}. The notes below are derived only from the job posting itself and have not been verified against external sources.`,
    products: [],
    businessModel: `Not researched. The posting does not establish ${company}'s business model; confirm before relying on it.`,
    relevantOrg: job.team
      ? `Stated in the posting as: ${job.team}. Not independently verified.`
      : `The posting does not name a specific team or org for ${role}.`,
    priorities: [],
    whyRoleExists: `Unverified. Based only on the posting, ${company} is hiring for ${role}; the underlying business reason has not been researched.`,
    whatYoudWorkOn: job.description
      ? `Per the posting: ${job.description}`
      : `The posting does not describe the day-to-day work for ${role}.`,
    valuesBeyondJD: [],
    talkingPoints: [
      `Run company research for ${company} before applying — this profile is a placeholder built from the posting alone.`,
    ],
    risks: [
      `Low-confidence profile: no external sources were consulted for ${company}.`,
      `Any claim about ${company} beyond the posting text is currently unsupported.`,
    ],
    sources: [],
  };
}
