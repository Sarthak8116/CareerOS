# CareerOS

**Turn every job opportunity into a complete campaign for getting hired.**

CareerOS doesn't just help you apply. For each opportunity it researches the role,
understands your real evidence, assesses fit honestly, maps the hiring network, and
turns every gap into the single best next action — a full campaign designed to help
you win the role.

> **Status:** Foundation + first vertical slice, running in **demo mode**. Everything
> below labeled "planned" is not built yet. See [Current scope](#current-scope).

---

## What it is

A candidate has one **Career Workspace** (their profile plus an evidence graph). Each
job becomes a **Campaign** — a self-contained workspace with fit analysis, a
gap-to-action plan, a hiring-network map, a task list, and an agent-activity feed.

Two design principles run through the whole product:

- **No fake numeric precision.** There are no invented match percentages. Every
  conclusion is a categorical label — strength, confidence, trust, level — that the
  user can inspect and disagree with.
- **Evidence or it didn't happen.** Every candidate claim points to a source (resume,
  GitHub, coursework, user confirmation) and carries a trust label. The engine never
  invents experience the candidate doesn't have.

## Quickstart

```bash
npm install
npm run dev
# open http://localhost:3000
```

No sign-up, no API keys, no database. The app seeds a deterministic demo campaign into
your browser's `localStorage` on first load.

Other scripts: `npm run build`, `npm run start`, `npm run typecheck`, `npm test`.

## Demo walkthrough

1. **Landing** (`/`) — the pitch and the transformation line
   (find job → understand job → assess fit → find people → create strategy → outreach → interview).
2. **Mission Control** (`/dashboard`) — your campaigns and their readiness at a glance.
3. **Jobs** (`/jobs`) — paste or pick a role, then **Build My Campaign**.
4. **Campaign detail** (`/campaigns/[id]`) — tabs for **Overview / Fit / Network / Gaps / Tasks**.
   - *Fit* — the six categorical fit dimensions with plain-language explanations.
   - *Gaps* — each gap classified (skill gap vs. wording gap vs. evidence gap) with one concrete action.
   - *Network* — inferred hiring contacts, clearly marked as inference, with an outreach order.
   - *Tasks* — the ordered plan, each task owned by a named agent.
5. **Evidence** (`/profile/evidence`) — the candidate's evidence graph with source + trust labels.

The seeded demo is **Ava Chen** (UIUC CS undergrad) applying to an **NVIDIA Systems
Software Internship** — chosen because it produces a compelling campaign with honest,
inspectable gaps (one true skill gap: no shipped CUDA project).

## Architecture overview

```
src/
  app/                      Next.js App Router pages
    page.tsx                landing
    dashboard/              Mission Control
    jobs/                   import + Build My Campaign
    campaigns/[id]/         tabbed campaign detail
    profile/evidence/       candidate evidence graph (planned/in progress)
  components/               Shell, primitives, pills, feature components
  lib/
    types.ts                shared Zod schemas (the cross-agent contract)
    labels.ts               categorical value -> display text + styles
    store.ts                localStorage persistence + seed hydration
    providers/ai.ts         CampaignProvider interface + DemoCampaignProvider
    engine/                 rule-based analysis
      skills.ts             evidence -> skill match (categorical)
      fit.ts                six fit dimensions + readiness
      gaps.ts               gap-to-action engine
      plan.ts               task planner + agent-activity feed
    demo/                   deterministic candidate, job, and people
```

- **Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v3, Zod.
- **Persistence:** browser `localStorage`, seeded with a deterministic demo campaign.
  No database.
- **Provider abstraction:** the app depends only on the `CampaignProvider` interface.
  `DemoCampaignProvider` runs the rule-based engine end-to-end with no external calls;
  a real Claude-API provider slots in behind the same signature later with no UI change.
- **Data flow:** `candidate + job → provider.buildCampaign() → Campaign → UI`.

More detail in [`docs/architecture.md`](docs/architecture.md) and
[`docs/data-model.md`](docs/data-model.md).

## Demo mode vs. future live mode

