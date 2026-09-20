import { NextResponse } from "next/server";
import { harvestEnabled, harvestSafeMessage } from "@/lib/harvest/client";
import { findContactEmail } from "@/lib/harvest/network";
import { isLinkedInProfileUrl } from "@/lib/harvest/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Integration point 5, per-contact email lookup.
 *
 * The ONLY call in the app that uses an email-search scraper mode, and it runs
 * for exactly ONE profile per request, only from an explicit user click. Email
 * mode is never a default and is never used for the bulk employee list.
 *
 * The returned address is always labeled "found + SMTP-checked, unconfirmed"
 * and is added to the outreach message's "claims you must verify yourself"
 * list. Nothing is sent as a result of this call.
 */

/** GET, is live lookup configured? Used to decide whether to show the action. */
export function GET() {
  return NextResponse.json({ enabled: harvestEnabled() });
}

export async function POST(req: Request) {
  if (!harvestEnabled()) {
    return NextResponse.json(
      { error: "Email lookup is off." },
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
      { error: "A LinkedIn profile URL is required." },
      { status: 400 },
    );
  }

  try {
    const email = await findContactEmail(profileUrl);
    if (!email) {
      // A miss is a normal outcome, not an error, email is never guaranteed.
      return NextResponse.json({
        email: null,
        message: "No email found for this contact. Reach out on LinkedIn instead.",
      });
    }
    return NextResponse.json({ email });
  } catch (err) {
    return NextResponse.json({ error: harvestSafeMessage(err) }, { status: 502 });
  }
}
