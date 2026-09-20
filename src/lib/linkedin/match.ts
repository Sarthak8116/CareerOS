import type { LinkedInConnection, Person } from "@/lib/types";

/**
 * Mark the people in a campaign the user is already connected to.
 *
 * PURE, and run in the BROWSER: the connection list comes from the user's own
 * Connections.csv and lives only in their profile store. It is never sent to
 * the server, so this cannot live in `lib/live/*`: a server-side matcher has
 * nothing to match against.
 *
 * Two grades of match, deliberately not collapsed:
 *  - PROFILE URL: a unique identifier from the user's own export. Labelled
 *    `user-provided`: it is their file saying so, not something we verified.
 *  - NAME ONLY: two people can share a name. This is a prompt to check, never
 *    a relationship. It does not raise trust or outreach priority.
 */
export function applyKnownConnections(
  people: Person[],
  connections: LinkedInConnection[] | undefined,
): Person[] {
  if (!connections || connections.length === 0) return people;

  const byUrl = new Set<string>();
  const byName = new Set<string>();
  for (const connection of connections) {
    const slug = profileSlug(connection.profileUrl);
    if (slug) byUrl.add(slug);
    const name = normalizeName(connection.name);
    if (name) byName.add(name);
  }

  return people.map((person) => {
    const slug = profileSlug(person.linkedinUrl);
    if (slug && byUrl.has(slug)) {
      return {
        ...person,
        connection:
          "First-degree LinkedIn connection, per your own Connections.csv export (matched by profile URL).",
        trust: "user-provided" as const,
        outreachPriority: "first" as const,
      };
    }
    if (byName.has(normalizeName(person.name))) {
      return {
        ...person,
        connection:
          "Possible first-degree connection, this name appears in your Connections.csv, " +
          "but no profile URL matched. Confirm it is the same person before referencing it.",
      };
    }
    return person;
  });
}

/** `/in/<slug>` from any LinkedIn profile URL form; undefined otherwise. */
function profileSlug(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const match = /linkedin\.com\/in\/([^/?#]+)/i.exec(url);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
