import type { Person } from "@/lib/types";

/**
 * Cached hiring-network people for the demo campaign (build directive §5.10,
 * §20 reliability). All inferred relationships are clearly labeled — nothing
 * is presented as a confirmed reporting line or recruiter ownership.
 */

export const demoPeople: Person[] = [
  {
    id: "person_alum",
    name: "Marcus Reyes",
    title: "Senior Systems Software Engineer, GPU Runtime",
    company: "NVIDIA",
    inferredRole: "Likely team member on the hiring team",
    connection: "UIUC alumnus (B.S. CS 2019) — same university as candidate",
    commonality: "Shared university + systems-course background",
    relevance: "strong",
    influence: "moderate",
    accessibility: "moderate",
    confidence: "medium",
    trust: "strong-inference",
    outreachPriority: "first",
  },
  {
    id: "person_mgr",
    name: "Priya Nandakumar",
    title: "Engineering Manager, GPU Systems Software",
    company: "NVIDIA",
    inferredRole: "Possible hiring manager for this requisition (unconfirmed)",
    connection: "Manages the GPU Systems Software org this role likely sits in",
    commonality: "Posts about systems-software hiring",
    relevance: "strong",
    influence: "strong",
    accessibility: "limited",
    confidence: "low",
    trust: "weak-inference",
    outreachPriority: "medium",
  },
  {
    id: "person_recruiter",
    name: "Dana Whitfield",
    title: "University Recruiter, Engineering",
    company: "NVIDIA",
    inferredRole: "University recruiting (internship pipeline)",
    connection: "Public posts about NVIDIA internship openings",
    commonality: "Recruits at Midwest engineering schools",
    relevance: "moderate",
    influence: "moderate",
    accessibility: "moderate",
    confidence: "medium",
    trust: "source-backed",
    outreachPriority: "high",
  },
];

/**
 * Hiring network for the fictional startup. At nine people there is no
 * recruiter and no org chart to infer: the founder hires, and one engineer
 * shares the candidate's university. All three people are invented.
 */
export const demoStartupPeople: Person[] = [
  {
    id: "person_qf_cto",
    name: "Imani Okafor",
    title: "Co-founder & CTO",
    company: "Quillfeather AI",
    inferredRole: "Hiring manager for engineering (the careers page says applications go to the CTO)",
    connection: "Named on the posting as the person who reviews engineering applications",
    commonality: "Writes publicly about inference-serving performance",
    relevance: "strong",
    influence: "strong",
    accessibility: "moderate",
    confidence: "medium",
    trust: "source-backed",
    outreachPriority: "high",
  },
  {
    id: "person_qf_alum",
    name: "Tomás Villanueva",
    title: "Founding Engineer",
    company: "Quillfeather AI",
    inferredRole: "Likely day-to-day teammate for an engineering intern",
    connection: "UIUC alumnus (B.S. CS 2022) — same university as candidate",
    commonality: "Shared university; was a course TA there as well",
    relevance: "strong",
    influence: "moderate",
    accessibility: "strong",
    confidence: "medium",
    trust: "strong-inference",
    outreachPriority: "first",
  },
  {
    id: "person_qf_ceo",
    name: "Rebecca Lindqvist",
    title: "Co-founder & CEO",
    company: "Quillfeather AI",
    inferredRole: "Final sign-off on hires at this company size (inferred, unconfirmed)",
    connection: "Posts the company's hiring announcements",
    commonality: "None identified",
    relevance: "moderate",
    influence: "strong",
    accessibility: "limited",
    confidence: "low",
    trust: "weak-inference",
    outreachPriority: "low",
  },
];

/** Curated network per cached job id. Any other job has no cached people. */
export const demoPeopleByJobId: Record<string, Person[]> = {
  job_nvidia_syssw: demoPeople,
  job_quillfeather_founding: demoStartupPeople,
};
