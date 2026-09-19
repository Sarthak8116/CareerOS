import type { InterviewQuestion } from "@/lib/types";

/**
 * Deterministic interview question bank (build directive §5.19).
 *
 * Text-mode (P0) only. Tuned for the demo campaign — Ava Chen (systems + ML
 * undergrad) interviewing for the NVIDIA GPU Systems Software internship.
 *
 * Every question spans one of the §5.19 categories. Technical / domain / system
 * questions are specific to systems + GPU (memory hierarchy, caching,
 * concurrency, CUDA basics). Project questions reference the candidate's real
 * repos — the cache simulator (ev_cachesim) and neural-mini (ev_nn).
 *
 * `evidenceToUse` entries are "<evidenceId> — <claim>" so they double as the
 * evidence-graph reference AND a human-readable line the engine can drop into a
 * model answer without needing the Candidate at evaluation time.
 */

export const demoInterviewQuestions: InterviewQuestion[] = [
  {
    id: "iq_recruiter_walkthrough",
    category: "recruiter-screen",
    prompt:
      "Walk me through your background in two minutes and tell me why NVIDIA's GPU Systems Software team.",
    difficulty: "easy",
    answerHints: [
      "One-line identity: CS undergrad focused on systems and ML",
      "Name the two flagship projects: cache simulator and neural-mini",
      "Connect the motivation to GPU runtime and driver software",
      "State availability and that no sponsorship is required",
      "Keep it under two minutes and end on why this team specifically",
    ],
    evidenceToUse: [
      "ev_cachesim — Built a CPU cache simulator modeling associativity + replacement policies",
      "ev_nn — Implemented a small neural-network training library from scratch (NumPy)",
      "ev_gpu — Interested in GPU/parallel computing — no shipped CUDA project yet",
    ],
  },
  {
    id: "iq_behavioral_debugging",
    category: "behavioral",
    prompt:
      "Tell me about the hardest bug you have chased down. How did you approach it?",
    difficulty: "medium",
    answerHints: [
      "Use STAR: situation, task, action, result",
      "Pick a concrete low-level bug from the cache simulator or an OS assignment",
      "Describe forming a hypothesis and instrumenting to confirm it",
      "Show you reduced the problem to a minimal reproducible case",
      "Close with the fix, the verification, and what you learned",
    ],
    evidenceToUse: [
      "ev_cachesim — Built a CPU cache simulator modeling associativity + replacement policies",
      "ev_os_course — Completed Operating Systems + Computer Architecture coursework",
      "ev_linux — Comfortable with Linux, git, and command-line workflows",
    ],
  },
  {
    id: "iq_technical_memory_hierarchy",
    category: "technical",
    prompt:
      "Explain the CPU memory hierarchy. Why does cache associativity matter, and what causes a cache miss?",
    difficulty: "medium",
    answerHints: [
      "Order the hierarchy: registers, L1/L2/L3 cache, DRAM, then disk",
      "Trade-off is latency versus capacity at each level",
      "Define the three miss types: compulsory, capacity, and conflict",
      "Explain how set associativity reduces conflict misses versus direct-mapped",
      "Mention replacement policy (LRU) and spatial/temporal locality",
    ],
    evidenceToUse: [
      "ev_cachesim — Built a CPU cache simulator modeling associativity + replacement policies",
      "ev_os_course — Completed Operating Systems + Computer Architecture coursework",
    ],
  },
  {
    id: "iq_technical_concurrency",
    category: "technical",
    prompt:
      "In C, how would you make a shared counter safe across threads, and what is a data race versus a race condition?",
    difficulty: "hard",
    answerHints: [
      "A data race is unsynchronized concurrent access with at least one write",
      "Protect the counter with a mutex or use an atomic operation",
      "Explain why volatile is not a synchronization primitive",
      "Mention memory ordering and the risk of deadlock from lock ordering",
      "Note the performance cost of contention and lock granularity",
    ],
    evidenceToUse: [
      "ev_c — Systems programming in C (cache simulator, memory allocator)",
      "ev_os_course — Completed Operating Systems + Computer Architecture coursework",
    ],
  },
  {
    id: "iq_project_cachesim",
    category: "project-deep-dive",
    prompt:
      "Your cache simulator models associativity and replacement policies. Walk me through the design and one thing you would change.",
    difficulty: "medium",
    answerHints: [
      "Describe how you represented sets, ways, and tags",
      "Explain the replacement policy you implemented (e.g. LRU) and how you tracked recency",
      "Talk about how you validated correctness against expected hit/miss counts",
      "Discuss a performance or design trade-off you hit",
      "State a concrete improvement: e.g. add write-back/write-allocate or a second policy",
    ],
    evidenceToUse: [
      "ev_cachesim — Built a CPU cache simulator modeling associativity + replacement policies",
      "ev_c — Systems programming in C (cache simulator, memory allocator)",
    ],
  },
  {
    id: "iq_project_neuralmini",
    category: "project-deep-dive",
    prompt:
      "In neural-mini you wrote a training library from scratch in NumPy. How does backpropagation work in it, and where is the compute bottleneck?",
    difficulty: "medium",
    answerHints: [
      "Explain forward pass, loss, then reverse-mode gradients via the chain rule",
      "Identify matrix multiplication as the dominant cost per layer",
      "Connect that cost to why GPUs accelerate training (massive parallel matmul)",
      "Mention vectorization with NumPy instead of Python loops",
      "Name a limitation: no autograd graph, manual gradients, CPU-bound",
    ],
    evidenceToUse: [
      "ev_nn — Implemented a small neural-network training library from scratch (NumPy)",
      "ev_py — Proficient in Python (3+ years, coursework + projects)",
    ],
  },
  {
    id: "iq_system_design_profiler",
    category: "system-design",
    prompt:
      "Design a tool that samples and reports the hottest functions in a running C program with low overhead. How would you keep the overhead down?",
    difficulty: "hard",
    answerHints: [
      "Use sampling (periodic stack capture) rather than instrumenting every call",
      "Explain the overhead trade-off: sample rate versus accuracy",
      "Aggregate samples into per-function counts and build a call attribution",
      "Discuss buffering samples and writing them out off the hot path",
      "Mention symbolication and reporting the top-N with confidence about sampling error",
    ],
    evidenceToUse: [
      "ev_c — Systems programming in C (cache simulator, memory allocator)",
      "ev_linux — Comfortable with Linux, git, and command-line workflows",
    ],
  },
  {
    id: "iq_domain_cuda_gpu",
    category: "domain",
    prompt:
      "At a high level, how does the GPU execution model differ from a CPU, and what is coalesced memory access in CUDA?",
    difficulty: "hard",
    answerHints: [
      "GPUs run thousands of threads in parallel via the SIMT model (warps)",
      "Contrast with the CPU's few powerful cores optimized for latency",
      "Explain the CUDA hierarchy: threads, blocks, grids, and shared memory",
      "Coalesced access means adjacent threads read adjacent memory in one transaction",
      "Uncoalesced access serializes memory and kills throughput",
    ],
    evidenceToUse: [
      "ev_gpu — Interested in GPU/parallel computing — no shipped CUDA project yet",
      "ev_nn — Implemented a small neural-network training library from scratch (NumPy)",
    ],
  },
  {
    id: "iq_weakness_no_cuda",
    category: "weakness-challenge",
    prompt:
      "You have not shipped a CUDA project yet. Why should we bet on you for GPU systems work?",
    difficulty: "medium",
    answerHints: [
      "Acknowledge the gap honestly instead of overclaiming",
      "Show transferable systems depth: C, memory hierarchy, concurrency, OS coursework",
      "Point to fast self-directed ramp: neural-mini and the cache simulator were self-built",
      "State a concrete plan to close the gap (a small CUDA kernel port)",
      "Reframe: the fundamentals that make GPU work hard are ones you already have",
    ],
    evidenceToUse: [
      "ev_gpu — Interested in GPU/parallel computing — no shipped CUDA project yet",
      "ev_c — Systems programming in C (cache simulator, memory allocator)",
      "ev_os_course — Completed Operating Systems + Computer Architecture coursework",
    ],
  },
];
