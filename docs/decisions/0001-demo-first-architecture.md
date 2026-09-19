# ADR 0001 — Demo-first architecture

- **Status:** Accepted
- **Date:** 2026-07-14
- **Context:** MLH hackathon build of CareerOS (foundation + first vertical slice)

## Context

The Master Build Directive describes an ambitious product: live Claude-driven analysis,
GitHub / Gmail / LinkedIn OAuth, company web research, a Supabase backend, and approved
outreach. Building all of that before anything is demonstrable carries real risk for a
hackathon:

- Wiring real APIs, keys, and OAuth consumes most of the time budget before there's
  anything to show.
- A live demo that depends on external services can fail on stage (rate limits, network,
  expired tokens).
- Non-deterministic model output makes the product hard to iterate on and evaluate.
- The product's credibility rests on **honesty** (evidence-backed, categorical, no
  invented data) — which is a design problem to solve first, independent of any API.

## Decision

Build the vertical slice **demo-first**:

1. **Deterministic demo data.** A fixed candidate (Ava Chen), job (NVIDIA Systems
   Software Internship), and hiring network drive a complete, reproducible campaign.
2. **Rule-based engine behind a provider interface.** All analysis (fit, gaps, tasks,
   activity) is computed by pure functions in `src/lib/engine/*`, exposed through a
   `CampaignProvider` interface. A real Claude-API provider implements the same
   interface later with no UI change.
3. **`localStorage` persistence.** Campaigns persist and reload with no database, seeded
   idempotently on first load. `store.ts` exposes the function signatures a Supabase
   store will later implement.
4. **Zod schemas as the contract.** Shared schemas define every entity and are validated
   at each boundary, so the demo engine and a future live provider must produce
   identical, well-typed shapes.
5. **No faked live mode.** `getCampaignProvider()` returns the demo provider; live mode
   is left unimplemented rather than stubbed with fabricated data.

## Consequences

**Positive**

- A working, honest, end-to-end product exists immediately and demos reliably offline.
- The provider + schema seams mean live services (Claude, Tavily, GitHub, Gmail,
  Supabase) plug in incrementally without rewriting the UI or store.
- Deterministic output makes the UX, the honesty principles, and the categorical label
  system easy to iterate and evaluate.
- Zero cost and zero secrets to run or grade.

**Negative / trade-offs**

- The rule-based engine is hand-tuned to the demo candidate/job; a pasted job gets a
  minimal parse and no curated people data until the live provider exists.
- Some directive features (auth, live research, real outreach, opportunity graph,
  interview mode) are explicitly deferred to P1/P2.
- There is a risk of the demo path and a future live path diverging — mitigated by
  keeping both behind the same `CampaignProvider` interface and Zod schemas.

## Related

- [`architecture.md`](../architecture.md) — the provider seam and data flow.
- [`provider-strategy.md`](../provider-strategy.md) — the planned live provider stack.
