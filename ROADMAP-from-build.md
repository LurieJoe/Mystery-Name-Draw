# Known gaps and deferred work

Everything below came up while building, was deliberately not done, and
is written with the reason. Nothing here is a bug in what shipped: the
app works. These are the edges we chose not to take on yet.

Dated 26 November 2026, the night before the first real exchange.

---

## Watch first

**Deliverability.** Email lands in Junk. Authentication is correct and
verified — DKIM published, SPF on `send.mysterynamedraw.com`, DMARC
present — so there is nothing to fix. It is a new domain with no
sending history, and it improves with age and volume. Marking messages
Not Junk helps for that inbox only.

If it is still bad after real traffic, the path is:

1. Replace the `_dmarc` CNAME (IONOS owns its contents) with your own
   TXT record, starting at `v=DMARC1; p=none; rua=mailto:...`.
2. Read the aggregate reports for a week or two.
3. Only then move to `p=quarantine`, and later `p=reject`.

Never set `adkim=s` or `aspf=s`. SPF and DKIM live on the `send.`
subdomain while the From address is at the apex, so strict alignment
would turn passing mail into failing mail — and at `p=reject` that
means invitations stop being delivered.

**The first unattended run.** Every part has worked in production at
least once, but never the whole chain on a schedule with nobody
watching. The draw is the test of that. A failure emails the exchange's
organizer address — worth confirming somebody reads it that day.

---

## v1.1 — small, and each one has a known cause

**Retry a rate limit within the run.** Resend allows ten requests a
second. Sends are now paced to about five, so this should not recur,
but if it does the row waits a full hour for its retry. A 429 means
"slow down", not "something is wrong": the right answer is to pause and
retry in the same run.

**Send invitations immediately as well as hourly.** Queuing is what
gives retries, attempt counts, and error capture, and it should stay.
But the organizer is sitting there having just clicked, and waiting up
to an hour is the one place the delay is visible. The Send button could
fire the sender directly after queuing, exactly as `smoke-fire.sql`
does by hand, leaving the hourly job as the safety net.

**Changing the organizer's own details after creation.** `update_exchange`
deliberately leaves out the organizer's name, address, and whether they
take part. Toggling participation adds or removes an invitee row, which
would silently take a registration and its restrictions with it. Worth
doing on purpose, with a confirmation, not as part of a settings save.

**One home for the currency symbols.** The budget label exists twice —
TypeScript for the screen, SQL for the invitation email — because the
email's label is built in the database. Adding a currency means editing
both plus a migration. If the sender were handed the amount and the
currency instead of a finished string, the symbols would live in one
place. There are tests on both sides so they cannot drift silently,
but it is duplication.

**Check what importing a saved exchange does to a live one.** Import
writes to local state only. Before an exchange exists that is the whole
story; afterwards the database is the source of truth and local state
is overwritten on the next page load. Importing into an existing
exchange may therefore appear to work and quietly do nothing. Not
verified either way — worth ten minutes.

---

## v2 — real features, real work

**Portuguese.** The app and the emails. Browsers will offer to
translate the pages (the `lang` attribute is set correctly) but the
emails stay English, and machine translation of your own copy is
serviceable rather than good. Note: there is a long-standing bug
between React and Chrome's translator — it replaces text nodes and
React can throw when it later updates them, usually showing as a blank
section. It tends to bite where text and links are mixed in one
sentence. Intermittent, and loud when it happens.

**Currency conversion.** Only needed for a genuinely mixed exchange.
The second budget line ("about US$30") is the cheap answer and costs
nothing; live rates need a paid API and are wrong by the time anybody
reads them.

**A reason when a draw cannot resolve.** The validation screen shows
forbidden pairings before the draw, and a failed draw emails the
organizer, but working out *which* restriction made it impossible is
still manual.

---

## Housekeeping

- Two unused logo files, about 2.2 MB, still in the repo.
- A `_to_delete/` folder holding stray files.
- Two `color-scheme` rules patching the date picker specifically. They
  are redundant now that the root follows the page theme, and harmless.
- Exchanges created before 25 November 2026 have no stored
  restrictions, because nothing ever saved them. Any that matter need
  re-ticking.

---

## Decided, not deferred

Recorded so they are not reopened by accident.

- **Messaging is off for the whole exchange or not at all.** A
  per-person mute would let the organizer act on a pairing only they
  can see.
- **The organizer never receives a copy of an invitation.** Each one
  carries the private link to that person's page. They get a receipt
  listing names and addresses instead.
- **A participant's own restrictions are shown to the organizer but
  cannot be undone by them.** They are that person's choice, made on a
  screen the organizer never sees.
- **Quick Draw's two similar purpose cards stay as they are.**
