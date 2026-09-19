"use client";

import { useState } from "react";
import {
  Check,
  Library,
  Pencil,
  Trash2,
  UserCheck,
} from "lucide-react";
import type { PackageClaim, PackageDocument } from "@/lib/types";
import { Button, Card, Pill, SectionTitle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * One document in the application package, and everything it claims.
 *
 * Split out of PackageReview so each file stays readable: this module owns the
 * per-document surface (origin, content, edit) and the per-sentence claim
 * surface (evidenced / user-provided / unsupported, and how an unsupported one
 * is resolved). PackageReview owns the package-level view and the export gate.
 *
 * Two honesty rules live HERE rather than there:
 *  - REUSED IS NOT DRAFTED. A library answer is labelled as pulled from the
 *    library. Collapsing the two would tell the user we wrote something for
 *    this job when we took it out of a drawer.
 *  - A CLAIM IS DERIVED FROM THE CONTENT. When the user edits a document, a
 *    claim whose sentence is gone stops being made and stops being shown.
 */

/* ------------------------------------------------------------------ */
/* Labels — local, so the package's vocabulary lives with its UI        */
/* ------------------------------------------------------------------ */

const kindLabel: Record<PackageDocument["kind"], string> = {
  resume: "Résumé",
  "cover-letter": "Cover letter",
  "short-answers": "Short answers",
  "personal-info": "Personal information",
};

/**
 * Document status: a pill AND a sentence. The pill alone is too small a
 * surface to carry the difference between "we wrote this for this posting"
 * and "we took this out of your library".
 */
const statusStyle: Record<
  PackageDocument["status"],
  { text: string; className: string; sentence: string }
> = {
  drafted: {
    text: "Drafted for this job",
    className: "bg-brand-50 text-brand-700 ring-brand-600/20",
    sentence: "Written for this posting, from your evidence.",
  },
  reused: {
    text: "Reused from your library",
    className: "bg-violet-50 text-violet-700 ring-violet-600/20",
    sentence:
      "Pulled from your answer library as-is — it was not written for this posting.",
  },
  "needs-you": {
    text: "Needs you",
    className: "bg-amber-50 text-amber-700 ring-amber-600/20",
    sentence: "We could not produce this. You'll need to write it yourself.",
  },
  "not-requested": {
    text: "Not requested",
    className: "bg-slate-100 text-slate-600 ring-slate-500/20",
    sentence: "This application doesn't ask for one, so none was produced.",
  },
};

const supportStyle: Record<
  PackageClaim["support"],
  { text: string; className: string }
> = {
  evidenced: {
    text: "Evidenced",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  "user-provided": {
    text: "You provided this",
    className: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
  unsupported: {
    text: "Unsupported",
    className: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
};

/**
 * Claims still actually made by `content`.
 *
 * After the user edits a document, a claim whose sentence is gone is no longer
 * being made and must stop appearing on the honesty surface. Deriving the
 * claim list FROM the content is the only way the two cannot drift; keeping a
 * parallel list would let a deleted sentence stay flagged, or — far worse — a
 * flagged sentence survive an edit that removed only its flag.
 */
export function claimsStillMade(
  content: string,
  claims: PackageClaim[],
): PackageClaim[] {
  /* `includes` is SUBSTRING matching, and that imprecision is deliberate —
     do not "fix" this to an exact sentence match.
     If a removed long sentence happens to contain a shorter claim's text, the
     shorter claim is still treated as made, so the UI keeps showing its flag.
     That over-reports. The opposite error — dropping a claim that is in fact
     still asserted — would silently let an unbacked sentence through the
     export gate. A spurious flag costs the user one click; a missed one ships
     an invented claim about a real person. Exact matching would invert that
     error direction, which is why the loose test is the safe one. */
  return claims.filter((c) => content.includes(c.text));
}

/* ------------------------------------------------------------------ */
/* One document — reviewable, editable, and honest about its origin     */
/* ------------------------------------------------------------------ */

export function DocumentCard({
  doc,
  onChange,
}: {
  doc: PackageDocument;
  onChange: (next: PackageDocument) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.content);
  /* Session-local: "you changed this here", not a property of the package. */
  const [editedHere, setEditedHere] = useState(false);
  /* Index of a claim whose sentence cannot be cut without damaging another. */
  const [unremovable, setUnremovable] = useState<number | null>(null);

  const status = statusStyle[doc.status];
  const unsupported = doc.claims.filter((c) => c.support === "unsupported");

  function save() {
    onChange({
      ...doc,
      content: draft,
      claims: claimsStillMade(draft, doc.claims),
    });
    setEditedHere(true);
    setEditing(false);
  }

  /* Claims are addressed by POSITION too: the same sentence can legitimately
     appear twice, and owning one occurrence must not silently own the other. */
  function resolveClaim(index: number, how: "own" | "remove") {
    const claim = doc.claims[index];
    if (how === "own") {
      onChange({
        ...doc,
        claims: doc.claims.map((c, i) =>
          i === index ? { ...c, support: "user-provided" as const } : c,
        ),
      });
      return;
    }
    const content = removeSentence(doc.content, claim.text);
    if (content === doc.content) {
      /* The sentence sits inside a longer one; cutting it would mangle a
         sentence the user never chose to touch. Say so instead of doing
         nothing visible — and leave the claim standing, so it still blocks
         export until the user resolves it for real. */
      setUnremovable(index);
      return;
    }
    setUnremovable(null);
    onChange({
      ...doc,
      content,
      /* Every claim is re-derived from the new content — including the one
         just removed. If its sentence somehow still appears elsewhere, it is
         still being made and must stay flagged; pre-filtering it out would
         hide a claim the document still asserts. */
      claims: claimsStillMade(content, doc.claims),
    });
    setDraft(content);
  }

  return (
    <Card
      className={cn(
        "border-l-4",
        doc.status === "not-requested" && "border-l-slate-200 bg-slate-50/50",
        doc.status === "drafted" && "border-l-brand-400",
        doc.status === "reused" && "border-l-violet-400",
        doc.status === "needs-you" && "border-l-amber-400",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {kindLabel[doc.kind]}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-slate-400">
            {doc.fileName}
          </p>
        </div>
        <Pill className={status.className}>
          {doc.status === "reused" && (
            <Library className="h-3 w-3" aria-hidden="true" />
          )}
          {status.text}
        </Pill>
      </div>

      <p className="mt-2 text-sm text-slate-600">{status.sentence}</p>

      {doc.status !== "not-requested" && (
        <>
          <div className="mt-4">
            {editing ? (
              <>
                <label htmlFor={`doc-${doc.kind}`} className="sr-only">
                  {kindLabel[doc.kind]} content
                </label>
                <textarea
                  id={`doc-${doc.kind}`}
                  value={draft}
                  rows={12}
                  onChange={(e) => setDraft(e.target.value)}
                  className="block w-full resize-y rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" onClick={save}>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Save changes
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraft(doc.content);
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/70 p-3 font-sans text-sm leading-relaxed text-slate-700">
                  {doc.content}
                </pre>
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDraft(doc.content);
                      setEditing(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Edit
                  </Button>
                </div>
              </>
            )}
          </div>

          {editedHere && (
            <p className="mt-3 text-xs text-slate-500">
              You edited this. Anything you wrote yourself is yours — CareerOS
              hasn&apos;t checked it against your evidence.
            </p>
          )}

          <ClaimList
            claims={doc.claims}
            kind={doc.kind}
            unsupportedCount={unsupported.length}
            unremovable={unremovable}
            onResolve={resolveClaim}
          />
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Claims — every factual sentence, and what stands behind it           */
/* ------------------------------------------------------------------ */

function ClaimList({
  claims,
  kind,
  unsupportedCount,
  unremovable,
  onResolve,
}: {
  claims: PackageClaim[];
  kind: PackageDocument["kind"];
  unsupportedCount: number;
  unremovable: number | null;
  onResolve: (index: number, how: "own" | "remove") => void;
}) {
  if (claims.length === 0) {
    return (
      <p className="mt-4 text-sm text-slate-500">
        No factual claims were extracted from this document.
      </p>
    );
  }

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle className="text-slate-500">
          What this document claims ({claims.length})
        </SectionTitle>
        {unsupportedCount > 0 && (
          <span className="text-xs font-medium text-rose-700">
            {unsupportedCount} unsupported
          </span>
        )}
      </div>
      <ul className="space-y-2" aria-label={`Claims in the ${kindLabel[kind]}`}>
        {claims.map((claim, i) => (
          <li key={`${i}-${claim.text}`}>
            <ClaimRow
              claim={claim}
              unremovable={unremovable === i}
              onResolve={(how) => onResolve(i, how)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClaimRow({
  claim,
  unremovable,
  onResolve,
}: {
  claim: PackageClaim;
  /** Cutting this sentence would damage a longer one around it. */
  unremovable: boolean;
  onResolve: (how: "own" | "remove") => void;
}) {
  const support = supportStyle[claim.support];
  const unsupported = claim.support === "unsupported";

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 border-l-4 p-3",
        unsupported ? "border-l-rose-400 bg-rose-50/40" : "border-l-slate-200",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-slate-800">“{claim.text}”</p>
        <Pill className={support.className}>{support.text}</Pill>
      </div>

      {claim.support === "evidenced" && claim.evidenceId && (
        <p className="mt-1.5 font-mono text-xs text-slate-400">
          Evidence: {claim.evidenceId}
        </p>
      )}

      {unsupported && (
        <>
          <p className="mt-2 text-sm text-rose-800">
            Nothing in your evidence backs this up. It can&apos;t go out as
            though CareerOS found it.
          </p>
          {/* ONE CLAIM, ONE DELIBERATE ACTION. There is deliberately no
              "accept all", no multi-select and no path that resolves more than
              one sentence per click. These sentences were drafted by a model,
              not written by the user, so attesting to one is a judgement about
              a specific sentence — which is why each button names the sentence
              it acts on, and why the sentence is rendered in full above it. A
              bulk control would turn ten judgements into one unread click. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              aria-label={`This is true — it's mine: “${claim.text}”`}
              onClick={() => onResolve("own")}
            >
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              This is true — it&apos;s mine
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Take it out: “${claim.text}”`}
              onClick={() => onResolve("remove")}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Take it out
            </Button>
          </div>
          {unremovable && (
            <p className="mt-2 text-sm text-rose-800" role="alert">
              This sentence isn&apos;t a whole sentence in the document — it sits
              inside a longer one — so removing it on its own would leave the rest
              mangled. Edit the text directly to change it.
            </p>
          )}
        </>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Split content into whole units — sentences, and the line breaks between
 * them — such that `units.join("")` reproduces the input exactly.
 *
 * Exported for testing: the reconstruction property is what makes whole-unit
 * removal safe, and it is worth asserting directly.
 */
export function splitUnits(content: string): string[] {
  return content.match(/[^.!?\n]*[.!?]+["'\u201d\u2019)\]]*[ \t]*|[^.!?\n]+|\n/g) ?? [];
}

/**
 * Remove one sentence from a document, leaving every other sentence byte-identical.
 *
 * REMOVAL OPERATES ON WHOLE UNITS, NEVER ON ARBITRARY SUBSTRINGS, and that is
 * the entire safety property of this function. The original implementation was
 * `content.split(sentence).join("")`, an unbounded global replace, which had a
 * data-corruption bug a tester proved with a repro: when one claim's text is a
 * substring of a LONGER sentence, removing the short claim rips its words out
 * of the middle of the long one. The long sentence is left mangled, and because
 * its text no longer matches its claim, `claimsStillMade` silently drops that
 * claim too — so corrupted prose lands in the document the user sends an
 * employer, with nothing on the honesty surface covering it.
 *
 * A boundary check on the occurrence is NOT sufficient either, and that was a
 * second, weaker attempt: a claim like "I shipped the feature." inside "I led
 * the team and I shipped the feature." starts at a word boundary and ends a
 * sentence, yet cutting it leaves the dangling fragment "I led the team and".
 * Only whole-unit removal cannot corrupt a neighbour, because it never cuts
 * inside one.
 *
 * WHEN THE CLAIM IS NOT A WHOLE UNIT, NOTHING IS REMOVED. There is deliberately
 * no substring fallback "so that it works" — partial removal is precisely the
 * corruption being fixed here. The content comes back unchanged, the caller
 * detects that and tells the user, and the claim stays unresolved and keeps
 * blocking export. Silent partial mangling must not be reachable.
 *
 * Nothing is rewritten around the hole either: inventing a bridging phrase
 * would be writing new prose about a real person, which is the exact thing
 * this surface exists to prevent.
 */
export function removeSentence(content: string, sentence: string): string {
  const target = sentence.trim();
  if (!target) return content;

  let removedAny = false;
  const kept = splitUnits(content).map((unit) => {
    if (unit.trim() !== target) return unit;
    removedAny = true;
    return "";
  });
  if (!removedAny) return content;

  return kept
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** "a voluntary EEO section" / "X and Y". */
