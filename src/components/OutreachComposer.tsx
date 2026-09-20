"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Mail,
  Send,
  Save,
  CheckCircle2,
  AlertTriangle,
  Search,
  Loader2,
} from "lucide-react";
import type { OutreachMessage, Person, UnconfirmedEmail } from "@/lib/types";
import { Card, Pill, Button, SectionTitle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  ChannelIcon,
  OutreachGrounding,
  SendConfirmPanel,
  StatusBadge,
  StatusDot,
} from "@/components/OutreachGrounding";
import { gmailComposeUrl } from "@/lib/outreachSend";
import {
  getOutreachStates,
  saveOutreachState,
  type OutreachStatus,
  type StoredOutreachState,
} from "@/lib/outreachStore";

/**
 * Outreach Studio composer (§5.13, §5.14). Left: contacts. Right: the selected
 * draft; its grounding lives in OutreachGrounding.
 *
 * CRITICAL: nothing is ever sent automatically. "Send via Gmail" needs a second
 * explicit click. Demo campaigns then simulate the send; real ones open the
 * draft in the user's own Gmail, where THEY press Send.
 */

type MessageStatus = OutreachStatus;
type Variant = "full" | "concise";

export function OutreachComposer({
  messages,
  people,
  isDemo = true,
}: {
  messages: OutreachMessage[];
  people: Person[];
  /** Demo campaigns simulate the send; real ones hand off to Gmail. */
  isDemo?: boolean;
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
    const current = drafts[selected.id];
    const subject = current?.subject ?? selected.subject;
    const full = current?.full ?? selected.full;
    const concise = current?.concise ?? selected.concise;
    // Outside the demo, "send" means: open the user's own Gmail with the draft
    // filled in. THEY press Send there. We cannot see whether they did, so the
    // message is recorded as a draft, never as sent.
    const handOff = !isDemo && selected.channel === "email";
    if (handOff) {
      window.open(
        gmailComposeUrl({
          to: liveEmail?.address,
          subject,
          body: variant === "full" ? full : concise,
        }),
        "_blank",
        "noopener,noreferrer",
      );
    }
    const state = saveOutreachState(selected.id, {
      status: handOff ? "draft" : "sent",
      subject,
      full,
      concise,
    });
    setDrafts((d) => ({ ...d, [selected.id]: state }));
    setStatuses((s) => ({ ...s, [selected.id]: state.status }));
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
            <SendConfirmPanel
              recipient={selectedPerson?.name ?? "this contact"}
              viaGmail={selected.channel === "email"}
              handsOff={!isDemo && selected.channel === "email"}
              onConfirm={confirmSend}
              onCancel={() => setConfirming(false)}
            />
          )}
        </Card>

        <OutreachGrounding
          selected={selected}
          personalizationFacts={personalizationFacts}
          claimsToVerify={claimsToVerify}
        />
      </div>
    </div>
  );
}
