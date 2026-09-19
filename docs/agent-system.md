# Agent System

CareerOS uses agents in two distinct senses. Don't conflate them:

1. **Build-time swarm** — the ruflo / Claude Code agents that *built* the app.
2. **In-product agent feed** — the conceptual "campaign team" the product *shows the
   user* as it works.

## 1. Build-time swarm (how the app was made)

The codebase was built by a hierarchical ruflo swarm coordinated through Claude Code.
A lead orchestrator decomposes the Master Build Directive and delegates to named,
specialized agents that coordinate via `SendMessage` rather than shared polling.

```
Lead (orchestrator)
  ├─ researcher / architect   design schemas + engine seams
  ├─ coder (engine)           types, providers, engine/*, demo/*
  ├─ fe-dashboard             landing, Mission Control
  ├─ fe-campaign              jobs import, campaign detail tabs, evidence
  └─ docs-engineer            README + docs (this directory)
```

Conventions (see `CLAUDE.md`):

- **Named agents** — every agent has an addressable `name` so peers can message it.
- **Explicit comms** — each agent's prompt states who to message and what to send.
- **Topology** — hierarchical-mesh for anti-drift; swarm when a task spans 3+ files,
  a new feature, or cross-module work; skip the swarm for single-file edits.
- **Pipeline / fan-out / supervisor** patterns depending on whether work is
  sequential, independent, or needs ongoing coordination.

This is a development-process detail, not a runtime dependency: the shipped app has no
ruflo dependency and makes no MCP calls.

## 2. In-product agent activity feed (§7 of the directive)

Inside a campaign, the product presents its analysis as the work of a small team of
named agents. This is the `AgentActivity` feed produced by `computeActivity()` in
`src/lib/engine/plan.ts` and surfaced on the campaign Overview.

Named roles in the demo feed:

| Agent | Emits |
|---|---|
| Job Parser | parsed the listing into N structured requirements |
| Company Researcher | likely team + what the role centers on |
| Candidate Analyst | source-backed evidence found; overall role fit |
| Team Mapper | relevant people found, including the warm lead |
| Source Verifier | flags what is inferred vs. confirmed (a `conflict` line) |
| Gap Analyst | the true skill gap + the wording gap, as actions |
| Campaign Planner | the recommended sequence of next steps |

Tasks are also owned by named agents (`responsibleAgent`): Resume Strategist,
Outreach Strategist, Campaign Planner, Interview Strategist.

### Feed design rules (non-negotiable)

Each activity line has a `kind`:

- **action** — something the agent did ("Parsed the listing into 9 requirements").
- **evidence** — a finding grounded in a source, with confidence.
- **conclusion** — a judgment, with confidence.
- **conflict** — a caveat or disagreement (e.g. reporting lines are inferred, not
  confirmed).

The feed shows **what was done, what was found, and how confident** — and deliberately
**never exposes private chain-of-thought or model reasoning**. Confidence is a
categorical `Confidence` label, not a percentage. Inferences are labeled as inferences.
This mirrors the product's core honesty principle: the user should be able to inspect
and challenge every conclusion.

> In the demo, the feed is deterministic text derived from the engine's outputs. In
> live mode it would be populated from a real Claude-driven analysis via the same
> `AgentActivity` shape — so the UI is unchanged.
