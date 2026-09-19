# Data Model

All entities are defined as Zod schemas in `src/lib/types.ts` and validated at every
boundary (localStorage read, provider output). Categorical scales replace numeric
scores everywhere.

## Categorical scales

| Scale | Values | Used for |
|---|---|---|
| `TrustLabel` | verified · user-provided · source-backed · strong-inference · weak-inference · unknown | how much to trust a claim / relationship |
| `Level` | strong · moderate · limited · none | strength of a match, fit, impact, influence |
| `Confidence` | high · medium · low | confidence in a conclusion |
| `Recency` | current · recent · dated · unknown | how fresh a piece of evidence is |

Display text and Tailwind styling for each value live in `src/lib/labels.ts`, rendered
via the pills in `src/components/pills.tsx`.

## Entities

### Evidence
One provable claim about the candidate.

| Field | Type | Notes |
|---|---|---|
| `id` | string | e.g. `ev_cachesim` |
| `claim` | string | plain-language statement |
| `category` | skill · project · experience · education · achievement · leadership | |
| `sourceType` | resume · github · portfolio · linkedin · user-confirmation · email · project-doc | where it comes from |
| `sourceReference` | string? | e.g. a GitHub URL |
| `strength` | `Level` | how strong the evidence is |
| `recency` | `Recency` | |
| `publicProof` | boolean | is there a public artifact anyone can check |
| `trust` | `TrustLabel` | trust in this specific claim |

### Candidate
The Career Workspace root. Profile fields plus an `evidence: Evidence[]` graph.
Key fields: `name`, `headline`, `university`, `degree`, `graduationYear`,
`experienceLevel` (student · entry · mid · senior), `workAuthorization`,
`targetRoles[]`, `targetIndustries[]`, `links` (github / linkedin / portfolio).

### Job
A parsed opportunity. Key fields: `title`, `normalizedTitle`, `company`, `team?`,
`location`, `remote` (onsite · hybrid · remote · unknown), `employmentType`
(internship · full-time · contract), `seniority`, `description`, `postedAt?`,
`deadline?`, `sponsorship` (offered · not-offered · unclear), and `requirements[]`.

**JobRequirement** — `text`, `kind` (minimum · preferred · responsibility), and an
optional `skillKey` that links the requirement to a canonical skill the engine matches
candidate evidence against.

### FitDimension
One of the six categorical fit dimensions.

| Field | Type |
|---|---|
| `category` | role · evidence · preference · network · urgency · improvement |
| `label` | display name |
| `level` | `Level` |
| `confidence` | `Confidence` |
| `explanation` | plain-language reasoning |
| `supportingEvidenceIds` | string[] — links back into the evidence graph |

### Gap
An unmet requirement plus its single best next action.

| Field | Type | Notes |
|---|---|---|
| `requirement` / `requirementId?` | string | the unmet requirement |
| `classification` | `GapClassification` | true-skill-gap · evidence-gap · resume-wording-gap · experience-gap · low-priority-gap · hard-blocker · uncertain-gap |
| `importance` | critical · high · medium · low | |
| `action.kind` | `GapActionKind` | rewrite-bullet · add-evidence · improve-readme · highlight-project · build-project · learning-sprint · prep-interview-story · ask-employee · apply-anyway · do-not-apply |
| `action.summary` / `action.detail` | string | the concrete next step |
| `action.expectedImpact` | `Level` | |
| `action.effort` | quick · moderate · significant | |
| `evidenceNote?` | string | why it was classified this way |

### CampaignTask
A planned action, owned by a named agent.

Fields: `title`, `category` (application · resume · outreach · research · learning ·
interview), `priority` (critical · high · medium · low), `impact` (`Level`),
`effort` (quick · moderate · significant), `status` (todo · in-progress · done),
`sourceGapId?`, `responsibleAgent`.

### Person
A hiring-network contact. Relevance, influence, and accessibility are each a `Level`;
`confidence` and `trust` mark how sure we are the relationship is real. `connection`,
`inferredRole`, and `commonality` describe the path; `outreachPriority` (first · high ·
medium · low) orders who to contact. Inferred relationships are explicitly labeled —
nothing is presented as a confirmed reporting line.

### AgentActivity
One line in the visible agent feed: `agent`, `message`, `kind` (action · evidence ·
conclusion · conflict), optional `confidence`. Shows conclusions and confidence only —
never private model reasoning.

### Campaign (the aggregate)
Ties it all together: `id`, `candidateId`, `job` (embedded), `stage` (created ·
researching · analyzed · outreach · applied · interviewing · closed), `readiness`
(`Level`), `createdAt`, `isDemo`, and the arrays `fit[]`, `gaps[]`, `tasks[]`,
`people[]`, `activity[]`, plus a `nextAction` string. This is exactly what
`provider.buildCampaign()` returns and what is persisted and rendered.
