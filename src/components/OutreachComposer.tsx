"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Mail,
  Linkedin,
  Send,
  Save,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Clock,
  CalendarClock,
  Target,
  Info,
  X,
  Search,
  Loader2,
} from "lucide-react";
import type { OutreachMessage, Person, UnconfirmedEmail } from "@/lib/types";
import { Card, Pill, Button, SectionTitle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  getOutreachStates,
  saveOutreachState,
  type OutreachStatus,
  type StoredOutreachState,
} from "@/lib/outreachStore";

/**
 * Outreach Studio composer (build directive §5.13, §5.14).
 *
 * Left: selectable contacts, each linked to a drafted message.
 * Right: the selected message with a Full/Concise toggle, the recipient,
 * subject, body, and the grounding metadata (objective, personalization,
 * evidence used, claims to verify, timing, warnings).
 *
 * CRITICAL (§5.14): nothing is ever sent automatically. "Send via Gmail"
 * opens a confirmation panel that requires an explicit second "Confirm send"
 * click; only then is the message marked "Sent (demo)". Demo sends are
 * simulated — no real email leaves the app.
 */

type MessageStatus = OutreachStatus;
type Variant = "full" | "concise";

export function OutreachComposer({
  messages,
  people,
}: {
  messages: OutreachMessage[];
  people: Person[];
}) {
  const personById = useMemo(
    () => new Map(people.map((p) => [p.id, p] as const)),
    [people],
  );

  const [selectedId, setSelectedId] = useState<string>(messages[0]?.id ?? "");
  const [variant, setVariant] = useState<Variant>("full");
  const [statuses, setStatuses] = useState<Record<string, MessageStatus>>({});
  const [drafts, setDrafts] = useState<Record<string, StoredOutreachState>>({});
  // Whether the two-step send confirmation panel is open for the selected message.
  const [confirming, setConfirming] = useState(false);

  /**
   * On-demand email lookup (§5.13 + LinkedIn enrichment).
   *
   * Runs for ONE contact, only when the user clicks. Results are held in local
   * state and labeled unconfirmed — nothing here sends, and nothing auto-runs.
   */
  const [lookupAvailable, setLookupAvailable] = useState(false);
  const [emails, setEmails] = useState<Record<string, UnconfirmedEmail | null>>({});
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getOutreachStates();
    setStatuses(Object.fromEntries(Object.entries(stored).map(([id, state]) => [id, state.status])));
    setDrafts(stored);
  }, [messages]);

  useEffect(() => {
    let active = true;
    fetch("/api/harvest/email")
      .then((r) => r.json())
      .then((d) => active && setLookupAvailable(!!d.enabled))
      .catch(() => active && setLookupAvailable(false));
    return () => {
      active = false;
    };
  }, []);

  /**
   * Recent public posts for the SELECTED contact only — fetched lazily, one
   * contact at a time, capped server-side and cached by profile URL. We never
   * bulk-fetch posts for the whole contact list: that would cost real money
   * for people the user never opens.
   */
  const [postsByPerson, setPostsByPerson] = useState<Record<string, string[]>>({});

  async function findEmail(person: Person) {
    if (!person.linkedinUrl) return;
    setLookingUp(person.id);
    setLookupError(null);
    try {
      const res = await fetch("/api/harvest/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileUrl: person.linkedinUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLookupError(data.error ?? "Lookup failed.");
        return;
      }
      setEmails((e) => ({ ...e, [person.id]: data.email ?? null }));
    } catch {
      setLookupError("Could not reach the lookup service.");
    } finally {
      setLookingUp(null);
    }
  }

  const selectedMessage = messages.find((m) => m.id === selectedId) ?? messages[0];
  const selected = selectedMessage
    ? { ...selectedMessage, ...(drafts[selectedMessage.id] ?? {}) }
    : undefined;
  const selectedPerson = selected ? personById.get(selected.personId) : undefined;
  const status = selected ? statuses[selected.id] ?? "unsent" : "unsent";

  const selectedPersonId = selectedPerson?.id;
  const selectedProfileUrl = selectedPerson?.linkedinUrl;
  const postsFetched = selectedPersonId
    ? postsByPerson[selectedPersonId] !== undefined
    : true;

  useEffect(() => {
    if (!lookupAvailable || !selectedPersonId || !selectedProfileUrl) return;
    if (postsFetched) return;

    let active = true;
    fetch("/api/harvest/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileUrl: selectedProfileUrl }),
    })
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => {
        if (!active) return;
        const excerpts: string[] = Array.isArray(d.posts)
          ? d.posts
              .map((p: { excerpt?: string }) => p.excerpt)
              .filter((e: unknown): e is string => typeof e === "string" && !!e)
          : [];
        setPostsByPerson((m) => ({ ...m, [selectedPersonId]: excerpts }));
      })
      .catch(() => {
        // A missing post feed is not an error — the draft stands without it.
        if (active) setPostsByPerson((m) => ({ ...m, [selectedPersonId]: [] }));
      });
    return () => {
      active = false;
    };
  }, [lookupAvailable, selectedPersonId, selectedProfileUrl, postsFetched]);

  /**
   * Merge the engine-built grounding metadata with anything fetched live in
   * this session. The engine already handles these fields when they live on the
   * Person; this covers the lookups the user triggers here and now.
   */
  const livePostExcerpts = selectedPerson
    ? (postsByPerson[selectedPerson.id] ?? [])
    : [];
  const liveEmail = selectedPerson ? emails[selectedPerson.id] : undefined;

  const personalizationFacts = selected
    ? [
        ...selected.personalizationFacts,
        ...livePostExcerpts
          .filter(
            (excerpt) =>
              // Don't repeat what the engine already folded in.
              !selected.personalizationFacts.some((f) => f.includes(excerpt)),
          )
          .map((excerpt) => `From their recent LinkedIn post: "${excerpt}"`),
      ]
    : [];

  const claimsToVerify = selected
    ? [
        ...selected.claimsToVerify,
        ...(liveEmail &&
        !selected.claimsToVerify.some((c) => c.includes(liveEmail.address))
          ? [
              `Email address "${liveEmail.address}" was ${liveEmail.status}. Confirm it is the right person before sending.`,
            ]
          : []),
        ...(livePostExcerpts.length > 0 &&
        !selected.claimsToVerify.some((c) => c.includes("Post excerpts"))
          ? [
              "Post excerpts are quoted from their public LinkedIn activity — re-read the original before referencing it, in case the excerpt lost context.",
            ]
          : []),
      ]
    : [];

  function select(id: string) {
    setSelectedId(id);
    setConfirming(false);
    setLookupError(null);
  }

  function saveDraft() {
    if (!selected) return;
    const state = saveOutreachState(selected.id, {
      status: "draft",
      subject: selected.subject,
      full: selected.full,
      concise: selected.concise,
    });
    setDrafts((d) => ({ ...d, [selected.id]: state }));
    setStatuses((s) => ({ ...s, [selected.id]: "draft" }));
  }

  function confirmSend() {
    if (!selected) return;
    const state = saveOutreachState(selected.id, {
      status: "sent",
      subject: selected.subject,
      full: selected.full,
      concise: selected.concise,
    });
    setDrafts((d) => ({ ...d, [selected.id]: state }));
    setStatuses((s) => ({ ...s, [selected.id]: "sent" }));
    setConfirming(false);
  }

  function updateSelectedDraft(field: "subject" | "full" | "concise", value: string) {
    if (!selected) return;
    setDrafts((current) => ({
      ...current,
      [selected.id]: {
        status: current[selected.id]?.status ?? statuses[selected.id] ?? "unsent",
        subject: field === "subject" ? value : selected.subject,
        full: field === "full" ? value : selected.full,
        concise: field === "concise" ? value : selected.concise,
      },
    }));
  }

  if (!selected) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      {/* Contact list */}
      <aside className="space-y-2">
        <SectionTitle className="px-1">Contacts</SectionTitle>
        <ul className="space-y-2" role="listbox" aria-label="Outreach contacts">
          {messages.map((m) => {
            const person = personById.get(m.personId);
            const active = m.id === selected.id;
            const mStatus = statuses[m.id] ?? "unsent";
            return (
              <li key={m.id}>
                <button
                  role="option"
                  aria-selected={active}
                  onClick={() => select(m.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                    active
                      ? "border-brand-300 bg-brand-50/60 ring-1 ring-brand-200"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {person?.name ?? "Unknown contact"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {person?.title ?? m.objective}
                      </p>
                    </div>
                    <StatusDot status={mStatus} />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                    <ChannelIcon channel={m.channel} className="h-3.5 w-3.5" />
                    <span className="capitalize">{m.channel}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Message detail */}
      <div className="space-y-5">
        <Card>
          {/* Recipient + status + variant toggle */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                To
              </p>
              <p className="text-base font-semibold text-slate-900">
                {selectedPerson?.name ?? "Unknown contact"}
              </p>
              {selectedPerson && (
                <p className="text-sm text-slate-500">
                  {selectedPerson.title} · {selectedPerson.company}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={status} />
              <div
                role="group"
                aria-label="Message length"
                className="inline-flex rounded-lg border border-slate-200 p-0.5"
              >
                {(["full", "concise"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVariant(v)}
                    aria-pressed={variant === v}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                      variant === v
                        ? "bg-brand-600 text-white"
                        : "text-slate-500 hover:text-slate-800",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Channel + subject */}
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <ChannelIcon channel={selected.channel} className="h-4 w-4" />
            <span className="capitalize">{selected.channel}</span>
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Subject
            </p>
            <label htmlFor="outreach-subject" className="sr-only">Subject</label>
            <input
              id="outreach-subject"
              value={selected.subject}
              onChange={(event) => updateSelectedDraft("subject", event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          {/* Body */}
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <label htmlFor="outreach-body" className="sr-only">Message body</label>
            <textarea
              id="outreach-body"
              value={variant === "full" ? selected.full : selected.concise}
              onChange={(event) => updateSelectedDraft(variant, event.target.value)}
              rows={10}
              className="w-full resize-y rounded-lg border border-slate-200 p-3 text-sm leading-relaxed text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          {/* Approval controls — two-step, never auto-send */}
          {status === "sent" ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <CheckCircle2 className="h-4 w-4" />
              Sent (demo) — no real email was sent.
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setConfirming(true)}
                aria-expanded={confirming}
              >
                <Send className="h-4 w-4" />
                Send via Gmail
              </Button>
              <Button variant="secondary" size="sm" onClick={saveDraft}>
                <Save className="h-4 w-4" />
                {status === "draft" ? "Draft saved" : "Save as draft"}
              </Button>

              {/* On-demand, one contact at a time. Never runs automatically. */}
              {lookupAvailable &&
                selectedPerson?.linkedinUrl &&
                emails[selectedPerson.id] === undefined && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => findEmail(selectedPerson)}
                    disabled={lookingUp === selectedPerson.id}
                  >
                    {lookingUp === selectedPerson.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Searching…
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        Find email
                      </>
                    )}
                  </Button>
                )}

              {status === "draft" && (
                <span className="text-xs text-slate-400">Saved locally (demo)</span>
              )}
            </div>
          )}

          {/* Email lookup result — always labeled unconfirmed, never "verified" */}
          {selectedPerson && emails[selectedPerson.id] !== undefined && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              {emails[selectedPerson.id] ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span className="font-mono text-sm text-slate-800">
                      {emails[selectedPerson.id]!.address}
                    </span>
                    <Pill className="bg-amber-50 text-amber-700 ring-amber-600/20">
                      {emails[selectedPerson.id]!.status}
                    </Pill>
                  </div>
                  <p className="mt-2 text-xs leading-snug text-slate-500">
                    The mailbox answered an SMTP check. That is not confirmation
                    that it belongs to {selectedPerson.name} or that they read it
                    — this has been added to the verify-before-sending list below.
                    Nothing was sent.
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-500">
                  No email found for this contact. Reach out on LinkedIn instead.
                </p>
              )}
            </div>
          )}

          {lookupError && (
            <p className="mt-2 flex items-start gap-2 text-xs text-red-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
              {lookupError}
            </p>
          )}

          {/* Two-step confirmation panel (§5.14) */}
          {confirming && status !== "sent" && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Confirm before sending
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      This will send to{" "}
                      <span className="font-medium">
                        {selectedPerson?.name ?? "this contact"}
                      </span>
                      {selected.channel === "email" ? " via Gmail" : ""}. In demo
                      mode no real email is sent.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setConfirming(false)}
                  aria-label="Cancel send"
                  className="shrink-0 text-amber-500 transition-colors hover:text-amber-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={confirmSend}>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm send
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Grounding metadata */}
        <Card>
          <SectionTitle>Why this message</SectionTitle>

          {/* Objective */}
          <div className="mt-3 flex items-start gap-2">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Objective
              </p>
              <p className="mt-0.5 text-sm text-slate-700">{selected.objective}</p>
            </div>
          </div>

          {/* Personalization facts (+ any live post excerpts) */}
          {personalizationFacts.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Personalization
              </p>
              <ul className="mt-1.5 space-y-1">
                {personalizationFacts.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Evidence used — source-backed pills */}
          {selected.evidenceUsed.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Evidence used
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {selected.evidenceUsed.map((e, i) => (
                  <Pill
                    key={i}
                    className="bg-brand-50 text-brand-700 ring-brand-600/20"
                  >
                    <ShieldCheck className="h-3 w-3" /> {e}
                  </Pill>
                ))}
              </div>
            </div>
          )}

          {/* Claims to verify — amber caution (+ any live lookup caveats) */}
          {claimsToVerify.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Verify before sending
              </p>
              <ul className="mt-1.5 space-y-1">
                {claimsToVerify.map((c, i) => (
                  <li key={i} className="text-sm text-amber-800">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {selected.warnings.length > 0 && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Warnings
              </p>
              <ul className="mt-1.5 space-y-1">
                {selected.warnings.map((w, i) => (
                  <li key={i} className="text-sm text-rose-800">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timing */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Recommended send time
                </p>
                <p className="mt-0.5 text-sm text-slate-700">
                  {selected.recommendedSendTime}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Follow up
                </p>
                <p className="mt-0.5 text-sm text-slate-700">
                  {selected.followUpDate}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Small presentational helpers                                      */
/* ---------------------------------------------------------------- */

function ChannelIcon({
  channel,
  className,
}: {
  channel: OutreachMessage["channel"];
  className?: string;
}) {
  return channel === "email" ? (
    <Mail className={className} />
  ) : (
    <Linkedin className={className} />
  );
}

function StatusDot({ status }: { status: MessageStatus }) {
  if (status === "sent")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  if (status === "draft")
    return <Save className="h-4 w-4 shrink-0 text-slate-400" />;
  return null;
}

function StatusBadge({ status }: { status: MessageStatus }) {
  if (status === "sent")
    return (
      <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
        <CheckCircle2 className="h-3 w-3" /> Sent (demo)
      </Pill>
    );
  if (status === "draft")
    return (
      <Pill className="bg-slate-100 text-slate-600 ring-slate-500/20">
        <Save className="h-3 w-3" /> Draft
      </Pill>
    );
  return (
    <Pill className="bg-slate-100 text-slate-500 ring-slate-500/20">Not sent</Pill>
  );
}
