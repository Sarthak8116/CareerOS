import type {
  Candidate,
  Evidence,
  Job,
  Confidence,
  ResumeRecommendation,
  ClaimFlag,
} from "@/lib/types";
import {
  BUZZWORD_TERMS,
  INVENTED_METRIC_PATTERNS,
  RESUME_SECTIONS,
} from "@/lib/demo/resume";

/**
 * Resume & Application Studio engine (§5.8).
 *
 * Two responsibilities, both strictly evidence-grounded and deterministic
 * (no Math.random, no new Date):
 *
 *  1. getResumeRecommendations — rewrite existing resume bullets so the
 *     candidate's REAL evidence is framed against the job's REQUIREMENTS.
 *     Every `suggested` line traces to an Evidence row in the candidate;
 *     nothing is invented, no metrics are added.
 *
 *  2. verifyClaims — the honesty pass. Flags risky claims (weak evidence,
 *     unsupported assertions, buzzword filler, fabricated metrics) so the
 *     candidate fixes them before an employer does.
 */

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function evidenceById(candidate: Candidate, id: string): Evidence | undefined {
  return candidate.evidence.find((e) => e.id === id);
}

function requirementText(job: Job, requirementId: string, fallback: string): string {
  return job.requirements.find((r) => r.id === requirementId)?.text ?? fallback;
}

/** Human-readable "evidenceUsed" string, with the public-proof reference. */
function citeEvidence(candidate: Candidate, ids: string[]): string {
  const parts = ids.map((id) => {
    const ev = evidenceById(candidate, id);
    if (!ev) return id;
    const ref = ev.publicProof && ev.sourceReference ? ` (${ev.sourceReference})` : "";
    return `${id}: ${ev.claim}${ref}`;
  });
  return parts.join("; ");
}

/**
 * Confidence in a rewrite = strength of the evidence behind it.
 * Public, source-backed proof → high. User-provided but consistent →
 * medium. Anything resting on weak inference → low.
 */
function confidenceFor(candidate: Candidate, ids: string[]): Confidence {
  const evidence = ids
    .map((id) => evidenceById(candidate, id))
    .filter((e): e is Evidence => Boolean(e));
  if (evidence.length === 0) return "low";
  if (evidence.some((e) => e.trust === "weak-inference" || e.trust === "unknown")) {
    return "low";
  }
  if (evidence.some((e) => e.publicProof)) return "high";
  return "medium";
}

/* ------------------------------------------------------------------ */
/* 1. Resume recommendations                                           */
/* ------------------------------------------------------------------ */

/**
 * Each recommendation is a template of (which evidence backs it, which
 * requirement it addresses, the current bullet, the stronger rewrite).
 * The `original` lines are realistic weak bullets consistent with the
 * evidence — the kind a first-draft resume actually contains.
 */
interface RecTemplate {
  id: string;
  section: string;
  requirementId: string;
  requirementFallback: string;
  evidenceIds: string[];
  original: string;
  suggested: string;
  reason: string;
}

const REC_TEMPLATES: RecTemplate[] = [
  {
    id: "rec_summary",
    section: RESUME_SECTIONS.summary,
    requirementId: "req_pursuing",
    requirementFallback: "Pursuing a BS/MS in CS, CE, EE or related field",
    evidenceIds: ["ev_cachesim", "ev_c", "ev_nn"],
    original: "CS student interested in systems and machine learning.",
    suggested:
      "CS undergrad (systems + ML) with public C systems projects — a CPU cache simulator and a memory allocator — plus a from-scratch NumPy neural-network library. Targeting a 2026 systems software internship.",
    reason:
      "Leads with concrete, publicly verifiable systems work instead of a generic interest statement, matching what a systems-software team screens for.",
  },
  {
    id: "rec_debug_cachesim",
    section: RESUME_SECTIONS.projects,
    requirementId: "req_debug",
    requirementFallback: "Experience debugging low-level or systems-level code",
    evidenceIds: ["ev_cachesim"],
    original: "Built a CPU cache simulator in C that models different cache configurations.",
    suggested:
      "Built a CPU cache simulator in C modeling set-associativity and replacement policies; debugged low-level behavior by tracing simulated cache state against expected hit/miss patterns to isolate correctness bugs.",
    reason:
      "Reframes the cache-simulator project toward low-level, systems-level debugging — the exact minimum requirement — using work the candidate has already shipped publicly.",
  },
  {
    id: "rec_c_systems",
    section: RESUME_SECTIONS.skills,
    requirementId: "req_c",
    requirementFallback: "Strong programming skills in C or C++",
    evidenceIds: ["ev_c", "ev_cachesim"],
    original: "Familiar with C from coursework.",
    suggested:
      "Systems programming in C: implemented a memory allocator and a cache simulator, working directly with pointers, manual memory management, and low-level data structures.",
    reason:
      "Replaces a passive 'familiar with' claim with the specific C systems artifacts that demonstrate the required strength; C++ is left as honest coursework-level exposure (see claim check).",
  },
  {
    id: "rec_os_arch",
    section: RESUME_SECTIONS.education,
    requirementId: "req_os",
    requirementFallback:
      "Coursework or experience in operating systems / computer architecture",
    evidenceIds: ["ev_os_course", "ev_cachesim"],
    original: "Relevant coursework: Operating Systems, Computer Architecture.",
    suggested:
      "Operating Systems and Computer Architecture coursework, applied hands-on in a from-scratch cache simulator that models associativity and replacement policies at the architecture level.",
    reason:
      "Ties the coursework claim (user-provided) to a public project that proves the concepts were actually applied, strengthening an otherwise unverifiable line.",
  },
  {
    id: "rec_python_tooling",
    section: RESUME_SECTIONS.skills,
    requirementId: "req_python",
    requirementFallback: "Scripting experience (Python) for tooling and tests",
    evidenceIds: ["ev_py", "ev_nn"],
    original: "Proficient in Python.",
    suggested:
      "Python (3+ years): built a NumPy neural-network training library from scratch, including test harnesses and gradient-checking scripts — the same tooling-and-tests work this role calls for.",
    reason:
      "Trades the vague 'proficient' label for the concrete scripting/testing evidence that maps onto the role's tooling-and-tests preference.",
  },
  {
    id: "rec_linux_tooling",
    section: RESUME_SECTIONS.skills,
    requirementId: "resp_tooling",
    requirementFallback: "Build and improve developer tooling and tests",
    evidenceIds: ["ev_linux"],
    original: "Comfortable with Linux and git.",
    suggested:
      "Daily Linux + git command-line workflows across all projects — at home in the toolchain-heavy environment developer-tooling work depends on.",
    reason:
      "Connects existing command-line fluency to the tooling responsibility so the reviewer sees relevance rather than a generic skills-list entry.",
  },
];

