import type { Job } from "@/lib/types";
import { demoJob } from "@/lib/demo/job";

/**
 * Deterministic pool of cached internships for the Job Comparison view (§5.4).
 * The flagship NVIDIA role (demoJob) plus three contrasting internships so the
 * comparison surfaces real trade-offs. Every requirement reuses the SAME
 * canonical skillKeys as the fit engine (skills.ts) where applicable; unknown
 * skillKeys are intentional — matchSkill returns "none" for them, which is how
 * we model genuine gaps (e.g. web/backend for Stripe, robotics for Tesla).
 *
 * No external calls, no timestamps generated at runtime — all fields are baked.
 */

/** Microsoft — broad SWE internship. Plays to the candidate's core strengths
 *  (Python, C, CS degree); nothing exotic. The clean "apply-now" case. */
const microsoftJob: Job = {
  id: "job_msft_swe",
  source: "cached-demo",
  url: "https://careers.microsoft.com/students/swe-intern",
  title: "Software Engineering Intern",
  normalizedTitle: "Software Engineering Intern",
  company: "Microsoft",
  team: "Azure Core / Developer Division",
  location: "Redmond, WA",
  remote: "hybrid",
  employmentType: "internship",
  seniority: "Internship (undergraduate)",
  postedAt: "2026-06-20",
  deadline: "2026-08-30",
  sponsorship: "offered",
  description:
    "Build features across Microsoft's cloud and developer platforms. Interns own a scoped project end-to-end — design, implement, test, and ship — with a dedicated mentor. Strong generalist software engineering fundamentals matter more than any single stack.",
  requirements: [
    {
      id: "msft_req_degree",
      text: "Pursuing a BS/MS in Computer Science or related field",
      kind: "minimum",
      skillKey: "degree",
    },
    {
      id: "msft_req_prog",
      text: "Solid programming skills in one systems language (C, C++, Java)",
      kind: "minimum",
      skillKey: "c_cpp",
    },
    {
      // Interview-gated fundamental, not something we score from evidence — no skillKey.
      id: "msft_req_dsa",
      text: "Strong data structures and algorithms fundamentals",
      kind: "minimum",
    },
    {
      id: "msft_pref_python",
      text: "Comfortable scripting and automating in Python",
      kind: "preferred",
      skillKey: "python",
    },
    {
      id: "msft_pref_debug",
      text: "Debugging and problem-solving across a real codebase",
      kind: "preferred",
      skillKey: "systems_debug",
    },
    {
      id: "msft_resp_feature",
      text: "Own and ship a scoped feature end-to-end (exposure to Azure a plus)",
      kind: "responsibility",
    },
  ],
};

/** Stripe — payments/backend internship. Leans web + backend + distributed
 *  systems, which the candidate has little public evidence for. The honest
 *  "research-further" case: strong fundamentals, weak stack-specific proof. */
const stripeJob: Job = {
  id: "job_stripe_swe",
  source: "cached-demo",
  url: "https://stripe.com/jobs/swe-intern",
  title: "Software Engineer Intern",
  normalizedTitle: "Backend Software Engineer Intern",
  company: "Stripe",
  team: "Payments API / Reliability",
  location: "San Francisco, CA",
  remote: "hybrid",
  employmentType: "internship",
  seniority: "Internship (undergraduate)",
  postedAt: "2026-06-25",
  deadline: "2026-08-10",
  sponsorship: "offered",
  description:
    "Work on the APIs and services that move money for millions of businesses. You'll build backend systems where correctness, idempotency, and reliability are non-negotiable, and ship user-facing product surfaces backed by a large distributed codebase.",
  requirements: [
    {
      id: "stripe_req_degree",
      text: "Pursuing a degree in CS or equivalent experience",
      kind: "minimum",
      skillKey: "degree",
    },
    {
      id: "stripe_req_backend",
      text: "Experience building backend services / APIs",
      kind: "minimum",
      skillKey: "backend_api", // unknown -> genuine evidence gap
    },
    {
      id: "stripe_req_web",
      text: "Familiarity with web application development (HTTP, databases)",
      kind: "minimum",
      skillKey: "web_dev", // unknown -> genuine evidence gap
    },
    {
      id: "stripe_req_python",
      text: "Fluency in a dynamic language such as Python or Ruby",
      kind: "minimum",
      skillKey: "python",
    },
    {
      id: "stripe_req_db",
      text: "Working knowledge of relational databases and SQL",
      kind: "minimum",
      skillKey: "db_sql", // unknown -> genuine evidence gap
    },
    {
      id: "stripe_pref_distsys",
      text: "Understanding of distributed systems / reliability engineering",
      kind: "preferred",
      skillKey: "distributed_systems", // unknown -> stretch
    },
    {
      id: "stripe_pref_product",
      text: "Interest in product engineering and user-facing impact",
      kind: "preferred",
      skillKey: "product_eng", // unknown -> stretch
    },
    {
      id: "stripe_resp_api",
      text: "Design and ship a production API endpoint",
      kind: "responsibility",
    },
  ],
};

/** Tesla — robotics/autonomy internship. Heavy C++ + low-level debugging
 *  (which the candidate CAN evidence) plus robotics/controls domain (which
 *  they can't yet). The "build-campaign" case: real overlap + clear stretch. */
const teslaJob: Job = {
  id: "job_tesla_robotics",
  source: "cached-demo",
  url: "https://tesla.com/careers/robotics-intern",
  title: "Robotics Software Intern",
  normalizedTitle: "Robotics Software Intern",
  company: "Tesla",
  team: "Optimus / Robotics Autonomy",
  location: "Palo Alto, CA",
  remote: "onsite",
  employmentType: "internship",
  seniority: "Internship (undergraduate)",
  postedAt: "2026-07-01",
  deadline: "2026-08-05",
  sponsorship: "not-offered",
  description:
    "Join the Optimus robotics team writing the real-time software that controls physical actuators. You'll work close to the metal in C++, debug across the hardware/software boundary, and help bring up control and perception loops on real robots.",
  requirements: [
    {
      id: "tesla_req_cpp",
      text: "Strong C++ programming for real-time / embedded contexts",
      kind: "minimum",
      skillKey: "c_cpp",
    },
    {
      id: "tesla_req_debug",
      text: "Ability to debug low-level and hardware-adjacent code",
      kind: "minimum",
      skillKey: "systems_debug",
    },
    {
      id: "tesla_req_degree",
      text: "Pursuing a degree in CS, EE, ME, or Robotics",
      kind: "minimum",
      skillKey: "degree",
    },
    {
      id: "tesla_req_robotics",
      text: "Coursework or projects in robotics / control systems",
      kind: "minimum",
      skillKey: "robotics", // unknown -> true skill gap
    },
    {
      id: "tesla_pref_perception",
      text: "Exposure to perception, sensor fusion, or ROS a plus",
      kind: "preferred",
      skillKey: "perception", // unknown -> stretch
    },
    {
      id: "tesla_pref_parallel",
      text: "Interest in performance-critical parallel computing",
      kind: "preferred",
      skillKey: "parallel",
    },
    {
      id: "tesla_resp_control",
      text: "Bring up a control or perception loop on real hardware",
      kind: "responsibility",
    },
  ],
};

/** Flagship demo job first, then contrasting options. Order is deterministic. */
export const demoJobsPool: Job[] = [demoJob, microsoftJob, stripeJob, teslaJob];
