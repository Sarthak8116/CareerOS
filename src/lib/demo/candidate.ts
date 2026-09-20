import type { Candidate, Evidence } from "@/lib/types";

/**
 * Deterministic synthetic candidate (build directive §18).
 * Undergraduate CS/EE student, Python + C, one systems project, one AI
 * project, GitHub with three relevant repos. Chosen to produce a compelling
 * NVIDIA Systems Software Internship campaign with clear, honest gaps.
 *
 * Every skill/project claim carries an Evidence record with a trust label,
 * nothing here is invented beyond what a real resume/GitHub would show.
 */

const evidence: Evidence[] = [
  {
    id: "ev_py",
    claim: "Proficient in Python (3+ years, coursework + projects)",
    category: "skill",
    sourceType: "github",
    sourceReference: "github.com/avechen/neural-mini",
    strength: "strong",
    recency: "current",
    publicProof: true,
    trust: "source-backed",
  },
  {
    id: "ev_c",
    claim: "Systems programming in C (cache simulator, memory allocator)",
    category: "skill",
    sourceType: "github",
    sourceReference: "github.com/avechen/cachesim",
    strength: "moderate",
    recency: "current",
    publicProof: true,
    trust: "source-backed",
  },
  {
    id: "ev_cpp",
    claim: "C++ exposure through a semester systems course",
    category: "skill",
    sourceType: "resume",
    strength: "limited",
    recency: "recent",
    publicProof: false,
    trust: "user-provided",
  },
  {
    id: "ev_cachesim",
    claim: "Built a CPU cache simulator modeling associativity + replacement policies",
    category: "project",
    sourceType: "github",
    sourceReference: "github.com/avechen/cachesim",
    strength: "strong",
    recency: "current",
    publicProof: true,
    trust: "source-backed",
  },
  {
    id: "ev_nn",
    claim: "Implemented a small neural-network training library from scratch (NumPy)",
    category: "project",
    sourceType: "github",
    sourceReference: "github.com/avechen/neural-mini",
    strength: "moderate",
    recency: "current",
    publicProof: true,
    trust: "source-backed",
  },
  {
    id: "ev_os_course",
    claim: "Completed Operating Systems + Computer Architecture coursework",
    category: "education",
    sourceType: "resume",
    strength: "moderate",
    recency: "current",
    publicProof: false,
    trust: "user-provided",
  },
  {
    id: "ev_linux",
    claim: "Comfortable with Linux, git, and command-line workflows",
    category: "skill",
    sourceType: "github",
    strength: "moderate",
    recency: "current",
    publicProof: true,
    trust: "source-backed",
  },
  {
    id: "ev_ta",
    claim: "Teaching assistant for intro programming (2 semesters)",
    category: "leadership",
    sourceType: "resume",
    strength: "moderate",
    recency: "recent",
    publicProof: false,
    trust: "user-provided",
  },
  {
    id: "ev_gpu",
    claim: "Interested in GPU/parallel computing, no shipped CUDA project yet",
    category: "skill",
    sourceType: "user-confirmation",
    strength: "limited",
    recency: "current",
    publicProof: false,
    trust: "weak-inference",
  },
];

export const demoCandidate: Candidate = {
  id: "cand_ave",
  name: "Ava Chen",
  headline: "CS undergrad · systems + ML · seeking a 2026 SWE/systems internship",
  location: "Champaign, IL",
  university: "University of Illinois Urbana-Champaign",
  degree: "B.S. Computer Science",
  graduationYear: 2026,
  experienceLevel: "student",
  workAuthorization: "US citizen, no sponsorship required",
  targetRoles: [
    "Software Engineering Intern",
    "Systems Software Intern",
    "Machine Learning Intern",
  ],
  targetIndustries: ["Semiconductors", "AI infrastructure", "Developer tools"],
  links: {
    github: "github.com/avechen",
    linkedin: "linkedin.com/in/ava-chen-demo",
    portfolio: "avachen.dev",
  },
  evidence,
};
