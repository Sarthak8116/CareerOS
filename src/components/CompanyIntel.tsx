import type { CompanyIntel, ResearchSource } from "@/lib/types";
import { Card, CardHeader, Pill, SectionTitle, EmptyState } from "@/components/ui/primitives";
import { LevelPill } from "@/components/pills";

/**
 * Presentational view for cached company intelligence (build directive §5.6).
 *
 * Everything shown is categorical or narrative, no invented numbers. When a
 * company hasn't been researched the engine returns empty arrays and honest,
 * low-confidence prose; this view degrades gracefully to reflect that instead
 * of implying certainty.
 */

function Prose({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-slate-600">{children}</p>;
}

/** A highlighted, single-fact card used for the two "narrative" call-outs. */
function HighlightCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <Card className="border-l-4 border-l-brand-500 bg-brand-50/40">
      <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
        {title}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{body}</p>
    </Card>
  );
}

/** A simple bulleted list of narrative strings. */
function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
          <span
            aria-hidden="true"
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SourceItem({ source }: { source: ResearchSource }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">{source.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{source.publisher}</p>
        </div>
        <LevelPill level={source.reliability} label="Reliability" />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        “{source.excerpt}”
      </p>
      <p className="mt-2 text-xs text-slate-400">Retrieved {source.retrievedAt}</p>
    </li>
  );
}

export function CompanyIntelView({ intel }: { intel: CompanyIntel }) {
  return (
    <div className="space-y-6">
      {/* Overview: description + business model + relevant org */}
      <Card>
        <CardHeader
          title={`What ${intel.company} actually does`}
          subtitle="Cached research, read the sources below before relying on any claim."
        />
        <div className="space-y-4">
          <Prose>{intel.description}</Prose>
          <div>
            <SectionTitle>Business model</SectionTitle>
            <div className="mt-2">
              <Prose>{intel.businessModel}</Prose>
            </div>
          </div>
          <div>
            <SectionTitle>The team you'd join</SectionTitle>
            <div className="mt-2">
              <Prose>{intel.relevantOrg}</Prose>
            </div>
          </div>
        </div>
      </Card>

      {/* Products */}
      {intel.products.length > 0 && (
        <Card>
          <CardHeader title="Products & platform" />
          <div className="flex flex-wrap gap-2">
            {intel.products.map((product, i) => (
              <Pill
                key={i}
                className="bg-slate-100 text-slate-700 ring-slate-500/20"
              >
                {product}
              </Pill>
            ))}
          </div>
        </Card>
      )}

      {/* The two narrative call-outs */}
      <div className="grid gap-6 lg:grid-cols-2">
        <HighlightCard title="Why this role exists" body={intel.whyRoleExists} />
        <HighlightCard title="What you'd work on" body={intel.whatYoudWorkOn} />
      </div>

      {/* Priorities */}
      {intel.priorities.length > 0 && (
        <Card>
          <CardHeader
            title="What this team is optimizing for"
            subtitle="Where their attention goes, align your story with it."
          />
          <BulletList items={intel.priorities} />
        </Card>
      )}

      {/* Values beyond the JD */}
      {intel.valuesBeyondJD.length > 0 && (
        <Card>
          <CardHeader
            title="What they value beyond the job description"
            subtitle="Signals that matter but rarely make it into the posting."
          />
          <BulletList items={intel.valuesBeyondJD} />
        </Card>
      )}

      {/* Talking points, framed as "Sound informed: …" */}
      {intel.talkingPoints.length > 0 && (
        <Card>
          <CardHeader
            title="Talking points"
            subtitle="Use these to show you've done the homework."
          />
          <ul className="space-y-3">
            {intel.talkingPoints.map((point, i) => (
              <li
                key={i}
                className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700"
              >
                <span className="font-medium text-slate-900">Sound informed:</span>{" "}
                {point}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Risks, amber-toned */}
      {intel.risks.length > 0 && (
        <Card className="border border-amber-200 bg-amber-50/50">
          <CardHeader
            title="Risks & honest caveats"
            subtitle="What to weigh before you invest in this campaign."
          />
          <ul className="space-y-2">
            {intel.risks.map((risk, i) => (
              <li
                key={i}
                className="flex gap-2.5 text-sm leading-relaxed text-amber-900"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                />
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Sources */}
      <Card>
        <CardHeader
          title="Sources"
          subtitle="Every claim above traces back to these, check them yourself."
        />
        {intel.sources.length === 0 ? (
          <EmptyState
            title="No sources yet"
            body={`${intel.company} hasn't been researched. The notes above are derived only from the job posting and are not externally verified.`}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {intel.sources.map((source) => (
              <SourceItem key={source.id} source={source} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
