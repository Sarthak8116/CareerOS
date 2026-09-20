import type {
  Campaign,
  Candidate,
  InterviewQuestion,
  Job,
} from "@/lib/types";
import { demoInterviewQuestions } from "@/lib/demo/interview";
import { LEVEL_RANK, matchSkill } from "@/lib/engine/skills";

/**
 * Interview Preparation engine (build directive §5.19).
 *
 * Fully DETERMINISTIC — no Math.random, no Date. Text-mode (P0) only.
 *
 *  - getInterviewQuestions() returns a category-spanning question set tailored
 *    to the candidate's real evidence and the target job. It reuses the curated
 *    demo bank (systems + GPU), lightly rewrites company/team references, and
 *    adds candidate-grounded prompts so imported profiles get useful prep too.
 *
 *  - evaluateAnswer() scores a free-text answer with a keyword-coverage
 *    heuristic over the question's answerHints, then assembles a model answer
 *    from those hints plus the evidence the candidate should have cited.
 */

/* ------------------------------------------------------------------ */
/* Question generation                                                 */
/* ------------------------------------------------------------------ */

/**
 * Return a deterministic interview set across the §5.19 categories. The
 * curated base bank is supplemented with a few prompts from the candidate's
 * actual projects and the role's first visible skill gap.
 */
export function getInterviewQuestions(
  candidate: Candidate,
  job: Job,
  /**
   * Optional live company context (the company's own recent LinkedIn posts).
   * When present, the `company-specific` questions are grounded in what the
   * company has actually been talking about, instead of generic prompts.
   * Absent in demo mode — no company-specific prompts are added.
   */
  companyContext?: Campaign["harvest"],
): InterviewQuestion[] {
  const knownEvidenceIds = new Set(candidate.evidence.map((e) => e.id));

  const questions = demoInterviewQuestions.map((q) => ({
    ...q,
    prompt: personalize(q.prompt, job),
    // Keep only evidence references the candidate actually has; missing
    // evidence stays missing rather than being borrowed from the demo.
    evidenceToUse: retainKnownEvidence(q.evidenceToUse, knownEvidenceIds),
  }));

  const candidateQuestions = candidateGroundedQuestions(candidate, job);
  const grounded = groundedCompanyQuestions(job, companyContext);
  return [...questions, ...candidateQuestions, ...grounded];
}

const MAX_CANDIDATE_QUESTIONS = 3;

/**
 * Add only prompts that can be answered from this candidate's own profile.
 * This prevents imported profiles from inheriting a demo-only project story
 * while still making prep useful before a model-backed live campaign exists.
 */
function candidateGroundedQuestions(
  candidate: Candidate,
  job: Job,
): InterviewQuestion[] {
  const questions: InterviewQuestion[] = [];
  const projects = candidate.evidence.filter((evidence) => evidence.category === "project");

  for (const [index, project] of projects.slice(0, 2).entries()) {
    questions.push({
      id: `q_candidate_project_${index + 1}`,
      category: "project-deep-dive",
      prompt:
        `Walk me through this project from your background: "${project.claim}" ` +
        "What was the hardest trade-off, and what would you improve next?",
      difficulty: "medium",
      answerHints: [
        "State the problem and your specific contribution.",
        "Explain one technical trade-off or debugging decision.",
        "Name how you verified the result instead of implying success without proof.",
        "Close with one concrete next improvement.",
      ],
      evidenceToUse: [`${project.id} — ${project.claim}`],
    });
  }

  const gapRequirement = job.requirements.find((requirement) => {
    if (!requirement.skillKey || requirement.kind === "responsibility") return false;
    return LEVEL_RANK[matchSkill(requirement.skillKey, candidate).level] < 2;
  });

  if (gapRequirement && questions.length < MAX_CANDIDATE_QUESTIONS) {
    const match = matchSkill(gapRequirement.skillKey!, candidate);
    const supportingEvidence = match.supportingEvidenceIds
      .map((id) => candidate.evidence.find((evidence) => evidence.id === id))
      .filter((evidence): evidence is Candidate["evidence"][number] => Boolean(evidence));

    questions.push({
      id: `q_gap_${gapRequirement.id}`,
      category: "weakness-challenge",
      prompt:
        `This role asks for: "${gapRequirement.text}" ` +
        "What is your honest current level, and how would you close the gap?",
      difficulty: gapRequirement.kind === "minimum" ? "hard" : "medium",
      answerHints: [
        "Acknowledge what you have not yet demonstrated without overclaiming.",
        "Connect any genuinely transferable evidence to the requirement.",
        "Give a concrete, time-bounded plan to build or verify the missing skill.",
      ],
      evidenceToUse: supportingEvidence.map((evidence) => `${evidence.id} — ${evidence.claim}`),
    });
  }

  return questions.slice(0, MAX_CANDIDATE_QUESTIONS);
}

