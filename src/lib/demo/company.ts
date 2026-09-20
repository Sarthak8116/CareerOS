import type { CompanyIntel, ResearchSource } from "@/lib/types";

/**
 * Deterministic company intelligence for the demo (build directive §5.6).
 *
 * Grounded in real, well-known NVIDIA facts (accelerated computing, GPUs,
 * CUDA, data-center & AI infrastructure, driver/runtime systems software)
 * but treated entirely as CACHED research, no live calls, no invented
 * private/internal data. Reliability labels are honest: public reporting
 * and NVIDIA's own materials are strong; inferences about day-to-day intern
 * work are limited and flagged as such.
 *
 * All values are fixed strings (no Math.random, no new Date()) so the demo
 * renders identically every run. `retrievedAt` is pinned to the demo's
 * research snapshot date.
 */

const RETRIEVED_AT = "2026-07-01";

const nvidiaSources: ResearchSource[] = [
  {
    id: "src_nvidia_10k",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=NVDA&type=10-K",
    title: "NVIDIA Corporation Annual Report (Form 10-K)",
    publisher: "U.S. Securities and Exchange Commission (EDGAR)",
    excerpt:
      "NVIDIA reports two segments, Compute & Networking and Graphics, with data-center accelerated computing described as the primary growth driver. The filing repeatedly frames CUDA and the surrounding software stack as the durable moat around the GPU hardware.",
    reliability: "strong",
    retrievedAt: RETRIEVED_AT,
  },
  {
    id: "src_cuda_docs",
    url: "https://docs.nvidia.com/cuda/",
    title: "CUDA Toolkit Documentation, Programming Guide & Driver API",
    publisher: "NVIDIA Developer",
    excerpt:
      "Describes the split between the CUDA Runtime API and the lower-level Driver API, the user-mode/kernel-mode driver boundary, and how the runtime schedules kernels onto the GPU. This is the systems-software surface an intern on the driver/runtime team touches.",
    reliability: "strong",
    retrievedAt: RETRIEVED_AT,
  },
  {
    id: "src_open_gpu_kernel",
    url: "https://github.com/NVIDIA/open-gpu-kernel-modules",
    title: "NVIDIA Open GPU Kernel Modules (open-source Linux driver)",
    publisher: "NVIDIA (GitHub)",
    excerpt:
      "NVIDIA open-sourced its Linux GPU kernel-mode driver modules, exposing the resource manager (RM) and hardware-abstraction layers. The C-heavy codebase and issue tracker show the exact class of low-level, hardware/software-boundary debugging a systems-software intern does.",
    reliability: "strong",
    retrievedAt: RETRIEVED_AT,
  },
  {
    id: "src_gtc_keynote",
    url: "https://www.nvidia.com/gtc/keynote/",
    title: "GTC Keynote, Data-Center Platform & Software Roadmap",
    publisher: "NVIDIA (GTC)",
    excerpt:
      "Keynote positions NVIDIA as a full-stack platform company: GPUs plus networking (NVLink, InfiniBand/Spectrum) plus software (CUDA-X, NIM, driver/runtime). Emphasis on shipping reliable driver and runtime software to a very large installed base of developers and data centers.",
    reliability: "moderate",
    retrievedAt: RETRIEVED_AT,
  },
];

