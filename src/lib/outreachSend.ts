/**
 * Hand a draft to the user's own Gmail. PURE: builds a URL, sends nothing.
 *
 * CareerOS never sends mail. This opens Gmail's compose window with the draft
 * filled in; the user reads it and presses Send themselves. The recipient is
 * included only when the user explicitly looked one up — an address we merely
 * guessed is never put in a To: field.
 */
export function gmailComposeUrl(input: {
  to?: string;
  subject: string;
  body: string;
}): string {
  const params = new URLSearchParams({ view: "cm", fs: "1" });
  const to = input.to?.trim();
  if (to && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to)) params.set("to", to);
  params.set("su", input.subject);
  params.set("body", input.body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}
