import type { Job } from "@/lib/types";

/**
 * Deterministic demo job (build directive §18 preferred default):
 * NVIDIA Systems Software Internship. Pre-parsed into structured
 * requirements so the demo works with zero external calls.
 *
 * `skillKey` links each requirement to a canonical skill the fit/gap
 * engine matches candidate evidence against.
 */

export const demoJob: Job = {
  id: "job_nvidia_syssw",
  source: "cached-demo",
  url: "https://nvidia.com/careers/systems-software-intern",
  title: "Systems Software Engineering Intern",
  normalizedTitle: "Systems Software Intern",
  company: "NVIDIA",
  team: "GPU Systems Software / Driver Runtime",
  location: "Santa Clara, CA",
  remote: "onsite",
  employmentType: "internship",
  seniority: "Internship (undergraduate)",
  postedAt: "2026-06-30",
  deadline: "2026-08-15",
  sponsorship: "unclear",
  description:
    "Join NVIDIA's GPU Systems Software team to work on the runtime and driver layers that power accelerated computing. You will contribute to low-level systems software, debug across the hardware/software boundary, and help build the tooling that ships GPUs to millions of developers.",
  requirements: [
    {
      id: "req_c",
      text: "Strong programming skills in C or C++",
      kind: "minimum",
      skillKey: "c_cpp",
    },
    {
      id: "req_os",
      text: "Coursework or experience in operating systems / computer architecture",
      kind: "minimum",
      skillKey: "os_arch",
    },
    {
      id: "req_debug",
      text: "Experience debugging low-level or systems-level code",
      kind: "minimum",
      skillKey: "systems_debug",
    },
    {
      id: "req_pursuing",
      text: "Pursuing a BS/MS in CS, CE, EE or related field",
      kind: "minimum",
      skillKey: "degree",
    },
    {
      id: "req_cuda",
      text: "Familiarity with GPU programming or CUDA is a plus",
      kind: "preferred",
      skillKey: "cuda",
    },
    {
      id: "req_python",
      text: "Scripting experience (Python) for tooling and tests",
      kind: "preferred",
      skillKey: "python",
    },
    {
      id: "req_perf",
      text: "Interest in performance analysis and parallel computing",
      kind: "preferred",
      skillKey: "parallel",
    },
    {
      id: "resp_runtime",
      text: "Contribute to GPU runtime/driver systems software",
      kind: "responsibility",
    },
    {
      id: "resp_tooling",
      text: "Build and improve developer tooling and tests",
      kind: "responsibility",
    },
  ],
};

/** Every cached sample role, in the order the Jobs page shows them. */
export const demoJobs: Job[] = [demoJob];
