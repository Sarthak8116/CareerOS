import { Github, CheckCircle2, MinusCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import type { GitHubProfileAnalysis, GitHubRepoAnalysis } from "@/lib/types";
import { Card, CardHeader, Pill, SectionTitle, EmptyState } from "@/components/ui/primitives";
import { LevelPill } from "@/components/pills";

/**
 * Presentational view for §5.15 GitHub analysis.
 *
 * Honest framing: these are signals from *public metadata* (languages, README
 * presence/quality, role relevance), not a claim of deep code-quality review.
 * Recommendations (which repos to feature, which READMEs to improve, and which
 * claimed skills lack public evidence) are the visible output.
 */

const suggestedActionLabel: Record<GitHubRepoAnalysis["suggestedAction"], string> = {
  feature: "Feature this repo",
  "improve-readme": "Improve the README",
  "add-tests": "Add tests",
  "add-demo": "Add a runnable demo",
  "leave-as-is": "Leave as-is",
};

// Actions that ask for work get an amber cue; "leave-as-is" stays neutral.
const suggestedActionStyle: Record<GitHubRepoAnalysis["suggestedAction"], string> = {
  feature: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  "improve-readme": "bg-amber-50 text-amber-700 ring-amber-600/20",
  "add-tests": "bg-amber-50 text-amber-700 ring-amber-600/20",
  "add-demo": "bg-amber-50 text-amber-700 ring-amber-600/20",
  "leave-as-is": "bg-slate-100 text-slate-600 ring-slate-500/20",
};

function RepoCard({ repo }: { repo: GitHubRepoAnalysis }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Github className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{repo.name}</span>
          </h3>
          <p className="mt-1 text-sm text-slate-500">{repo.description}</p>
        </div>
        <Pill className="bg-slate-100 text-slate-700 ring-slate-500/20">{repo.language}</Pill>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <LevelPill level={repo.relevance} label="Role relevance" />
        <LevelPill level={repo.readmeQuality} label="README" />
        {repo.supportsTargetRole ? (
          <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Supports target role
          </Pill>
        ) : (
          <Pill className="bg-slate-100 text-slate-600 ring-slate-500/20">
            <MinusCircle className="h-3.5 w-3.5" />
            Off-target
          </Pill>
        )}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-600">{repo.recommendation}</p>

      <div className="mt-4">
        <Pill className={suggestedActionStyle[repo.suggestedAction]}>
          {suggestedActionLabel[repo.suggestedAction]}
        </Pill>
      </div>
    </Card>
  );
}

function SkillList({
  title,
  skills,
  tone,
  emptyBody,
}: {
  title: string;
  skills: string[];
  tone: "emerald" | "amber";
  emptyBody: string;
}) {
  const Icon = tone === "emerald" ? ShieldCheck : ShieldAlert;
  const pillClass =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : "bg-amber-50 text-amber-700 ring-amber-600/20";
  const iconClass = tone === "emerald" ? "text-emerald-600" : "text-amber-600";

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${iconClass}`} />
            {title}
          </span>
        }
      />
      {skills.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyBody}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <li key={skill}>
              <Pill className={pillClass}>{skill}</Pill>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function GitHubAnalysisView({ analysis }: { analysis: GitHubProfileAnalysis }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Github className="h-5 w-5 text-slate-500" />@{analysis.username}
            </span>
          }
          subtitle="Signals from public GitHub metadata, not a deep code-quality audit."
        />
        <p className="text-sm leading-relaxed text-slate-600">{analysis.summary}</p>
      </Card>

      <section className="space-y-3">
        <SectionTitle>Repositories</SectionTitle>
        {analysis.repos.length === 0 ? (
          <EmptyState
            title="No repositories analyzed"
            body="Link a GitHub account with public repositories to see per-repo recommendations."
          />
        ) : (
          <div className="grid gap-4">
            {analysis.repos.map((repo) => (
              <RepoCard key={repo.name} repo={repo} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle>Skill evidence</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <SkillList
            title="Skills with public proof"
            skills={analysis.skillsWithPublicProof}
            tone="emerald"
            emptyBody="No skills are backed by public repositories yet."
          />
          <SkillList
            title="Claimed skills lacking public evidence"
            skills={analysis.claimedSkillsLackingProof}
            tone="amber"
            emptyBody="Every claimed skill is backed by public evidence."
          />
        </div>
      </section>
    </div>
  );
}