/** How many post-grounded questions we add. Enough to be useful, not padding. */
const MAX_GROUNDED_QUESTIONS = 3;

/**
 * Build `company-specific` questions from the company's own recent posts.
 *
 * Deterministic: derived only from the passed-in posts, in their given order,
 * with stable ids. The post excerpt is already sanitized by the Harvest mapper,
 * and it is quoted here as the company's own public statement — a thing to be
 * asked about, never treated as an instruction.
 */
function groundedCompanyQuestions(
  job: Job,
  harvest?: Campaign["harvest"],
): InterviewQuestion[] {
  const posts = harvest?.companyPosts ?? [];
  if (posts.length === 0) return [];

  return posts.slice(0, MAX_GROUNDED_QUESTIONS).map((post, i) => ({
    id: `q_company_post_${i + 1}`,
    category: "company-specific" as const,
    prompt:
      `${job.company} recently posted publicly: "${post.excerpt}"\n\n` +
      `What does that suggest about their priorities, and how would your background connect to it? ` +
      `(Quoted from their public LinkedIn page — read the original before citing it in an interview.)`,
    difficulty: "medium" as const,
    answerHints: [
      "Tie the company's stated priority to something you have actually built or studied.",
      "Say plainly which part is your inference about their direction and which part they stated.",
      "Do not claim inside knowledge of their roadmap — this is a public post, nothing more.",
    ],
    evidenceToUse: [],
  }));
}

/** Swap the demo company/team references for the actual target job. */
function personalize(prompt: string, job: Job): string {
  let out = prompt;
  if (job.company && job.company !== "NVIDIA") {
    out = out.split("NVIDIA").join(job.company);
  }
  if (job.team && job.team !== "GPU Systems Software / Driver Runtime") {
    out = out.split("GPU Systems Software").join(job.team);
  }
  return out;
}

/** Drop evidence refs the candidate lacks; missing evidence stays missing. */
function retainKnownEvidence(refs: string[], knownIds: Set<string>): string[] {
  const kept = refs.filter((ref) => {
    const id = ref.split("—")[0].trim();
    return knownIds.has(id);
  });
  return kept;
}

/* ------------------------------------------------------------------ */
/* Answer evaluation                                                   */
/* ------------------------------------------------------------------ */

export interface AnswerEvaluation {
  strengths: string[];
  missing: string[];
  strongerAnswer: string;
}

// Words too generic to carry meaning in a coverage check.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "your", "you", "how", "why",
  "what", "when", "where", "into", "from", "then", "than", "over", "under",
  "about", "using", "use", "used", "one", "two", "not", "but", "are", "was",
  "were", "has", "have", "had", "its", "his", "her", "their", "them", "they",
  "would", "could", "should", "will", "can", "make", "made", "keep", "end",
  "show", "state", "name", "talk", "line", "each", "level", "versus", "via",
  "concrete", "describe", "explain", "discuss", "mention", "connect", "close",
]);

/**
 * Deterministic heuristic evaluation. A hint counts as "covered" when enough of
 * its distinctive keywords appear (case-insensitive) in the answer; short or
 * vague answers naturally cover fewer keywords and score lower.
 */
export function evaluateAnswer(
  q: InterviewQuestion,
  answer: string,
): AnswerEvaluation {
  const answerTokens = tokenize(answer);
  const answerWordCount = answer.trim().split(/\s+/).filter(Boolean).length;

  // Very short answers can't demonstrate specificity — raise the bar so a
  // one-liner isn't credited with covering a detailed hint by luck.
  const requiredRatio = answerWordCount < 20 ? 0.6 : 0.5;

  const strengths: string[] = [];
  const missing: string[] = [];

  for (const hint of q.answerHints) {
    const keywords = keywordsOf(hint);
    if (keywords.length === 0) {
      // No distinctive keywords — credit only if the whole phrase appears.
      if (answer.toLowerCase().includes(hint.toLowerCase())) strengths.push(hint);
      else missing.push(hint);
      continue;
    }
    const matched = keywords.filter((kw) => answerTokens.has(kw)).length;
    if (matched / keywords.length >= requiredRatio) strengths.push(hint);
    else missing.push(hint);
  }

  return {
    strengths,
    missing,
    strongerAnswer: buildStrongerAnswer(q),
  };
}

/** Assemble a model answer from the question's hints + evidence to cite. */
function buildStrongerAnswer(q: InterviewQuestion): string {
  const points = q.answerHints.map((h) => `- ${h}`).join("\n");
  const evidence = q.evidenceToUse.map((e) => `- ${e}`).join("\n");
  return [
    "A strong answer covers each of these points:",
    points,
    "",
    "Ground it in your actual evidence:",
    evidence,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** Lowercased set of significant word tokens (length ≥ 3, minus stopwords). */
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return new Set(words);
}

/** Distinctive keywords from a hint used to test coverage against an answer. */
function keywordsOf(hint: string): string[] {
  return Array.from(tokenize(hint));
}
