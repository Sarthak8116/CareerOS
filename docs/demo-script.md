# Demo Script (~3 minutes)

A tight walkthrough mapped to the routes that actually exist. Runs in demo mode — no
sign-up, no keys, no network. Start with `npm run dev` and open
`http://localhost:3000`.

> Persona: **Ava Chen**, UIUC CS undergrad, applying to an **NVIDIA Systems Software
> Internship**. The story is that CareerOS turns one job posting into a full,
> evidence-honest campaign — including one real skill gap it won't paper over.

---

### Scene 1 — The promise (0:00–0:25) · `/`

Land on the homepage. Read the headline:
*"Turn every job opportunity into a complete campaign for getting hired."*

Point at the transformation line: **find job → understand job → assess fit → find
people → create strategy → send outreach → prepare interview.** Say: "Most tools stop
at 'apply.' CareerOS runs the whole campaign." Click **Open Mission Control**.

### Scene 2 — Mission Control (0:25–0:45) · `/dashboard`

The dashboard shows the seeded NVIDIA campaign with its readiness. Note the persistent
**Demo mode** badge in the sidebar — "everything here is deterministic, no API keys."
Open the campaign.

### Scene 3 — Fit, honestly (0:45–1:25) · `/campaigns/[id]` → Fit tab

Show the six fit dimensions — Role, Evidence, Preference, Network, Urgency,
Improvement. Emphasize: **no percentages**, just labeled strength + confidence + a
plain explanation you can inspect. Call out **Evidence Fit**: the strong claims are
source-backed by GitHub repos; a couple of resume-only claims are marked
user-provided. "It's telling me not just *if* I fit, but *how provable* my fit is."

### Scene 4 — The one true gap (1:25–2:05) · Gaps tab

This is the money moment. Show the gaps, each classified and each with a single
concrete action:

- **CUDA / GPU → true-skill-gap → build a small project.** "It didn't invent CUDA
  experience I don't have. It says: ship one small CUDA exercise to turn interest into
  proof."
- **Debugging → resume-wording-gap → rewrite a bullet.** "The skill is already there in
  my cache-simulator project — it's a framing problem, so the fix is a rewrite, not a
  new project."

The point: the action fits the *cause* of each gap.

### Scene 5 — The hiring network (2:05–2:35) · Network tab

Show the mapped people: a UIUC alumnus likely on the team (warmest lead, contact
first), a possible hiring manager, and a university recruiter. Stress that inferred
relationships are **labeled as inference** — the manager is `weak-inference`, not a
confirmed reporting line. "It finds the warm path without pretending to know more than
it does."

### Scene 6 — The plan + the visible team (2:35–2:55) · Tasks / Overview tab

Show the ordered task list — each task owned by a named agent (Resume Strategist,
Outreach Strategist, Interview Strategist, Campaign Planner). Glance at the
**agent-activity feed**: actions, evidence, conclusions, and one honest *conflict* line
about inferred reporting lines — "confidence shown, reasoning kept private."

### Scene 7 — The evidence graph (2:55–3:00) · `/profile/evidence`

Close on the evidence page: every claim tied to a source with a trust label. "This is
why every conclusion held up — it all traces back to real, labeled evidence."

---

### Backup / talking points

- **Reliability:** it's fully offline and deterministic — refresh anytime, it re-seeds.
- **Import a job:** `/jobs` lets you paste any description and Build My Campaign; the
  same engine runs (curated people data is only bundled for the seeded NVIDIA role).
- **What's next:** live Claude analysis, real GitHub/Gmail/LinkedIn, and approved
  outreach — all behind the provider seam, no UI rewrite. See
  [`provider-strategy.md`](provider-strategy.md).
