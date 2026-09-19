import type { GitHubProfileAnalysis } from "@/lib/types";

/**
 * Deterministic GitHub analysis for the demo candidate (Ava Chen).
 * Implements §5.15 as a cached/DEMO artifact — no live GitHub calls.
 *
 * Framing (build directive §16): this is NOT deep static code analysis. It is a
 * read of *public metadata* — repo languages, README presence/quality, and how
 * each repo maps to the target systems-software role. Every conclusion is
 * categorical and grounded in the evidence graph in demo/candidate.ts:
 *   - cachesim   -> ev_cachesim, ev_c   (C, systems, source-backed)
 *   - neural-mini-> ev_nn, ev_py        (Python, ML, source-backed)
 *   - dotfiles   -> ev_linux            (Shell, tooling, source-backed)
 * Claimed-but-unproven skills mirror ev_cpp (C++ course only) and ev_gpu
 * (CUDA interest, no shipped project).
 */

export const avechenGitHub: GitHubProfileAnalysis = {
  username: "avechen",
  summary:
    "Three public repositories back a consistent systems-and-ML story. The two " +
    "strongest — a C cache simulator and a from-scratch NumPy neural net — " +
    "directly support a systems-software internship. Signals below come from " +
    "public metadata (languages, README presence and depth, activity), not a " +
    "line-by-line code audit. Two repos would land harder with a clearer README " +
    "or a runnable demo, and two frequently-claimed skills (C++, CUDA) have no " +
    "public repo to point to yet.",
  repos: [
    {
      name: "cachesim",
      description:
        "CPU cache simulator in C modeling associativity and replacement policies.",
      language: "C",
      relevance: "strong",
      readmeQuality: "moderate",
      supportsTargetRole: true,
      recommendation:
        "Your strongest role-relevant artifact — feature it first. The README " +
        "explains what it does but not how to build/run it or what the results " +
        "mean; adding a short build section and a sample output table would let " +
        "a reviewer verify the work in under a minute.",
      suggestedAction: "improve-readme",
    },
    {
      name: "neural-mini",
      description:
        "Small neural-network training library implemented from scratch in NumPy.",
      language: "Python",
      relevance: "strong",
      readmeQuality: "moderate",
      supportsTargetRole: true,
      recommendation:
        "Solid proof of Python depth and ML fundamentals. The README describes " +
        "the API but there's nothing a reviewer can watch work — a tiny demo " +
        "(a notebook or a GIF of a training curve) would turn 'reads plausible' " +
        "into 'clearly runs'.",
      suggestedAction: "add-demo",
    },
    {
      name: "dotfiles",
      description:
        "Personal Linux/shell configuration — editor, shell, and CLI tooling.",
      language: "Shell",
      relevance: "limited",
      readmeQuality: "strong",
      supportsTargetRole: false,
      recommendation:
        "Well-documented but only weakly tied to the target role. It quietly " +
        "corroborates comfort with Linux and command-line workflows — leave it " +
        "as-is and don't lead with it.",
      suggestedAction: "leave-as-is",
    },
  ],
  skillsWithPublicProof: ["Python", "C", "Systems programming"],
  claimedSkillsLackingProof: ["C++", "CUDA"],
};
