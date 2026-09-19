import { NextResponse } from "next/server";
import { harvestEnabled, harvestSafeMessage } from "@/lib/harvest/client";
import { fetchOwnProfile } from "@/lib/harvest/network";
import { profileToEvidence } from "@/lib/harvest/map";
import { sanitizeUntrusted } from "@/lib/security/untrusted";
import { isLinkedInProfileUrl } from "@/lib/harvest/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Integration point 1 — the onboarding LinkedIn step.
 *
 * Scrapes the user's OWN public profile (never email mode) and maps their
 * experience, education, and skills into Evidence records with source
 * "linkedin" and the public-proof flag set.
 *
 * When Harvest is off this returns 503 and the page keeps its existing
 * demo-mode behavior — nothing about that path changes.
 */

/** GET /api/harvest/profile — is live LinkedIn import configured? */
export function GET() {
  return NextResponse.json({ enabled: harvestEnabled() });
}

export async function POST(req: Request) {
  if (!harvestEnabled()) {
    return NextResponse.json(
      {
        error:
          "LinkedIn import is off. Set HARVEST_ENABLED=true and APIFY_TOKEN in .env.local to import a real profile.",
      },
      { status: 503 },
    );
  }

  let body: { profileUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const profileUrl =
    typeof body.profileUrl === "string" ? body.profileUrl.trim() : "";

  if (!isLinkedInProfileUrl(profileUrl)) {
    return NextResponse.json(
      { error: "Enter a LinkedIn profile URL, e.g. linkedin.com/in/your-name." },
      { status: 400 },
    );
  }

  try {
    const profile = await fetchOwnProfile(profileUrl);
    if (!profile) {
      return NextResponse.json(
        { error: "That profile could not be read. Check the URL is public." },
        { status: 404 },
      );
    }

    const evidence = profileToEvidence(profile);

    // The profile's own text is untrusted scraped input like any other.
    const name = sanitizeUntrusted(
      [profile.firstName, profile.lastName].filter(Boolean).join(" "),
    ).clean;
    const headline = sanitizeUntrusted(profile.headline ?? "").clean;
    const location = sanitizeUntrusted(
      profile.location?.parsed?.city ?? profile.location?.linkedinText ?? "",
    ).clean;

    return NextResponse.json({
      profile: {
        name,
        headline,
        location,
        linkedinUrl: profile.linkedinUrl,
      },
      evidence,
      provenance: {
        source: "harvestapi" as const,
        linkedinUrl: profile.linkedinUrl,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: harvestSafeMessage(err) }, { status: 502 });
  }
}
