import "server-only";
import type { AgentActivity, Campaign, Candidate } from "@/lib/types";
import {
  fetchCompanyFacts,
  fetchCompanyPosts,
  fetchTeamContacts,
} from "@/lib/harvest/network";
import { guessCompanyUrl, isLinkedInCompanyUrl } from "@/lib/harvest/urls";
import { harvestEnabled } from "@/lib/harvest/client";

/**
 * LinkedIn enrichment pass for a live campaign (integration points 2 + 3).
 *
 * This is the one place where a live campaign stops saying "Hiring manager,
 * <team>" and starts naming real, sourced people.
 *
 * FAILURE POLICY: enrichment is strictly additive and never fatal. Any error,
 * a wrong company slug, a rate limit, a timeout, returns the campaign
 * unchanged, so the user still gets the full model-built campaign with the
 * role-based network it already had. A campaign is never lost to a scraper.
 *
 * HONESTY: real contacts replace the placeholder role-based targets only when
 * we actually found some. When we find none, the model's role-based targets
 * stay, because "verify these roles yourself" is still true and strictly more
 * useful than an empty Network tab.
 */
export async function enrichWithLinkedIn(
  campaign: Campaign,
  candidate: Candidate,
): Promise<Campaign> {
  if (!harvestEnabled()) return campaign;

  const { job } = campaign;

  // Prefer a company URL the job posting already carries; otherwise guess the
  // slug from the company name. A wrong guess just returns nothing.
  const companyUrl =
    job.url && isLinkedInCompanyUrl(job.url)
      ? job.url
      : guessCompanyUrl(job.company);
  if (!companyUrl) return campaign;

  try {
    const facts = await fetchCompanyFacts({
      companyName: job.company,
      companyLinkedinUrl: companyUrl,
    });

    // Use the company's CANONICAL url once we have it, the guessed slug may
    // have redirected, and posts/employees should key off the real page.
    const resolvedUrl = facts?.linkedinUrl ?? companyUrl;

    const [posts, contacts] = await Promise.all([
      fetchCompanyPosts(resolvedUrl).catch(() => []),
      fetchTeamContacts({ candidate, job, companyLinkedinUrl: resolvedUrl }).catch(
        () => [],
      ),
    ]);

    if (!facts && posts.length === 0 && contacts.length === 0) {
      return campaign;
    }

    const activity: AgentActivity[] = [...campaign.activity];
    if (contacts.length > 0) {
      const warm = contacts.filter(
        (p) => p.warmth && p.warmth.level !== "none",
      ).length;
      activity.push({
        agent: "Team Mapper",
        message: `Found ${contacts.length} real contacts at ${job.company} from public LinkedIn profiles${
          warm > 0 ? `, ${warm} with overlapping background` : ""
        }. Employer and title are source-backed; involvement in this specific role is inferred.`,
        kind: "evidence",
        confidence: "medium",
      });
      activity.push({
        agent: "Source Verifier",
        message:
          "Shared school, employer or city is an overlap, not a confirmed connection, and reporting lines are not established. Verify before referencing any of it.",
        kind: "conflict",
        confidence: "high",
      });
    }
    if (facts) {
      activity.push({
        agent: "Company Researcher",
        message: `Pulled ${job.company}'s own LinkedIn page${
          posts.length > 0 ? ` and ${posts.length} recent posts` : ""
        }. This is the company describing itself, not independent research.`,
        kind: "action",
        confidence: "medium",
      });
    }

    return {
      ...campaign,
      // Real, sourced contacts beat role-based placeholders, but only when we
      // actually found some.
      people: contacts.length > 0 ? contacts : campaign.people,
      activity,
      harvest: {
        fetchedAt:
          facts?.provenance.fetchedAt ??
          posts[0]?.provenance.fetchedAt ??
          contacts[0]?.provenance?.fetchedAt ??
          campaign.createdAt,
        company: facts,
        companyPosts: posts.length > 0 ? posts : undefined,
      },
    };
  } catch {
    // Enrichment is a bonus, never a dependency.
    return campaign;
  }
}
