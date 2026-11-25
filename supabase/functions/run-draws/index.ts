/*
 * Runs every draw that is due.
 *
 * Invoked on a schedule, hourly. Each run asks the database which
 * exchanges have passed nine in the morning on their own draw date,
 * in their own time zone, and draws them. An exchange whose date
 * passed while nothing was running is still due, so a missed hour
 * catches up rather than skipping somebody's Christmas.
 *
 * The matching is the algorithm from src/draw/assignment.ts, copied
 * into _shared by scripts/sync-shared.cjs and kept identical by a
 * check in the build. It is not reimplemented here and it is not
 * reimplemented in SQL.
 */

import {
  findAssignment,
  type DrawFailure,
  type DrawPerson,
} from "../_shared/assignment.ts";

type Drawable = {
  id: string;
  name: string;
  eventCode: string;
  timeZone: string;
  organizerName: string;
  organizerEmail: string;
  people: DrawPerson[];
  forbidden: { giverId: string; receiverId: string }[];
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Postgres, through PostgREST, as the service role. */
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
      `${name} failed (${response.status}): ${text.slice(0, 400)}`
    );
  }

  return (text ? JSON.parse(text) : null) as T;
}

/**
 * Why a draw could not be made, in words an organizer can act on.
 *
 * The algorithm returns the set of givers whose permitted recipients
 * are collectively too few, which is the actual obstruction rather
 * than the first pairing that happened to fail. Naming those people is
 * what lets somebody fix it.
 */
function explainFailure(
  failure: DrawFailure,
  exchange: Drawable
): string {
  const nameFor = (id: string) =>
    exchange.people.find((person) => person.id === id)?.name ?? "somebody";

  if (exchange.people.length < 2) {
    return exchange.people.length === 0
      ? "Nobody registered for this exchange, so there was no draw to make."
      : "Only one person registered, so there was nobody to match them with.";
  }

  const blocked = failure.blockedGiverIds.map(nameFor);
  const list =
    blocked.length === 1
      ? blocked[0]
      : blocked.length === 2
      ? `${blocked[0]} and ${blocked[1]}`
      : `${blocked.slice(0, -1).join(", ")}, and ${blocked.at(-1)}`;

  return (
    `The restrictions on this exchange leave no valid draw. ` +
    `Between them, ${list} cannot be matched with enough people. ` +
    `Removing one restriction is usually enough. Open your management ` +
    `link to see them and decide which to set aside.`
  );
}

Deno.serve(async (request) => {
  /*
   * Only the scheduler. Drawing is not destructive on its own, but the
   * draw date is part of the promise this app makes, and an endpoint
   * anybody can poke is one somebody can use to find out which
   * exchanges exist.
   */
  const offered = request.headers.get("Authorization") ?? "";

  if (!SERVICE_KEY || offered !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: "Not authorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const started = new Date().toISOString();
  const drawn: string[] = [];
  const failed: { exchange: string; reason: string }[] = [];
  const errored: { exchange: string; error: string }[] = [];

  let due: Drawable[];

  try {
    due = await rpc<Drawable[]>("claim_due_draws", {});
  } catch (caught) {
    // Nothing was claimed, so nothing is stranded: the next run tries
    // again from the same place.
    return new Response(
      JSON.stringify({ at: started, error: String(caught) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  for (const exchange of due) {
    try {
      const result =
        exchange.people.length < 2
          ? ({
              ok: false,
              blockedGiverIds: exchange.people.map((p) => p.id),
              availableReceiverIds: [],
            } as DrawFailure)
          : findAssignment(exchange.people, exchange.forbidden);

      if (result.ok) {
        await rpc("record_draw", {
          p_exchange_id: exchange.id,
          p_pairs: result.assignments,
        });

        drawn.push(exchange.eventCode);
      } else {
        const reason = explainFailure(result, exchange);

        await rpc("fail_draw", {
          p_exchange_id: exchange.id,
          p_reason: reason,
        });

        failed.push({ exchange: exchange.eventCode, reason });
      }
    } catch (caught) {
      /*
       * One exchange going wrong must not stop the others: on a busy
       * morning this run is the only thing standing between a dozen
       * other exchanges and their draw date. The claim on this one
       * ages out and a later run retries it.
       */
      errored.push({
        exchange: exchange.eventCode,
        error: String(caught),
      });
    }
  }

  return new Response(
    JSON.stringify({
      at: started,
      claimed: due.length,
      drawn,
      failed,
      errored,
    }),
    {
      status: errored.length ? 500 : 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
