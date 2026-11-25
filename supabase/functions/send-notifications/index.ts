/*
 * Drains the outbox.
 *
 * Runs on the same hourly schedule as the draw, just after it, so an
 * exchange drawn at nine in the morning has its emails on their way
 * within the hour.
 *
 * Deliberately separate from run-draws. drawn_at stops a draw
 * happening twice; nothing stops an email being sent twice, and those
 * want different machinery. Keeping them apart also means a provider
 * outage cannot stop a draw, and a draw that fails cannot stop the
 * emails for an exchange drawn an hour earlier.
 */

import {
  drawFailedEmail,
  drawReminderEmail,
  drawResultEmail,
  formatEmailDate,
  invitationEmail,
  messageWaitingEmail,
  registrationClosedEmail,
  registrationReminderEmail,
  rollCallEmail,
  type Email,
} from "../_shared/templates.ts";

type Claimed = {
  id: string;
  exchangeId: string;
  kind: string;
  to: string;
  name: string;
  exchangeName: string;
  organizerName: string;
  drawDate: string;
  registrationDeadline: string;
  forOrganizer: boolean;
  token: string;
  context: Record<string, unknown>;
  attempt: number;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DRAW_SECRET = Deno.env.get("DRAW_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const SITE_URL =
  Deno.env.get("SITE_URL") ?? "https://mysterynamedraw.com";

/*
 * Replies go somewhere a person reads.
 *
 * People answer these: asking what the budget was, saying they got
 * the wrong name, asking to be taken out. A reply to noreply@ goes
 * nowhere, and somebody who writes one believes they have been
 * ignored rather than unheard.
 */
const FROM = "Mystery Name Draw <noreply@mysterynamedraw.com>";
const REPLY_TO = "contact@mysterynamedraw.com";

async function rpc<T>(name: string, args: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `${name} failed (${response.status}): ${text.slice(0, 300)}`
    );
  }

  return (text ? JSON.parse(text) : null) as T;
}

/** Where this person's own page lives. */
function linkFor(row: Claimed): string {
  return row.forOrganizer
    ? `${SITE_URL}/#/manage/${row.token}`
    : `${SITE_URL}/#/me/${row.token}`;
}

function numberFrom(context: Record<string, unknown>, key: string): number {
  const value = context[key];

  return typeof value === "number" ? value : 0;
}

/**
 * Which email this row is.
 *
 * Returns null for a kind nothing knows how to write, which is a bug
 * rather than a thing to guess at: sending the wrong email is worse
 * than sending none, so it fails loudly and the row comes round again
 * once somebody has added the template.
 */
function render(row: Claimed): Email | null {
  const link = linkFor(row);
  const personal = {
    name: row.name,
    exchangeName: row.exchangeName,
    link,
  };
  const drawDate = formatEmailDate(row.drawDate);
  const registrationDeadline = formatEmailDate(row.registrationDeadline);

  switch (row.kind) {
    case "invitation":
      return invitationEmail({
        ...personal,
        organizerName: row.organizerName,
        registrationDeadline,
        drawDate,
        budget: String(row.context.budget ?? "Not set"),
      });

    case "registration_reminder":
      return registrationReminderEmail({ ...personal, registrationDeadline });

    case "registration_closed":
      return registrationClosedEmail({
        ...personal,
        drawDate,
        people: numberFrom(row.context, "people"),
      });

    case "draw_reminder":
      return drawReminderEmail({ ...personal, drawDate });

    case "draw_result":
      return drawResultEmail(personal);

    case "message_waiting":
      return messageWaitingEmail(personal);

    case "registration_roll_call":
      return rollCallEmail({
        organizerName: row.organizerName,
        exchangeName: row.exchangeName,
        link,
        registered: numberFrom(row.context, "registered"),
        invited: numberFrom(row.context, "invited"),
        drawDate,
      });

    case "draw_failed":
      return drawFailedEmail({
        organizerName: row.organizerName,
        exchangeName: row.exchangeName,
        link,
        reason: String(row.context.reason ?? "No reason was recorded."),
      });

    default:
      return null;
  }
}

/** Hand one email to Resend. Returns its id, for tracing. */
async function send(row: Claimed, email: Email): Promise<string> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [row.to],
      reply_to: REPLY_TO,
      subject: email.subject,
      text: email.body,
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Resend refused (${response.status}): ${body.slice(0, 300)}`);
  }

  return (JSON.parse(body) as { id?: string }).id ?? "";
}

function secretsMatch(offered: string, expected: string): boolean {
  if (offered.length !== expected.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < offered.length; i += 1) {
    difference |= offered.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return difference === 0;
}

Deno.serve(async (request) => {
  const offered =
    request.headers.get("apikey") ??
    (request.headers.get("Authorization") ?? "").replace(/^Bearer /, "");

  if (!DRAW_SECRET || !secretsMatch(offered, DRAW_SECRET)) {
    return new Response(JSON.stringify({ error: "Not authorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!RESEND_API_KEY) {
    // Nothing is claimed, so nothing is marked as attempted: the
    // whole queue waits rather than burning its five tries against a
    // missing key.
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY is not set" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const started = new Date().toISOString();
  const sent: string[] = [];
  const failed: { kind: string; error: string }[] = [];

  let due: Claimed[];

  try {
    due = await rpc<Claimed[]>("claim_notifications", { p_limit: 50 });
  } catch (caught) {
    return new Response(
      JSON.stringify({ at: started, error: String(caught) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  for (const row of due) {
    try {
      const email = render(row);

      if (!email) {
        throw new Error(`No template for "${row.kind}"`);
      }

      const providerId = await send(row, email);

      await rpc("mark_notification_sent", {
        p_id: row.id,
        p_provider_id: providerId,
      });

      sent.push(row.kind);
    } catch (caught) {
      /*
       * One address going wrong must not stop the rest. A typo in one
       * invitee's email should cost that one email, not everybody
       * else's.
       */
      failed.push({ kind: row.kind, error: String(caught) });

      try {
        await rpc("mark_notification_failed", {
          p_id: row.id,
          p_error: String(caught).slice(0, 500),
        });
      } catch {
        // The claim ages out on its own after ten minutes, so a row
        // that cannot even be marked is retried rather than lost.
      }
    }
  }

  return new Response(
    JSON.stringify({ at: started, claimed: due.length, sent, failed }),
    {
      status: failed.length ? 207 : 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