export const nvidiaIntel: CompanyIntel = {
  company: "NVIDIA",
  description:
    "NVIDIA designs GPUs and the full accelerated-computing platform around them. What began as a graphics company is now, by revenue, primarily a data-center and AI-infrastructure company: it sells the chips that train and serve modern AI, the networking that ties them together, and, critically, the CUDA software stack, drivers, and runtimes that make the hardware usable. The software layer, not just the silicon, is treated internally as the company's durable competitive advantage.",
  products: [
    "Data-center GPUs and AI accelerators (the compute behind training and inference)",
    "GeForce / RTX consumer and professional graphics GPUs",
    "CUDA and the CUDA-X software stack (libraries, compilers, runtime)",
    "GPU drivers and runtime, including the open-source Linux GPU kernel modules",
    "Networking for AI clusters (NVLink, and InfiniBand/Ethernet from the Mellanox line)",
    "DGX systems and cloud/data-center reference platforms",
  ],
  businessModel:
    "Hardware sales are the headline, but the strategy is platform lock-in: CUDA and the driver/runtime stack make NVIDIA GPUs the path of least resistance for developers, which sustains hardware demand and pricing power. Systems software is therefore a revenue-protecting investment, not a cost center, reliable drivers and runtimes are what keep the ecosystem on NVIDIA.",
  relevantOrg:
    "GPU Systems Software / Driver Runtime, the team that owns the layers between application code (CUDA) and the GPU hardware: the user-mode and kernel-mode drivers, the resource manager, the runtime scheduler, and the tests and tooling that ship them. Sits at the hardware/software boundary and works closely with both silicon/architecture teams and the CUDA platform teams.",
  priorities: [
    "Keep drivers and runtimes reliable across a massive, heterogeneous installed base of GPUs and OSes",
    "Reduce latency and overhead in the runtime path so data-center customers get full hardware utilization",
    "Support new GPU architectures in software on the same cadence as the hardware launches",
    "Invest in tooling and test automation to catch regressions before they reach millions of developers",
    "Maintain the open-source Linux kernel-module effort and its upstream/community relationships",
  ],
  whyRoleExists:
    "Every new GPU generation and every performance improvement is only real to customers once the driver and runtime expose it correctly and reliably. That work is unglamorous, hard to hire for, and never finished, so the team needs a steady pipeline of engineers who are comfortable at the hardware/software boundary. An internship is both extra hands on tooling/tests and a low-risk way to evaluate and recruit future full-time systems-software engineers.",
  whatYoudWorkOn:
    "Realistically: a scoped, well-defined slice of the driver/runtime or its tooling, for example instrumenting a runtime code path, writing or hardening tests around a driver feature, reproducing and root-causing a low-level bug across the user/kernel boundary, or improving a developer or CI tool. Expect C/C++ in the driver, Python for the test and tooling scaffolding, and a lot of time in debuggers and logs rather than greenfield feature design.",
  valuesBeyondJD: [
    "Correctness and reliability over cleverness, this code runs on millions of machines, so a subtle regression is expensive",
    "Comfort operating at the hardware/software boundary and reading code you didn't write",
    "Debugging discipline: forming hypotheses, bisecting, and reasoning from evidence rather than guessing",
    "Performance awareness, understanding where overhead comes from in a runtime/driver path",
    "Ownership of tests and tooling, not treating them as second-class work",
  ],
  talkingPoints: [
    "NVIDIA open-sourced its Linux GPU kernel-mode driver modules, referencing the resource manager (RM) layer or an actual issue from that repo shows you've looked at the real systems-software surface, not just the marketing.",
    "The CUDA Runtime API vs. Driver API split is the exact abstraction this team lives on; being able to explain what each does signals you understand where a driver/runtime intern actually operates.",
    "NVIDIA's moat is framed (including in its own 10-K) as software + ecosystem, not only silicon, connecting your interest in systems software to why that moat matters reads as commercially aware.",
    "Software has to support each new GPU architecture on the same cadence as the hardware; you can talk about why driver/runtime work is on the critical path of every launch.",
    "Full-stack platform story (GPU + NVLink/InfiniBand networking + CUDA-X) explains why the runtime has to be reliable at data-center scale, not just on one card.",
  ],
  risks: [
    "Intern impact is often confined to a narrow, well-bounded task; the driver/runtime codebase is large and mature, so ramp-up and reading existing code can eat much of the term.",
    "Systems-software work is debugging-heavy and can be slow and frustrating; candidates expecting fast-moving feature/product work may be a poor fit.",
    "The domain assumes real OS/architecture fundamentals, without them the low-level debugging expectation is a genuine hurdle, not just a 'plus'.",
    "Onsite in Santa Clara with unclear sponsorship (per the posting), location and work-authorization constraints are real gating factors to confirm early.",
    "It's a highly competitive, high-prestige internship; strong fundamentals alone may not differentiate without concrete systems/debugging evidence.",
  ],
  sources: nvidiaSources,
};

/** Cached intel per company name. Anything else gets honest generic intel. */
export const demoIntelByCompany: Record<string, CompanyIntel> = {
  NVIDIA: nvidiaIntel,
};
