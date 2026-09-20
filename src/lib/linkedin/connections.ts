import type { LinkedInConnection } from "@/lib/types";

export const MAX_CONNECTIONS_CSV_BYTES = 8 * 1024 * 1024;
export const MAX_CONNECTIONS = 25_000;

export class ConnectionsCsvError extends Error {}

const HEADER_SCAN_ROWS = 10;
const NAME_HEADERS = new Set(["first name", "firstname", "last name", "lastname", "name", "full name"]);

/** Parse the standard LinkedIn Connections.csv export without trusting its text. */
export function parseConnectionsCsv(input: string): LinkedInConnection[] {
  if (new TextEncoder().encode(input).length > MAX_CONNECTIONS_CSV_BYTES) {
    throw new ConnectionsCsvError("That connections export is too large.");
  }

  const rows = parseRows(input);
  if (rows.length < 2) {
    throw new ConnectionsCsvError("That file does not contain any connections.");
  }

  // A real LinkedIn export opens with a "Notes:" preamble, so the header is
  // not row 0. Find it rather than assume it.
  const headerIndex = rows
    .slice(0, HEADER_SCAN_ROWS)
    .findIndex((row) => row.some((cell) => NAME_HEADERS.has(cell.trim().toLowerCase())));
  if (headerIndex < 0) {
    throw new ConnectionsCsvError("This does not look like a LinkedIn connections export.");
  }
  const headers = rows[headerIndex].map((header) => header.trim().toLowerCase());
  const column = (...names: string[]) =>
    names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const firstName = column("first name", "firstname");
  const lastName = column("last name", "lastname");
  const fullName = column("name", "full name");
  const profileUrl = column("url", "profile url", "linkedin url");
  const company = column("company");
  const position = column("position", "title");
  const connectedOn = column("connected on", "connected date");

  if (firstName < 0 && lastName < 0 && fullName < 0) {
    throw new ConnectionsCsvError("This does not look like a LinkedIn connections export.");
  }

  const output: LinkedInConnection[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(headerIndex + 1, headerIndex + 1 + MAX_CONNECTIONS)) {
    const name = [valueAt(row, firstName), valueAt(row, lastName)]
      .filter(Boolean)
      .join(" ") || valueAt(row, fullName);
    if (!name) continue;

    const url = cleanUrl(valueAt(row, profileUrl));
    const key = (url || name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      name,
      ...(url ? { profileUrl: url } : {}),
      ...optionalField("company", valueAt(row, company)),
      ...optionalField("position", valueAt(row, position)),
      ...optionalField("connectedOn", valueAt(row, connectedOn)),
    });
  }

  if (output.length === 0) {
    throw new ConnectionsCsvError("No named connections were found in that file.");
  }
  return output;
}

function valueAt(row: string[], index: number): string {
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}

function optionalField(key: "company" | "position" | "connectedOn", value: string) {
  return value ? { [key]: value } : {};
}

function cleanUrl(value: string): string | undefined {
  if (!value) return undefined;
  const url = value.startsWith("http") ? value : `https://${value}`;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "www.linkedin.com"
      ? parsed.toString().replace(/\/$/, "")
      : undefined;
  } catch {
    return undefined;
  }
}

/** Small RFC-4180 parser: supports quoted commas, newlines, and escaped quotes. */
function parseRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}
