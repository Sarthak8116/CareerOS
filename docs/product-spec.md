# CareerOS — Product Spec (condensed)

CareerOS turns a single job listing into a **complete campaign for getting hired**.
This document condenses the Master Build Directive and marks clearly what is **built**
in the current slice versus **planned**.

## The two-layer model

**Layer One — Career Workspace.** One per candidate. Holds the profile and an
**evidence graph**: every skill, project, and experience is a record that points to a
source and carries a trust label. This is the durable "who you are, provably."
*Built (single deterministic demo candidate).*

**Layer Two — Job Campaigns.** One per opportunity. A campaign is a self-contained
workspace built from `candidate + job`: fit analysis, gap-to-action plan, hiring
network, task plan, and an agent-activity feed. *Built (demo provider).*

## Main user journey

```
Find job → understand job → assess fit → find people →
create strategy → send outreach → prepare interview
```

- **Find / import job** — pick the seeded role or paste a description. *Built.*
- **Understand job** — parse into structured requirements (minimum / preferred /
  responsibility), each linked to a canonical skill. *Built (pre-parsed demo job;
  pasted jobs get a minimal heuristic parse).*
- **Assess fit** — six categorical fit dimensions, each with a level, confidence, and
  a plain-language explanation. *Built.*
- **Find people** — map the hiring network with inferred relationships clearly
  labeled and an outreach order. *Built (cached demo people).*
- **Create strategy** — gap-to-action engine + task planner produce the ordered plan.
  *Built.*
- **Send outreach** — draft evidence-backed messages and send via Gmail, only with
  explicit user approval. *Planned.*
- **Prepare interview** — interview mode with tailored technical topics. *Planned
  (a placeholder interview-prep task is generated today).*

## Modules

| Module | What it does | Status |
|---|---|---|
| Evidence graph | Candidate claims with source + trust labels | Built (demo) |
| Job parser | Listing → structured requirements | Built (demo pre-parsed) |
| Fit engine | Six categorical fit dimensions + readiness | Built |
| Gap-to-action engine | Classifies each gap, gives one best action | Built |
| Campaign planner | Ordered, agent-owned task list | Built |
| Hiring-network map | Relevant people + outreach priority | Built (demo) |
| Agent-activity feed | Visible actions / evidence / conclusions | Built |
| Outreach | Approved, evidence-backed email sending | Planned |
| Interview mode | Tailored prep and mock questions | Planned |
| Opportunity graph | React Flow visual of the campaign | Planned |
| Auth + multi-user | Supabase auth, real accounts | Planned |
| Live research | GitHub / Gmail / LinkedIn / web (Tavily) | Planned |

## The six fit dimensions

Each is a `Level` (strong / moderate / limited / none) with a `Confidence` and an
explanation — never a percentage.

1. **Role Fit** — coverage of the minimum requirement bar.
2. **Evidence Fit** — how much of the match is backed by public proof.
3. **Preference Fit** — does the role match the candidate's stated targets.
4. **Network Strength** — relevant, accessible contacts around the role.
5. **Application Urgency** — deadline proximity, categorical (not a countdown).
6. **Improvement Potential** — how much a short focused sprint could raise the profile.

## Gap classification

Every unmet requirement is classified so the *action* fits the *cause*:

- **true-skill-gap** → build a small project (turn interest into proof).
- **resume-wording-gap** → rewrite a bullet (the skill exists but isn't framed).
- **evidence-gap** → add public proof for a real-but-unproven skill.
- **experience-gap / low-priority-gap** → surface closest evidence, or apply anyway.
- **hard-blocker / uncertain-gap** — reserved in the schema; not emitted by the demo engine.

## Design constraints (non-negotiable)

- No invented numeric precision — categorical labels only.
- Every claim carries evidence + a trust label.
- No fabricated experience; inferred relationships are labeled as inference.
- The agent feed shows conclusions and confidence, never private model reasoning.
