# Architecture

CareerOS is a Next.js 15 App Router app. The current slice runs entirely in the
browser: a rule-based engine produces campaigns from deterministic demo data and
persists them in `localStorage`. Every seam that will later reach an external service
is already abstracted, so those services slot in without touching the UI.

## Stack

- **Next.js 15** (App Router), **React 19**
- **TypeScript** (strict), path alias `@/*` → `src/*`
- **Tailwind CSS v3** with a `brand-*` palette
- **Zod** for all shared schemas and runtime validation
- No database, no auth, no external API calls in the current slice.

## App structure

```
src/app/
  layout.tsx              root layout + metadata
  page.tsx                landing (marketing)
  dashboard/page.tsx      Mission Control — campaign list + readiness
  jobs/page.tsx           import a job + "Build My Campaign"
  campaigns/[id]/page.tsx tabbed campaign detail (Overview/Fit/Network/Gaps/Tasks)
  profile/evidence/       candidate evidence graph (see Shell nav)

src/components/
  Shell.tsx               sidebar + app chrome (client)
  ui/primitives.tsx       Button, Pill, and shared primitives
  pills.tsx               categorical pills (Level/Confidence/Trust/Recency/Importance)
  features.tsx            landing feature blocks

src/lib/
  types.ts                shared Zod schemas — the cross-agent contract
  labels.ts               categorical value -> display text + Tailwind style
  utils.ts                cn(), slugId()
  store.ts                localStorage persistence + seed hydration
  providers/ai.ts         CampaignProvider interface + DemoCampaignProvider
  engine/
    skills.ts             evidence -> categorical skill match
    fit.ts                six fit dimensions + readiness
    gaps.ts               gap-to-action engine
    plan.ts               task planner + agent-activity feed
  demo/
    candidate.ts          Ava Chen + evidence graph
    job.ts                NVIDIA Systems Software Internship (pre-parsed)
    people.ts             cached hiring-network contacts
```

## The engine + provider abstraction

The UI never calls the engine directly. It depends on one interface:

```ts
interface CampaignProvider {
  readonly mode: "demo" | "live";
  buildCampaign(input: {
    candidate: Candidate;
    job: Job;
    createdAt: string;
  }): Promise<Campaign>;
}
```

`DemoCampaignProvider` implements it by running the rule-based engine end-to-end:

```
computeFit(candidate, job, people)   -> FitDimension[]
computeGaps(candidate, job)          -> Gap[]
computeTasks(gaps, people, job)      -> CampaignTask[]
computeActivity(...)                 -> AgentActivity[]
computeReadiness(fit)                -> Level
```

`getCampaignProvider()` returns the demo provider today. A future
`LiveCampaignProvider` (Claude API + live research) implements the same interface, so
the store, pages, and components need **zero changes** to switch modes. Live mode is
deliberately *unimplemented* rather than stubbed with fake data, so nothing silently
pretends to be live.

Each engine step is pure and deterministic:

- **skills.ts** maps a requirement's canonical `skillKey` to the candidate's supporting
  evidence and returns a categorical `Level` + `Confidence`. No invented experience.
- **fit.ts** aggregates matches into the six fit dimensions and derives readiness.
- **gaps.ts** classifies each unmet requirement (skill / wording / evidence / …) and
  emits the single best next action.
- **plan.ts** turns gaps + network into an ordered task list (each task owned by a
  named agent) and produces the agent-activity feed.

## Persistence (`store.ts`)

- Client-only; guarded by a `canPersist()` check for SSR safety.
- Storage key: `careeros:campaigns:v1`.
- On read, every stored campaign is re-validated with the Zod `Campaign` schema;
  anything that no longer matches is dropped.
- `ensureSeededCampaigns()` is idempotent — it builds the deterministic NVIDIA demo
  campaign once (via the provider) and seeds it if absent. Safe to call on every mount.
- `createCampaignFromJob(job)` builds and persists a campaign for an imported job.
- `setTaskStatus(...)` toggles task completion and persists.
- `resetToDemo()` wipes user data and re-seeds.

The same function signatures are what a Supabase-backed store will implement later.

## Data flow

```
demo/candidate.ts ─┐
                   ├─► getCampaignProvider().buildCampaign() ─► Campaign ─► localStorage
demo/job.ts  ──────┘         (runs engine/*)                        │
                                                                    ▼
                                                    pages read via store.ts ─► UI
                                                    (dashboard, campaign tabs, evidence)
```

A pasted job (`jobFromPastedText`) is parsed into a minimal `Job` and flows through the
exact same path. Only the seeded NVIDIA job (`job_nvidia_syssw`) carries curated
people data and is flagged `isDemo`; other imported jobs still get full fit + gaps +
tasks with an empty people list.
