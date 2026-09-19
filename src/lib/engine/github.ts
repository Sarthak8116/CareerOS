import type { Candidate, GitHubProfileAnalysis } from "@/lib/types";
import { avechenGitHub } from "@/lib/demo/github";

/**
 * §5.15 GitHub analysis engine (DEMO/cached).
 *
 * Deterministic and honest: for the demo candidate we return the hand-authored,
 * evidence-grounded analysis. For any other candidate we derive a *minimal*
 * analysis from their own fields only — we never invent repositories or
 * fabricate skill proof. With no cached repo data we can only report which
 * public skills we can and cannot corroborate.
 */

function usernameFromGitHub(url?: string): string {
  if (!url) return "unknown";
  // Accept "github.com/foo", "https://github.com/foo", or a bare handle.
  const cleaned = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  const handle = parts[0] === "github.com" ? parts[1] : parts[parts.length - 1];
  return handle || "unknown";
}

export function analyzeGitHub(candidate: Candidate): GitHubProfileAnalysis {
  const github = candidate.links.github;

  if (github && github.includes("avechen")) {
    return avechenGitHub;
  }

  const username = usernameFromGitHub(github);

  // Public proof = skills whose evidence is publicly verifiable on a source.
  const skillsWithPublicProof = candidate.evidence
    .filter((e) => e.category === "skill" && e.publicProof)
    .map((e) => e.claim);

  const claimedSkillsLackingProof = candidate.evidence
    .filter((e) => e.category === "skill" && !e.publicProof)
    .map((e) => e.claim);

  const summary = github
    ? `No cached repository analysis is available for @${username}. The signals ` +
      `below are drawn only from ${candidate.name}'s own evidence, split by ` +
      `whether each skill is backed by public proof. Connect the GitHub account ` +
      `to analyze individual repositories.`
    : `No GitHub account is linked, so no public repositories can be analyzed. ` +
      `The lists below reflect only which of ${candidate.name}'s claimed skills ` +
      `currently have public proof.`;

  return {
    username,
    summary,
    repos: [],
    skillsWithPublicProof,
    claimedSkillsLackingProof,
  };
}
