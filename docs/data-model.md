# How registration will work

Nothing in the app survives a page load today. An invitee opens their
link, types a wishlist, and it exists only in that browser tab. This is
the design that fixes that, written as SQL you can run, and tested
against a real Postgres before it goes anywhere near your account.

## The problem it has to solve

There are no accounts, for anyone. That is the promise on the landing
page and it rules out the usual answer, where the database decides what
you may see from who you are logged in as.

So access is by two unguessable tokens instead:

- **The organizer's token.** Created with the exchange, and part of the
  management link. Whoever holds it is the organizer.
- **An invitee's token.** One per person, part of their registration
  link. Whoever holds it is that person.

A token in a URL is a password in disguise, so only its SHA-256 is
stored. A copy of the database is not a list of working links.

Every table denies the browser's roles outright. Nothing is readable
from the front end at all. The only way in is a set of functions that
take a token, check it, and return exactly what that holder may see.
That is what makes the two promises enforceable rather than merely
intended:

- The organizer sees who registered and every restriction, because they
  are the one who has to free up an impossible draw. There is no
  function that returns an assignment to them. Not before the draw, not
  after.
- A participant sees their own row, their own restrictions, and the
  names of the other registered people, because they need those to
  choose. After the draw they see one name.

## The tables

| Table | What it holds |
| --- | --- |
| `exchanges` | Name, budget, both dates, the organizer's details, and the time zone |
| `invitees` | One row per person, their status, and what they wrote at registration |
| `restrictions` | One row per choice, owned and one-way |
| `assignments` | The secret. Written by the draw, read one row at a time |

Two details worth knowing.

**The time zone lives on the exchange.** Every deadline here is a
calendar date, and a calendar date only means something in a place. The
organizer's zone is captured when the exchange is created, so "the
deadline has passed" is settled in one place rather than by whichever
browser happens to ask. The app currently decides this from the
visitor's own clock, which is wrong for anyone travelling.

**A restriction records who entered it.** `owner_invitee_id` is always
the person it speaks for, so "won't give to" keeps its meaning.
`set_by_organizer` says whether that person chose it or you added it for
them in case they forget. Both are honoured by the draw, and only a
person's own choices are ever shown back to them.

They are separate rows on purpose. If Grace sets a restriction and you
have already set the same one for her, both exist: she sees only hers,
and her removing it does not silently remove your safety net.

## What you do, when you are ready

1. Create a project at supabase.com. The free plan is enough.
2. Open the SQL editor and run `supabase/migrations/0001_schema.sql`,
   then `0002_functions.sql`.
3. Copy the project URL and the **anon** key into the app's environment.
   The anon key is meant to be public; it can only reach the functions
   above. The **service role** key must never go in this repo or into
   anything the browser downloads.

To check the access rules on your own machine before trusting them:

```
psql "$DATABASE_URL" -f supabase/migrations/0001_schema.sql \
                     -f supabase/migrations/0002_functions.sql \
                     -f supabase/tests/access.sql
```

Every check raises on failure, so a non-zero exit means a promise is
broken. There are 25 of them, and they cover the ones that matter: that
one participant cannot see another's choices, that an organizer-set
restriction stays hidden from the person it is about, and that no
organizer view contains an assignment before or after the draw.

## The free plan has one sharp edge

Supabase pauses a free project after a week without database activity,
and a paused project stays down until someone resumes it from the
dashboard. An exchange created in October for a draw on 20 December
would sit idle for weeks. The draw would not run, and every invitation
link would error.

Two ways out. Pay for the Pro plan, which is never paused, or keep the
project awake. A scheduled GitHub Action that reads one row every few
days costs nothing and uses the CI you already have, which is why
`.github/workflows/keep-supabase-awake.yml` exists. It does nothing
until the two repository secrets are set, so it is harmless to commit
now.

It is worth knowing that this makes an unattended draw depend on a cron
job staying green. If you would rather not carry that, the Pro plan is
the thing that removes the failure mode rather than working around it.

## Still missing

- **The draw itself**, as an Edge Function. `src/draw/assignment.ts` was
  written with no dependencies for exactly this: the same code can run
  there unchanged. It must run on the server, because a browser that
  computes the assignments has by definition seen them.
- **Email**, via Resend. When that is wired up, the SPF record at IONOS
  must be *edited*, never added to. Two `v=spf1` records is the same as
  having none.
- **The client**, which still keeps everything in React state. The
  functions above are shaped to match what `useExchange` already does,
  so this is a swap rather than a rewrite.
