# Provider Strategy

CareerOS is built so external services are **swappable and cost-conscious**. The app
depends only on the `CampaignProvider` interface (`src/lib/providers/ai.ts`); today a
`DemoCampaignProvider` satisfies it with zero external calls. This document describes
the intended provider hierarchy and how the abstraction keeps it flexible.

## The abstraction (built)

```ts
interface CampaignProvider {
  readonly mode: "demo" | "live";
  buildCampaign(input): Promise<Campaign>;
}
```

- **DemoCampaignProvider** — runs the rule-based engine on cached data. Deterministic,
  offline, free. This is the default from `getCampaignProvider()`.
- **LiveCampaignProvider** — *planned*. Same signature, backed by the Claude API and
  live research. Because the store, pages, and components depend only on the interface,
  switching modes touches no UI.

Live mode is intentionally unimplemented rather than stubbed with fake output, so the
app never silently presents invented "live" data.

## P0 provider hierarchy (planned, cost-conscious)

The intended live stack favors services with generous free tiers and keeps each behind
its own adapter so it can be cached, mocked, or swapped.

| Provider | Role | Tier |
|---|---|---|
| **Claude API** | Core reasoning: parsing, fit, gap-to-action, drafting | P0 |
| **Tavily** | Company / role web research | P0 |
| **GitHub** | Verify code evidence (repos, READMEs) | P0 |
| **Gmail** | Draft + send approved outreach | P0 |
| **Supabase** | Database + auth (replaces localStorage) | P0 |
| **Vercel** | Hosting / deployment | P0 |
| Apify | LinkedIn / people enrichment | Optional |
| Hunter | Email discovery | Optional |
| SerpAPI | Supplementary search | Optional |

Rationale: every P0 provider has a usable free tier and a clear single
responsibility. Optional providers are only reached for when a cheaper P0 path can't
answer, keeping per-campaign cost near zero for a hackathon / student user.

## How the abstraction keeps providers swappable

- **One seam per concern.** Campaign construction goes through `CampaignProvider`;
  future research, GitHub, and email calls each get their own narrow adapter interface
  the same way. The UI never imports a vendor SDK directly.
- **Schema-validated outputs.** Whatever a provider returns is validated against the
  Zod schemas in `types.ts` before it reaches the store or UI. A misbehaving live
  provider fails loudly instead of leaking malformed data.
- **Persistence behind functions.** `store.ts` exposes `getCampaigns`,
  `createCampaignFromJob`, `setTaskStatus`, etc. A Supabase-backed store implements the
  same signatures; callers don't change.

## Demo / cached fallback for reliability (§20)

Reliability is a first-class requirement: a live demo must never fail on stage.

- The deterministic demo path is always available and requires no keys or network.
- The planned live provider is expected to **fall back to cached / demo output** on any
  failure (rate limit, timeout, missing key) rather than erroring or fabricating.
- The seeded NVIDIA campaign and its cached people data exist precisely so the primary
  demo flow is fully reproducible offline.
