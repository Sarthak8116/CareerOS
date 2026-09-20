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

/**
 * Second demo job: a seed-stage STARTUP, the deliberate opposite of NVIDIA.
 *
 * Quillfeather AI is FICTIONAL — invented for this demo so that nothing here
 * can be mistaken for research about a real company. It exists to show the
 * same candidate reading very differently against a small team: breadth and
 * shipped work matter more, the network is three people deep, and the founder
 * is the hiring manager.
 */
export const demoStartupJob: Job = {
  id: "job_quillfeather_founding",
  source: "cached-demo",
  url: "https://quillfeather.example/careers/founding-engineer-intern",
  title: "Founding Engineer Intern, ML Infrastructure",
  normalizedTitle: "Software Engineering Intern (ML Infrastructure)",
  company: "Quillfeather AI",
  team: "Engineering (9-person company)",
  location: "San Francisco, CA",
  remote: "hybrid",
  employmentType: "internship",
  seniority: "Internship (undergraduate)",
  postedAt: "2026-07-06",
  deadline: "2026-08-01",
  sponsorship: "unclear",
  description:
    "Quillfeather AI is a seed-stage, nine-person startup building an inference-serving layer that lets small teams run open-weight models cheaply. As a founding engineer intern you will ship real features to real customers in your first two weeks: API endpoints, evaluation tooling, and the glue between our Python services and the C++ runtime underneath. There is no separate QA, platform, or DevOps team — you own what you build, end to end.",
  requirements: [
    { id: "req_py", text: "Strong Python — you will write most of your code in it", kind: "minimum", skillKey: "python" },
    { id: "req_api", text: "Experience building a backend service or REST API", kind: "minimum", skillKey: "backend_api" },
    { id: "req_ship", text: "Evidence you have shipped something real that other people used", kind: "minimum", skillKey: "shipping" },
    { id: "req_ml", text: "Working understanding of machine learning fundamentals", kind: "minimum", skillKey: "ml_basics" },
    { id: "req_degree", text: "Pursuing a BS/MS in CS or a related field", kind: "minimum", skillKey: "degree" },
    { id: "req_cxx", text: "Comfort reading C or C++ for performance-critical paths is a plus", kind: "preferred", skillKey: "c_cpp" },
    { id: "req_devops", text: "Docker, CI/CD, or cloud deployment experience is a plus", kind: "preferred", skillKey: "devops" },
    { id: "req_gpu", text: "Familiarity with GPU inference or CUDA is a plus", kind: "preferred", skillKey: "cuda" },
    { id: "req_comm", text: "Clear written communication — we are a docs-first team", kind: "preferred", skillKey: "communication" },
    { id: "resp_features", text: "Ship customer-facing API features end to end", kind: "responsibility" },
    { id: "resp_evals", text: "Build evaluation and benchmarking tooling for served models", kind: "responsibility" },
  ],
};

/** Every cached sample role, in the order the Jobs page shows them. */
export const demoJobs: Job[] = [demoJob, demoStartupJob];
