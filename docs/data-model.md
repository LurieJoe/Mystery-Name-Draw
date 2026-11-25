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

To check the rules on your own machine before trusting them:

```
./supabase/run-tests.sh "postgres://localhost/mnd_test"
```

Every check raises on failure, so a non-zero exit means a promise is
broken. There are 64, and they cover the claims worth doubting: that
one participant cannot see another's choices, that an organizer-set
restriction stays hidden from the person it is about, that no organizer
view contains an assignment before or after the draw, and that a
receiver can hold a whole conversation with their gifter without ever
learning who they are.

## The free plan has one sharp edge

Supabase pauses a free project after a week without database activity,
and a paused project stays down until someone resumes it from the
dashboard. An exchange created in October for a draw on 20 December
would sit idle for weeks. The draw would not run, and every invitation
link would error.

Two ways out. Pay for the Pro plan, which is never paused, or keep the
project awake. A scheduled GitHub Action that reads one row every few
days costs nothing and uses the CI you already have, which is why
`.github/workflows/keep-supabase-awake.yml` exists. Setting that up,
and the second pinger that covers its blind spot, is written out in
`docs/keeping-it-awake.md`.

It is worth knowing that this makes an unattended draw depend on a cron
job staying green. If you would rather not carry that, the Pro plan is
the thing that removes the failure mode rather than working around it.

## Joining from the shared link

The app has one registration link for everybody, and the FAQ says so.
The schema did not: `registration_view` wants a token that only
`create_exchange` hands out, so only people the organizer had already
listed could ever appear. `0005` adds the two functions that make the
link work as described.

`exchange_preview(code)` is what a stranger holding the code may see:
the name, the dates, the budget, and whether registration is open.
No names, no count, nothing about anybody already in it.

`join_exchange(code, name, email, ...)` registers them and returns the
token that is theirs from then on. An address the organizer already
listed claims that row rather than making a second one, so the wishlist
lands where the organizer expects it.

**An address that has already registered is refused.** Matching on
email is how an invited person gets recognised, but it would also mean
anybody holding the code and a guess at a colleague's address could be
handed that colleague's token, and with it their wishlist, their
restrictions, and eventually the name they drew. Refusing costs a real
person one message to the organizer; not refusing costs somebody their
privacy, quietly. There is a test that fails if the check is removed.

## Anonymous messaging

Joe draws Evelyn. He wants to ask which candle scents she dislikes;
she wants to ask her gifter for something specific. Neither question
can be asked out loud without spoiling the draw.

**A thread is an assignment.** There is exactly one conversation per
drawn pair, and everyone is in two of them: one where they are the
giver and know perfectly well who they are writing to, and one where
they are the receiver and do not. The anonymity runs one way only,
because the giver knows the receiver by definition. The app has to make
that unambiguous on screen: "the person you drew" and "whoever drew
you" are two different conversations.

**Nothing travels by email.** A reply in an inbox carries an address,
and an address is a name. The notification says a message is waiting
and links back; the message itself only ever exists in the app.

**The organizer sees none of it.** Not the messages, not who has a
thread, not how many exist. A thread *is* an assignment, so anything
revealing one reveals the draw. There is no organizer function that
returns a message or counts one.

That last point has a consequence worth facing: it removes the usual
way to moderate. If somebody is unpleasant, the organizer cannot be
shown who sent it without being handed a pairing. For now their only
lever is blunt and safe: switch messaging off for the whole exchange.
If that proves too blunt in practice, the next least-revealing option
is a report that escalates the message text with no identity attached,
which lets the organizer judge the content and still not learn the
draw. That is a decision to take with a real complaint in hand rather
than in the abstract.

Rate limited to 20 messages per person per thread per day. An anonymous
channel is the one place in this app where someone can be unpleasant at
no cost, so it should not also be an unlimited one.

## Still missing

- **The draw itself**, as an Edge Function. `src/draw/assignment.ts` was
  written with no dependencies for exactly this: the same code can run
  there unchanged. It must run on the server, because a browser that
  computes the assignments has by definition seen them.
- **The notification email** for a waiting message. The two functions
  it needs (`pending_message_notifications` and `mark_notified`) are
  written and are deliberately unreachable from the browser: the job
  sees a pairing by necessity, which is exactly why it runs as the
  service role in an Edge Function and never in a page.
- **Email**, via Resend. When that is wired up, the SPF record at IONOS
  must be *edited*, never added to. Two `v=spf1` records is the same as
  having none.
- **The client**, which still keeps everything in React state. The
  functions above are shaped to match what `useExchange` already does,
  so this is a swap rather than a rewrite.
