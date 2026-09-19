import JSZip from "jszip";
import type { ApplicationPackage, PackageDocument } from "@/lib/types";
import { assertSafeEntryPath } from "@/lib/package/filenames";
import { countUnsupported } from "@/lib/package/claims";

/**
 * Archive assembly.
 *
 * JSZip writes whatever entry name it is handed — given "../../etc/evil" it
 * produces exactly that, a Zip Slip archive. Every name here therefore comes
 * from `lib/package/filenames.ts`, and `assertSafeEntryPath` re-checks each
 * finished path immediately before it is added. That second check is not
 * redundant: it is what makes a future edit that interpolates a raw job title
 * into a path fail here, loudly, instead of shipping a malicious archive.
 *
 * `packageEntries` is pure and is where the manifest is written, so the
 * archive's contents are testable without unzipping anything.
 */

export interface PackageEntry {
  path: string;
  content: string;
}

export const README_NAME = "README.md";

const STATUS_NOTE: Record<PackageDocument["status"], string> = {
  drafted: "drafted by CareerOS for this posting",
  reused: "reused from what you already saved — not rewritten for this job",
  "needs-you": "incomplete — it names what you still have to write",
  "not-requested": "this application does not ask for it",
};

/** A document only reaches the archive when there is something in it. */
export function includedDocuments(pkg: ApplicationPackage): PackageDocument[] {
  return pkg.documents.filter(
    (doc) => doc.status !== "not-requested" && doc.content.trim().length > 0,
  );
}

function manifest(pkg: ApplicationPackage): string {
  const included = includedDocuments(pkg);
  const omitted = pkg.documents.filter((doc) => !included.includes(doc));

  const lines: string[] = [
    "# Application package",
    "",
    `Built by CareerOS at ${pkg.builtAt}.`,
    "",
    pkg.completeness === "complete"
      ? "**Complete** — everything this application asks for is in this folder."
      : "**Partial** — some of what this application asks for is not here. See “Still on you” below.",
    "",
    "## In this folder",
    "",
    ...included.map((doc) => {
      const flagged = countUnsupported(doc.claims);
      const warning =
        flagged > 0
          ? ` — ${flagged} statement${flagged === 1 ? "" : "s"} nothing in your evidence backs; check ${flagged === 1 ? "it" : "them"} before you send this`
          : "";
      return `- \`${doc.fileName}\` — ${STATUS_NOTE[doc.status]}${warning}`;
    }),
  ];

  if (omitted.length > 0) {
    lines.push(
      "",
      "## Not included",
      "",
      ...omitted.map((doc) => `- ${doc.kind} — ${STATUS_NOTE[doc.status]}`),
    );
  }

  if (pkg.missing.length > 0) {
    lines.push("", "## Still on you", "", ...pkg.missing.map((item) => `- ${item}`));
  }

  if (pkg.excludedSections.length > 0) {
    lines.push(
      "",
      "## Deliberately not handled",
      "",
      "CareerOS does not read, store, or pre-fill answers about protected " +
        "characteristics. You will meet these on the employer's own site:",
      "",
      ...pkg.excludedSections.map((section) => `- ${section}`),
    );
  }

  lines.push(
    "",
    "---",
    "",
    "CareerOS has submitted nothing. Every file here is a draft for you to " +
      "review, edit, and send yourself.",
  );

  return `${lines.join("\n")}\n`;
}

/** Every file that will exist in the archive, with its exact path. */
export function packageEntries(pkg: ApplicationPackage): PackageEntry[] {
  const folder = pkg.folderName;
  const entries: PackageEntry[] = [
    { path: `${folder}/${README_NAME}`, content: manifest(pkg) },
    ...includedDocuments(pkg).map((doc) => ({
      path: `${folder}/${doc.fileName}`,
      content: doc.content,
    })),
  ];
  for (const entry of entries) assertSafeEntryPath(entry.path);
  return entries;
}

/**
 * Build the .zip bytes. Returned as a Uint8Array rather than a Blob so this
 * runs identically in the browser, in Node, and under the test runner; the UI
 * wraps it for download.
 */
export async function buildPackageZip(
  pkg: ApplicationPackage,
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const entry of packageEntries(pkg)) {
    zip.file(entry.path, entry.content);
  }
  return zip.generateAsync({ type: "uint8array" });
}

/** Suggested download name. Sanitized by construction — folderName already is. */
export function packageZipName(pkg: ApplicationPackage): string {
  return `${pkg.folderName}.zip`;
}