export function getResumeRecommendations(
  candidate: Candidate,
  job: Job,
): ResumeRecommendation[] {
  return REC_TEMPLATES.map((t) => ({
    id: t.id,
    section: t.section,
    original: t.original,
    suggested: t.suggested,
    reason: t.reason,
    requirementAddressed: requirementText(job, t.requirementId, t.requirementFallback),
    evidenceUsed: citeEvidence(candidate, t.evidenceIds),
    confidence: confidenceFor(candidate, t.evidenceIds),
    status: "pending" as const,
  }));
}

/* ------------------------------------------------------------------ */
/* 2. Claim verification (the honesty pass)                            */
/* ------------------------------------------------------------------ */

function findBuzzword(text: string): string | undefined {
  const lower = text.toLowerCase();
  return BUZZWORD_TERMS.find((term) => lower.includes(term));
}

function hasInventedMetric(text: string): boolean {
  return INVENTED_METRIC_PATTERNS.some((re) => re.test(text));
}

/**
 * Flags risky claims per §5.8. Deterministic scan over the candidate's own
 * evidence — the flags are advisory ("fix this before an employer notices"),
 * never fabrications. On honest, evidence-labelled data most claims pass:
 * that clean result is itself the point.
 */
export function verifyClaims(candidate: Candidate): ClaimFlag[] {
  const flags: ClaimFlag[] = [];

  for (const ev of candidate.evidence) {
    // Fabricated / unverifiable performance metric with no public proof.
    if (hasInventedMetric(ev.claim) && !ev.publicProof) {
      flags.push({
        id: `flag_metric_${ev.id}`,
        text: ev.claim,
        issue: "invented-metric",
        severity: "strong",
        note: "Contains a performance figure with no public benchmark or source to back it. Remove the number or link the proof — invented metrics are the fastest way to lose credibility in a screen.",
      });
      continue; // one primary flag per claim keeps the list actionable
    }

    // Unsupported: interest/aspiration presented without any shipped proof.
    if (ev.trust === "weak-inference" || ev.trust === "unknown") {
      flags.push({
        id: `flag_unsupported_${ev.id}`,
        text: ev.claim,
        issue: "unsupported",
        severity: "moderate",
        note: "No shipped artifact backs this yet — it is an interest, not a demonstrated skill. Keep it phrased as interest (as written) or close the gap with a small public project before claiming competence.",
      });
      continue;
    }

    // Weak evidence: user-provided, limited strength, nothing public.
    if (ev.trust === "user-provided" && !ev.publicProof && ev.strength === "limited") {
      flags.push({
        id: `flag_weak_${ev.id}`,
        text: ev.claim,
        issue: "weak-evidence",
        severity: "limited",
        note: "Self-reported, limited, and unverifiable publicly. Fine to keep if phrased honestly (e.g. 'coursework exposure'); do not upgrade it to a strong proficiency claim.",
      });
      continue;
    }

    // Buzzword filler: an empty intensifier the evidence could replace.
    const buzz = findBuzzword(ev.claim);
    if (buzz) {
      flags.push({
        id: `flag_buzz_${ev.id}`,
        text: ev.claim,
        issue: "vague-buzzword",
        severity: "limited",
        note: `Uses the filler word "${buzz}". Swap it for the concrete evidence you already have (projects, repos) — show the skill instead of asserting it.`,
      });
    }
  }

  return flags;
}
