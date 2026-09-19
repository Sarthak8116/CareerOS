"use client";

import { useMemo } from "react";
import { AlertTriangle, Download, FileText, ShieldCheck } from "lucide-react";
import type {
  ApplicationPackage,
  PackageClaim,
  PackageDocument,
} from "@/lib/types";
import { Button, Card, CardHeader, Pill, SectionTitle } from "@/components/ui/primitives";
import { DocumentCard } from "@/components/PackageDocumentCard";

/**
 * The application package, read back before anything leaves the building.
 *
 * Four honesty rules carry this surface, and each of them is a thing the UI
 * could quietly get wrong in the user's favour:
 *
 *  1. UNSUPPORTED CLAIMS BLOCK EXPORT. A cover letter is free prose about a
 *     real person — the easiest place in this product to invent a job, a
 *     metric or an enthusiasm. Every unsupported sentence is shown and must be
 *     resolved (owned or removed) before the .zip is offered.
 *  2. "COMPLETE" IS A CLAIM. It is only rendered when the data supports it:
 *     `completeness === "complete"` AND nothing in `missing[]`. A package that
 *     says complete while naming gaps is shown as partial, gaps first.
 *  3. REUSED IS NOT DRAFTED. An answer pulled from the library is labelled as
 *     pulled from the library. Collapsing the two would tell the user we wrote
 *     something for this job when we took it out of a drawer.
 *  4. `excludedSections` IS A NEUTRAL FACT. CareerOS not reading EEO questions
 *     is not a defect in the user's application, and is not styled as one.
 *
 * The component is pure presentation over the frozen `ApplicationPackage`
 * shape: it never builds a package, never zips one, and never derives
 * `completeness` itself. Edits and claim resolutions are handed back up
 * through `onChange` as a whole new package.
 */

/* ------------------------------------------------------------------ */
/* Derivations — read off the package, never stored alongside it        */
/* ------------------------------------------------------------------ */

/** Documents that actually carry text into the archive. */
function exportedDocuments(pkg: ApplicationPackage): PackageDocument[] {
  return pkg.documents.filter((d) => d.status !== "not-requested");
}

/** Every sentence still claiming more than the evidence supports. */
export function unresolvedClaims(pkg: ApplicationPackage): PackageClaim[] {
  return exportedDocuments(pkg).flatMap((d) =>
    d.claims.filter((c) => c.support === "unsupported"),
  );
}

/* ------------------------------------------------------------------ */
/* Package review                                                      */
/* ------------------------------------------------------------------ */

export function PackageReview({
  pkg,
  onChange,
  onExport,
  exporting = false,
  exportError,
}: {
  pkg: ApplicationPackage;
  onChange: (next: ApplicationPackage) => void;
  onExport: () => void;
  exporting?: boolean;
  exportError?: string;
}) {
  const unresolved = useMemo(() => unresolvedClaims(pkg), [pkg]);
  const gaps = pkg.missing;
  /* "Complete" is only said when BOTH signals agree. A package that claims
     complete while naming gaps is a defect somewhere upstream — it is not the
     UI's business to smooth that over in the reassuring direction. */
  const readsComplete = pkg.completeness === "complete" && gaps.length === 0;
  const exportBlocked = unresolved.length > 0;

  /* Documents are addressed by POSITION, not by kind or file name. Nothing in
     the schema makes either unique, and a package with two short-answer files
     must not have one silently overwrite the other. */
  function replaceDocumentAt(index: number, next: PackageDocument) {
    onChange({
      ...pkg,
      documents: pkg.documents.map((d, i) => (i === index ? next : d)),
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Your application package"
          subtitle={`${pkg.folderName} — read it back before you send it anywhere.`}
          action={
            readsComplete ? (
              <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                Complete
              </Pill>
            ) : (
              <Pill className="bg-amber-50 text-amber-700 ring-amber-600/20">
                Partial
              </Pill>
            )
          }
        />

        {readsComplete ? (
          <p className="text-sm text-slate-600">
            Everything this application asks for is in the package below.
          </p>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              This package is partial
            </p>
            {gaps.length > 0 ? (
              <>
                <p className="mt-1.5 text-sm text-amber-900">
                  {gaps.length === 1
                    ? "One thing this application asks for is not in the package:"
                    : `${gaps.length} things this application asks for are not in the package:`}
                </p>
                <ul className="mt-2 space-y-1" aria-label="Missing from this package">
                  {gaps.map((gap) => (
                    <li
                      key={gap}
                      className="flex gap-2 text-sm leading-relaxed text-amber-900"
                    >
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-400"
                        aria-hidden="true"
                      />
                      {gap}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1.5 text-sm text-amber-900">
                We could not confirm that everything this application asks for
                is here.
              </p>
            )}
          </div>
        )}

        {/* A deliberate omission, not a failure — so it isn't styled as one. */}
        {pkg.excludedSections.length > 0 && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
              aria-hidden="true"
            />
            <p className="text-sm leading-relaxed text-slate-600">
              This application includes{" "}
              <span className="font-medium text-slate-700">
                {formatList(pkg.excludedSections)}
              </span>
              . CareerOS doesn&apos;t read or pre-fill those questions —
              you&apos;ll complete them on the employer&apos;s site.
            </p>
          </div>
        )}

        <ExportBar
          unresolvedCount={unresolved.length}
          blocked={exportBlocked}
          partial={!readsComplete}
          exporting={exporting}
          exportError={exportError}
          onExport={onExport}
        />
      </Card>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-600" aria-hidden="true" />
          <SectionTitle className="text-slate-500">
            Documents ({pkg.documents.length})
          </SectionTitle>
        </div>
        <div className="space-y-4">
          {pkg.documents.map((doc, i) => (
            <DocumentCard
              key={`${i}-${doc.fileName}`}
              doc={doc}
              onChange={(next) => replaceDocumentAt(i, next)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Export — offered only once nothing is claiming more than it can      */
/* ------------------------------------------------------------------ */

function ExportBar({
  unresolvedCount,
  blocked,
  partial,
  exporting,
  exportError,
  onExport,
}: {
  unresolvedCount: number;
  blocked: boolean;
  partial: boolean;
  exporting: boolean;
  exportError?: string;
  onExport: () => void;
}) {
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      {blocked && (
        <p
          className="mb-3 flex items-start gap-2 text-sm text-rose-700"
          role="status"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            {unresolvedCount === 1
              ? "One sentence below isn't backed by your evidence."
              : `${unresolvedCount} sentences below aren't backed by your evidence.`}{" "}
            Own them or take them out, then you can download the package.
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onExport} disabled={blocked || exporting}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {exporting ? "Preparing…" : "Download .zip"}
        </Button>
        {!blocked && partial && (
          <span className="text-xs text-slate-500">
            You can download the partial package — the gaps above are still
            yours to fill.
          </span>
        )}
      </div>
      {exportError && (
        <p className="mt-2 text-sm text-rose-700" role="alert">
          {exportError}
        </p>
      )}
    </div>
  );
}

function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
