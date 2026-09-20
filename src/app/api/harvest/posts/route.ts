import { NextResponse } from "next/server";
import { harvestEnabled, harvestSafeMessage } from "@/lib/harvest/client";
import { fetchContactPosts } from "@/lib/harvest/network";
import { isLinkedInProfileUrl } from "@/lib/harvest/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Integration point 5, recent public posts for one contact, used as outreach
 * personalization material.
 *
 * No-email mode; posts only. Excerpts are already sanitized by the mapper, so
 * what comes back is inert text. The caller still treats it strictly as
 * quoted DATA about the contact, never as instructions.
 */
export async function POST(req: Request) {
  if (!harvestEnabled()) {
    return NextResponse.json({ error: "Post lookup is off." }, { status: 503 });
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
    const posts = await fetchContactPosts(profileUrl);
    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json({ error: harvestSafeMessage(err) }, { status: 502 });
  }
}
