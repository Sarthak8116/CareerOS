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
