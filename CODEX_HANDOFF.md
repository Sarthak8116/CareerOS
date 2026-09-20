# CareerOS, Handoff

**For:** an agent picking this up cold (Codex or otherwise)
**Written:** 2026-09-19
**Last commit:** `e99f1b4`: *Replace Claude with NVIDIA Nemotron across the whole live path*
**Gate at that commit:** typecheck clean · `next build` exit 0 · **534 tests passing across 41 files**
*(That is the count **at `e99f1b4`**, not today's, tests landed after it. Run the gate for the
current number; at the time of writing it was 558 across 43 files, with P3 still uncommitted.)*

> There is **uncommitted work in the tree** when this was written (phase P3, in progress).
> `git status` before you touch anything. See [§8](#8-what-is-in-flight-right-now).

---

## 1. What the product is

CareerOS turns **one job opportunity into a complete campaign for getting hired** not a résumé
tweaker and not a job board. You give it a job (a link, a paste, or the bundled sample) and it
produces: a fit analysis, a gap-to-action plan, a tailored application package, an outreach network,
and interview prep, all of it traceable back to evidence the user actually has.

The product's central promise is **honesty under pressure**. Every claim carries a trust label and
an evidence citation. This is not decoration; it is the thing that makes the output usable. Most of
the hard bugs found in this codebase were honesty bugs, not crashes, output that was confidently
*about the wrong person*, or that treated a page nobody read as proof something was absent.

### Two modes

| | **Demo mode** | **Live mode** |
|---|---|---|
| Entry | `/jobs` → "Build My Campaign" | `/jobs/live` |
| Data | bundled fixtures (`src/lib/demo/*`) | the user's real résumé + a real posting |
| Compute | pure deterministic engines (`src/lib/engine/*`) | NVIDIA Nemotron (`src/lib/live/*`) |
| Network | **none, fully offline** | NVIDIA API, optional Apify |
| Keys | none | `NVIDIA_API_KEY_*` |

**Demo mode must stay fully offline.** It is the hackathon demo path and the fallback when anything
else breaks. If you find yourself adding a network call reachable from demo mode, you have taken a
wrong turn.

---

## 2. Stack and commands

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v3 · Zod 3.24 · Vitest ·
React Flow (`@xyflow/react`) · `pdfjs-dist` (client-side résumé rasterization) · `jszip` (export)

```bash
npm install          # plain install, no --legacy-peer-deps needed any more
npm run dev
npm run typecheck    # tsc --noEmit
npm run build        # next build
npm test             # vitest run
```

**The gate is all three:** `npm run typecheck && npm run build && npm test`. Do not commit on a red
gate. (This was violated once, at `82c648f`, and it cost more than waiting would have.)

> ⚠️ **Concurrent builds.** Two agents running `next build` over the same `.next` will tear it and
> produce failures that look completely real, `ENOENT` on `build-manifest.json`, or
> `Cannot find module for page: /api/...` for a route nobody touched. Roughly twenty minutes were
> lost to exactly this. `next.config.mjs` reads `distDir: process.env.NEXT_DIST_DIR || ".next"`, so
> set `NEXT_DIST_DIR=.next-<yourname>` to build in isolation. Unset, behaviour is unchanged, and
> `/.next-*/` is gitignored.
>
> Side effect to know about: building with a custom `distDir` makes Next.js **rewrite
> `tsconfig.json`** it appends your private dist dir to `include` and reformats the whole file.
> That is build-tool churn, not a real change. **Do not commit it** (`git checkout -- tsconfig.json`).

---

## 3. Architecture, the four rules that actually matter

### 3.1 Zod is the contract between modules
`src/lib/types.ts` holds the schemas. Everything crossing a boundary is parsed, not cast.
`src/lib/types.regression.test.ts` **fails loudly and names the field** if a schema change is not
additive. Schema changes are additive only. This is not a style preference, the store validates
every persisted campaign on read and silently drops anything that no longer matches, so a
non-additive change deletes user data.

### 3.2 Engines are pure
`src/lib/engine/*`: no `Date`, no `Math.random`, no network, no I/O. They take fetched data as
plain input and return plain output. This is what makes demo mode deterministic and the tests
meaningful. Fetching belongs in `lib/intake/*`, `lib/live/*`, or `lib/harvest/*`.

### 3.3 Untrusted text is fenced, always
Any text that came from outside, a scraped page, a pasted posting, a LinkedIn profile, even the
user's own résumé transcript, goes through `sanitizeUntrusted()` (`src/lib/security/untrusted.ts`)
and reaches a model only inside an `<untrusted_data>` fence.

**Trusted instructions go in the `task` string, never inside the fence.** There is a live example of
why in `src/lib/live/campaign.ts`: the note about which résumé pages were unreadable must be an
instruction, because if it went inside the fence a page nobody saw could silently be read as a
skills gap.

`detectInjection` scans both the raw text **and** its entity-decoded form, `&#73;gnore previous…`
raised zero flags before that was fixed (`9165c0e`).

### 3.4 Categorical labels, never invented numbers
`strong / moderate / limited / none`, `high / medium / low`. No fabricated percentages, no "87%
match". Every model prompt in `lib/live/*` repeats this rule (the `HONESTY` block in `campaign.ts`).

### Honesty rules with specific wording
- Emails from Harvest are **"found + SMTP-checked, unconfirmed"** never "verified".
- Overlap-derived relationships are labeled as **inference**, never as fact.
- Keyword coverage says **"matches every keyword and requirement the job lists"** never
  "passes the ATS". Text overlap is observable; ATS behaviour is not.
- Nothing auto-sends. Ever.

---

## 4. The live path, NVIDIA Nemotron

Four models, each doing the job it is actually built for. Entry point:
`buildLiveCampaign()` in `src/lib/live/campaign.ts`. Client: `src/lib/live/nemotron.ts`
(OpenAI-compatible, `https://integrate.api.nvidia.com/v1/chat/completions`).

| Step | Model | Constant | Why |
|---|---|---|---|
| Read résumé pages | `nemotron-parse` |, | document/OCR model, takes page images |
| Read pages when PARSE fails | `nemotron-3-nano` (omni) | `PAGE_READER_FALLBACK` | **must be multimodal** |
| Shape transcript → evidence graph | `nemotron-3-super` | `RESUME_SHAPER` | most honesty-critical structure in the app |
| Parse job posting | `nemotron-3.5-lightning` | inline `"lightning"` | fast, structured |
| Campaign analysis | `nemotron-3-super` | inline `"super"` | reasoning |
| Cover letter | `nemotron-3-super` | in `lib/package/live.ts` | user's explicit choice |

### Things that will bite you here

**Reasoning suppression is mandatory and takes two flags.** Nemotron reasoning models emit
chain-of-thought prose that destroys JSON parsing. Measured: **0.6s with both flags vs 11.9s of
prose without.**
```ts
if (opts.role !== "parse") payload.chat_template_kwargs = { thinking: false };
if (opts.json)             payload.response_format   = { type: "json_object" };
```
`parse` is excluded because it is not a chat model and rejects the kwarg.

**PARSE cannot be given a JSON Schema.** It rejects text input entirely, measured, not assumed.
That is *why* the résumé path is two calls (PARSE reads → SUPER shapes) instead of one. A previous
contract draft assigned PARSE to the schema'd "candidate" call site; it would have failed every
time. Do not re-merge those steps.

**PDFs are rasterized in the browser**, by `pdfjs-dist` (`src/lib/resume/rasterize.ts`), and only
page *images* are sent. This is deliberate: **the user's PDF never leaves their machine.** The route
(`src/app/api/campaign/route.ts`) verifies PNG magic bytes per page and derives `truncated` from
`pages.length < totalPages` rather than trusting the client's flag.

**Keys.** Four separate env vars, each read as a **literal** `process.env.NVIDIA_API_KEY_X`
expression, never a computed name. Next.js can only see the literal form statically, and
`src/lib/live/keySafety.test.ts` can only prove the literal form is safe. Every module touching a
key has `import "server-only"` on line 1. Keys are never logged, never hardcoded, never in a client
URL, and `scrub()` redacts them from any error text (there is a canary round-trip test proving
`scrub` actually works).

```
NVIDIA_API_KEY_PARSE
NVIDIA_API_KEY_NANO
NVIDIA_API_KEY_SUPER
NVIDIA_API_KEY_LIGHTNING
NVIDIA_API_KEY            # fallback when a per-model key is unset
```

### ⚠️ Verification status, read this before claiming live mode works
The four keys were verified **at the API level**: the account lists 82 models and all four targets
are present; Lightning's latency was measured directly. **A full `buildLiveCampaign()` run has never
been executed end to end.** The unit tests use fixtures (`src/lib/live/__fixtures__/`), not the
network. Treat "live mode works" as **unproven**, and say so, until someone runs it.

Related and still unmeasured: whether NANO's reasoning suppression holds during plain-text page
transcription (flagged by the tester, never measured).

---

## 5. Optional: HarvestAPI (LinkedIn via Apify)

`src/lib/harvest/*`. **Off by default** requires **both** `HARVEST_ENABLED=true` **and**
`APIFY_TOKEN`. When off, every caller falls back silently and demo mode never touches the module.

Its one job: replace live mode's role-based placeholder network ("Hiring manager, Platform") with
**real, sourced people**. Failure inside enrichment leaves the campaign exactly as assembled, it
can never take the campaign down.

Four facts learned from the live API that the published docs get wrong. **Do not "tidy" these.**

1. `EMPLOYEE_SCRAPER_MODE` must be the exact string `"Full ($8 per 1k)"`. The docs write
   `"$8 per 1000"`; the actor validates against a fixed enum and 400s on anything else.
2. **"Full", not "Short"** the warmth engine scores on `experience[]` and `education[]`, which
   short mode does not return.
3. The API returns **`null`**, not absent, for empty fields. 73 `.optional()` had to become
   `.nullish()`. `industries` is a string-or-object union.
4. `endDate: { text: "Present" }` means the role is **current**, not ended. `isCurrentRole()`
   handles this.

Cost cap: `MAX_EMPLOYEES_PER_CAMPAIGN = 25` ≈ $0.20/campaign.

Warmth scoring (`src/lib/engine/warmth.ts`) is a pure overlap scorer, and **every signal it produces
carries an inference trust label** shared employer is not a relationship.

---

## 6. Phase status

### ✅ Done and committed

| Phase | What shipped | Commit |
|---|---|---|
| **P0** | **Profile store.** `src/lib/profileStore.ts`. Source-authority ladder (`user-confirmation` > `resume` > `github` > `linkedin`) so an import can never overwrite something the user confirmed. `getProfile()` falls back to `demoCandidate`, so demo mode is unchanged. | `08fb843` |
| **P1** | **Job-link intake.** Paste a URL → campaign. Adapters for Greenhouse, Lever, Ashby, Workday + generic. SSRF-hardened fetch. `ParsedJobReview` makes the user confirm anything guessed. | `798fff9`…`8f42f4b` |
| **P2** | **Application package.** Résumé doc, cover letter, short answers, claim verification, filenames, zip export, review UI. | `03c7cf1`…`89ed1ed` |
| **P2.5** | **Nemotron swap.** Claude removed from `src/` entirely; `lib/live/anthropic.ts` deleted. | `e99f1b4` |

**P0's bug is worth understanding**, because the same class of bug recurs: `createCampaignFromJob`
passed `demoCandidate` to the provider. A real user's campaign analysed *someone else's* evidence
and presented the result as being about them. Not a cosmetic mix-up, the product's central promise
inverted. **P3 exists because a second instance of that same bug is still live.**

### 🔨 In progress, P3

**Résumé tailoring + keyword/requirement coverage + persist accept/reject.** Frozen contract lives
in ruflo memory at `careeros/contract/p3-tailoring-keywords`. Reproduced in [§9](#9-p3-frozen-contract).

**This phase is a correctness fix, not an enhancement.** `getResumeRecommendations`
(`src/lib/engine/resume.ts`) returns a hardcoded `REC_TEMPLATES` bank whose prose is keyed to the
**demo candidate's evidence ids**. `citeEvidence` degrades **silently** to raw ids for anybody else
it does not throw, it produces confident sentences about a different person. It is actively wrong
for every real user today.

Three scoped items:
1. **De-hardcode `getResumeRecommendations`** generate per-job from the candidate's own evidence
   graph. Keep the existing `ResumeRecommendation` schema; it is already right.
2. **`src/lib/engine/keywords.ts`** new pure engine. Per requirement:
   `covered / partially-covered / missing`, plus *which* evidence covers it. **Three states, not
   two**: "present but weakly worded" is what feeds the resume-wording-gap classification in
   `gaps.ts`, and collapsing it into "covered" loses the product's most actionable output. Reuse
   `matchSkill` from `engine/skills.ts`.
3. **Persist accept/reject** through the store. Today `ResumeStudio`'s accept/reject is per-render
   and evaporates.

**The test that matters:** generate recommendations for a candidate whose evidence ids share **no
overlap** with the demo's, and assert every citation resolves to *their own* evidence. A test using
the demo candidate cannot detect this bug, which is exactly why it survived this long.

### 📋 Not started

These are **planned scope, not frozen contracts.** Freeze each one before writing code.

| Phase | Intent |
|---|---|
| **P4** | **Style memory.** Learn the user's voice from accept/reject history (which P3 persists) so later drafts sound like them. Explicitly out of P3's scope. |
| **P5** | **AI project booster.** Turn a gap into a concrete, buildable project proposal that would close it. |
| **P6** | **Outreach completion.** Connections.csv import, project links in messages, Gmail send. **Nothing auto-sends** the user presses send. |
| **P7** | **Interview depth.** Expand `MockInterview` beyond the current question bank. |
| **P8** | **Cleanup.** See [§7](#7-known-open-items). |

---

## 7. Known open items

> Latest pass: navigation is feature-centred (Home, New campaign, Tracker, Tasks, Compare, Profile)
> with a tab bar inside each campaign; `/tracker` replaces the mock inbox in the nav; mock sign-in,
> sign-up and Gmail-connect routes redirect. An amazon.jobs adapter and a Nemotron page-reader
> fallback were added to intake. The spoken mock interview (ElevenLabs TTS + Scribe, graded by
> Super) was verified live. The live campaign path was exercised against the real API and hardened
> (capacity retries, Lightning fast-fail with Super fallback, enum repair, overall 270s budget), but
> **a fully green end-to-end live campaign has still not been observed**: NVIDIA's shared endpoints
> were returning 503 "overloaded" during testing. There are no em dashes left in the project except
> one inside a regex that matches dashes in third-party postings.

> Updated after P4–P7: style memory, project booster, Connections.csv matching (browser-side),
> persona-neutral outreach, Gmail hand-off (opens the user's own compose window, never sends), and
> requirement-driven interview prep are all committed. `types.ts` is now a barrel over
> `types/core → campaign → features`. No source file exceeds 500 lines. Still open: the items below,
> plus **no live `buildLiveCampaign()` run has happened** and the pdf.js worker has never been watched
> running in a real browser.

None of these block P3.

| Item | Detail |
|---|---|
| ~13 files still use `demoCandidate` | Where they should call `getProfile()`. **Audit these against P0's bug class** each one is a potential "confident output about the wrong person". |
| Stale doc comment | `src/lib/package/guards.test.ts:13`. |
| Unmeasured | Live cover-letter unsupported-claim rate. NANO reasoning suppression during plain-text transcription. |

---

## 8. What is in flight right now

Uncommitted at the time of writing (P3, mid-implementation by an agent named `coder-p3`):

```
 M src/app/campaigns/[id]/application/page.tsx
 M src/components/ResumeStudio.tsx
 M src/lib/demo/resume.ts
 M src/lib/engine/resume.ts
 M src/lib/engine/skills.ts
 M src/lib/live/campaign.ts          # doc-comment fix only (nano → super)
 M src/lib/live/keySafety.test.ts
 M src/lib/store.ts
 M src/lib/types.ts
?? src/lib/engine/keywords.ts        # new, ~211 lines
```

**Run the full gate before you trust any of it.** It had not been verified when this was written.
If the gate is red and you cannot quickly see why, `git stash` is a legitimate reset, everything
through P2.5 is committed and green at `e99f1b4`.

---

## 9. P3 frozen contract

Verbatim, for the agent that finishes it.

> **SCOPE, three things, no more:**
>
> 1. **De-hardcode `getResumeRecommendations`.** Generate per-job from the candidate's OWN evidence
>    graph and the job's requirements. Keep the existing `ResumeRecommendation` schema
>    (`section/original/suggested/reason/requirementAddressed/evidenceUsed/confidence/status`), it
>    is already right. Every suggestion must cite a real evidence id belonging to THIS candidate.
>    **If no evidence supports a rewrite, emit no rewrite; an empty list is an honest answer.**
> 2. **Keyword + requirement coverage** new pure engine, `src/lib/engine/keywords.ts`. Per
>    requirement: covered / partially-covered / missing, plus WHICH evidence covers it. Reuse
>    `matchSkill` from `engine/skills.ts` rather than reimplementing matching.
> 3. **Persist accept/reject.** Persist through the store layer so "you approve or deny each one" is
>    true. Do NOT build style learning from it, that is P4.
>
> **HARD RULES:**
> - NEVER claim "passes the ATS". Say "matches every keyword and requirement the job lists".
> - No invented experience. A rewrite may reframe what evidence already supports; it may not add a
>   skill, a metric, or a scope the evidence lacks. Reuse `verifyClaims` (`resume.ts`) rather than
>   writing softer rules.
> - Engines stay pure: no `Date`, no `Math.random`, no network.
> - Schema changes additive only.
> - Every rewrite shows **before → after** with the requirement it addresses and the evidence behind
>   it. A suggestion the user cannot trace is a suggestion they cannot trust.
>
> **OUT OF SCOPE:** style/tone memory (P4), project idea generation (P5).

---

## 10. Working notes, mistakes this project already made

Offered because each one cost real time and is easy to repeat.

- **A failed shell command is not an empty result.** An unquoted `grep --include=*.ts` errors under
  zsh; that error was read as "no matches" and produced a confident, wrong claim that a symbol
  existed nowhere. It existed in 19 places across 7 files. **Quote your globs, and check exit
  codes.**
- **"Not there now" ≠ "never was."** A reported defect was dismissed as a phantom after checking
  current state. It had been real and had been fixed minutes earlier. Check history, not just HEAD.
- **Freeze the contract before spawning implementers.** One schema decision got reversed three times
  because it was published while exchanges were still open. The reversals cost more than the
  decision.
- **Don't relay a claim you haven't verified.** Two wrong assertions here came from passing along
  someone else's summary.
- **A test can pass and prove nothing.** A zip-slip test "passed" because JSZip silently normalizes
  `..`: the test never exercised the attack. Likewise the SSRF tests never reached the DNS branch.
  Ask what a test would have to *fail* on.
- **Self-contradictory instructions should be refused, not implemented.** "Re-resolve DNS at connect
  time" *is* the rebinding bug, not the fix. An agent correctly refused and escalated. The right
  formulation: **the address validated must be the address connected to.**

---

## 11. Non-negotiables

1. Demo mode stays **fully offline**.
2. Engines stay **pure**.
3. `APIFY_TOKEN` and `NVIDIA_API_KEY_*` are **server-only** never logged, never hardcoded, never
   in a client URL.
4. All scraped/pasted text goes through the **injection scanner** and is fenced as
   `<untrusted_data>`. Trusted instructions go in the task, never inside the fence.
5. Every external response is **Zod-validated**; invalid records are dropped, not coerced.
6. Schema changes are **additive only**.
7. Emails are **"found + SMTP-checked, unconfirmed"** never "verified".
8. **Nothing auto-sends.**
9. Do not change the **core product layout or UI structure** without being asked.
10. **Stop and ask** before: a breaking schema or engine change, deleting or renaming a file,
    installing any dependency, or making a live billed API call.