| | Demo mode (now) | Live mode (planned) |
|---|---|---|
| Analysis | Deterministic rule-based engine | Claude API reasoning |
| Data | Cached candidate / job / people | GitHub, Gmail, LinkedIn, web research |
| Persistence | `localStorage` | Supabase (DB + auth) |
| Reliability | Always reproducible, offline | Cached fallback to demo on failure |

`getCampaignProvider()` returns the demo provider today. Live mode is intentionally
*not* faked — the provider seam is where it plugs in, so the app never silently
presents made-up "live" behavior.

## LinkedIn enrichment (HarvestAPI)

Live mode on its own cannot name real people: the model must never invent an
individual, so the hiring network is role-based targets you verify yourself.
HarvestAPI (LinkedIn actors on Apify) closes that gap with real, sourced data.

**It is off by default.** Both variables must be set, or every code path silently
falls back to existing behavior — demo mode never touches the network at all:

```bash
HARVEST_ENABLED=true
APIFY_TOKEN=apify_api_...     # server-only; never reaches the browser
```

### What it adds

| Surface | Enrichment |
|---|---|
| Onboarding → LinkedIn | Your own public profile → evidence records (no email lookup) |
| Company & Team Intelligence | The company's LinkedIn page + recent posts, as sources |
| Network tab | Real contacts at the company, title-filtered, capped at 25 |
| Opportunity graph / Network fit | Overlap-scored warmest path (`lib/engine/warmth.ts`) |
| Outreach Studio | Post-based personalization; on-demand per-contact email lookup |
| Mock Interview | `company-specific` questions grounded in the company's own posts |

### Honesty labels

The contract does not bend for live data:

- **Provenance on every record** — `source: "harvestapi"`, `fetchedAt`, and the
  LinkedIn URL, surfaced in the UI so you can always check the original.
- **A profile is sourced; the hiring process is not.** Employer and title are
  `source-backed` because LinkedIn states them. Involvement in *this* role, and
  any reporting line, are never claimed.
- **Overlap is not a connection.** A shared school, former employer, or city is
  emitted as `strong-inference` / `weak-inference` and labeled as common ground —
  never as a relationship, an introduction, or evidence you have met.
- **Emails are never "verified".** A found address is labeled
  `found + SMTP-checked, unconfirmed` — the label is a Zod literal, so a
  confident one is not representable — and is always added to the outreach
  message's *claims you must verify yourself* list.
- **Nothing auto-sends.** Email lookup only populates a draft; the existing
  two-step send confirmation is unchanged.

### Safety and cost

- `APIFY_TOKEN` is read from `process.env` in modules guarded by `server-only`,
  exactly like the Anthropic client. It is never logged and is scrubbed from
  error text.
- All scraped text (headlines, about sections, job titles, post bodies) is
  **untrusted**: it runs through the existing injection scanner
  (`lib/security/untrusted.ts`) and is fenced as `<untrusted_data>` before any
  model sees it.
- Every actor response is Zod-validated at the boundary; invalid records are
  dropped, not rendered.
- No-email mode everywhere except the explicit per-contact lookup; employees
  capped at 25 per campaign; every call cached by LinkedIn URL / company before
  it is made.
- Enrichment is additive and never fatal — a rate limit, timeout, or wrong
  company slug leaves the campaign exactly as the model built it.

## Current scope

**P0 — built (this slice):**

- Shared Zod schemas and categorical scales.
- Rule-based, provider-abstracted analysis engine: fit dimensions, gap-to-action,
  task planner, agent-activity feed.
- Deterministic demo candidate, job, and hiring network.
- UI: landing, Mission Control, Jobs import + Build My Campaign, tabbed campaign detail.
- `localStorage` persistence with idempotent seed hydration.

**P1 / P2 — planned (not built):**

- Supabase database and auth.
- Live Claude API analysis provider.
- GitHub / Gmail / LinkedIn OAuth; company web research (Tavily).
- React Flow opportunity graph, interview mode, real outreach sending.

See [`docs/product-spec.md`](docs/product-spec.md) for the full module map and
[`docs/decisions/0001-demo-first-architecture.md`](docs/decisions/0001-demo-first-architecture.md)
for why the build is demo-first.
