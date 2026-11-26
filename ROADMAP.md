# Mystery Name Draw Roadmap

Private planning, architecture, roadmap, and product management repository for the Mystery Name Draw project.

Last reviewed 26 November 2026, the morning of the first real exchange.

---

# Product Vision

Create a privacy-first platform that enables anonymous exchanges while preventing organizers from viewing assignments.

The platform should support:

- Gift exchanges
- Book exchanges
- Board game swaps
- Office celebrations
- Community events
- Hobby-group exchanges

---

# Core Differentiator

Organizers manage events.

Participants receive assignments.

Organizers never see assignment relationships.

This is the primary product value proposition, and it's enforced rather than promised: `organizer_view` returns no assignments at all, drawn or not, and the functions that can see a pairing are granted only to the service role. No browser can reach them.

## The second differentiator

Nobody signs up for anything.

No accounts, no passwords, no app to install. Each person's identity is a secret link, which means a grandmother in another country can take part by tapping an email. This is what makes the first one affordable: there's no account for an organizer to log into and nothing for them to be tempted by.

## The third

Anonymous two-way messaging.

A giver can write to the person they drew. A receiver can write back to whoever drew them, and never finds out who that is. Two conversations, neither of which leaks the draw.

---

# Technology Decisions

Settled, not TBD.

## Frontend

- React with TypeScript
- Vite
- Static site on GitHub Pages, no server of its own
- Hash routing, hand-rolled, because GitHub Pages has no SPA fallback

Not Next.js: there's no server-side rendering requirement, and a static bundle costs nothing to host.

## Backend

- Supabase: Postgres, row-level security, Edge Functions (Deno), pg_cron, Vault
- All writes go through `security definer` functions. Row-level security is on with no policies, so nothing is reachable except through a function that was deliberately granted.

## Email

- Resend, sending as `hello@mysterynamedraw.com`
- Queued to an outbox table, drained hourly by a scheduled Edge Function
- Retries with attempt counts and error capture; five attempts before a row is given up on

## Notifications

### MVP
- Email

### Future
- SMS
- Push notifications

---

# Milestones

## Milestone 1 – Foundation — DONE

- [x] Register domain
- [x] Finalize branding
- [x] Create repositories
- [x] Select technology stack
- [x] Database schema
- ~~Architecture diagrams~~ — dropped. The migrations and the typed client are the architecture; a diagram would be documentation of documentation.

---

## Milestone 2 – MVP — DONE

- [x] Event creation
- [x] Registration links
- [x] Participant registration
- [x] Wishlist collection
- [x] Draw algorithm
- [x] Email notifications
- [x] Organizer dashboard

Success Criteria:

A real-world event can be completed end-to-end using email notifications.

Status: in progress. The first real exchange has 13 people across the United States and Brazil. Registration closes Friday 27 November; the draw runs Saturday 28 November. This criterion is answered on Saturday and not before.

---

## Milestone 3 – Beta — MOSTLY DONE

- [x] Participant editing
- [x] Event editing
- [x] Registration management — close early, reopen, regenerate the event code
- [x] Exclusion support — in both directions, and from both sides
- [ ] User testing
- [ ] Bug fixes

Success Criteria:

Multiple groups successfully run exchanges.

Notes:

Exclusions are richer than the original line suggests. An organizer can set them on somebody's behalf, and a participant can set their own; the organizer sees both but can only undo their own, because the other is that person's private choice. Each one works in a single direction, so refusing to give to somebody doesn't stop them giving to you.

---

## Milestone 4 – Monetization

- [ ] Pricing strategy
- [ ] Payment integration
- [ ] Premium features
- [ ] Usage limits

Success Criteria:

First paid event processed.

Constraint, recorded rather than discovered later:

Resend Pro is $20/month and is running now. The standing rule is no recurring costs for an app that isn't earning, so this milestone has a clock on it that started in November 2026. The free tier is the obvious lever — see Quick Draw below, which needs no email at all.

---

## Milestone 5 – Premium Features

- [ ] SMS notifications
- [ ] Reminder campaigns
- [ ] Advanced event templates
- [ ] AI gift suggestions — see the question below
- [ ] AI wishlist summaries — see the question below

Open question, to be decided deliberately:

Both AI features mean sending participants' wishlists to a model. That may be fine, but it cuts against the privacy-first positioning at the top of this document, and the decision shouldn't be inherited from a bullet list. Before building either, write down where that data goes, whether it leaves the account, and what a participant is told.

---

## Milestone 6 – Launch

- [ ] Landing page
- [ ] Privacy policy
- [ ] Terms of service
- [ ] Production deployment
- [ ] ~~App Store submission~~ — questioned

The landing page, privacy policy, and production deployment already exist. App Store submission is worth justifying before doing: the whole point is that nobody installs anything or creates an account, and a participant arrives by tapping a link in an email. A listing may be a shell with nothing behind it, unlike the other Brain Bench apps where installation is the product.

---

# Features Built But Not Previously On This Roadmap

## Anonymous messaging

Two threads per assignment. The giver sees the name of the person they drew; the receiver only ever sees "Your Giver." Organizers can switch it off for a whole exchange, but not per person — a per-person mute would let the one person who can see every pairing act on something only they know.

## Quick Draw

A standalone, on-the-spot draw. Paste a list of names, pick what the draw is for, get the result on screen. No email, no exchange, no accounts, nothing stored.

This is the strongest candidate for a permanent free tier, since it costs nothing to run.

## Shared email addresses

Several people can share one inbox — a mother and two daughters giving separately and all reading the same address. Each gets their own row, their own link, and their own email. The shared registration link uses the name typed to tell them apart, and refuses rather than guesses when it can't.

## Opting out of reminders

A participant can turn reminders off and still receive the one email that matters — their draw result — plus any private messages. Said plainly in the opt-out confirmation.

---

# Database Schema

Ten tables, not three. The shape that matters:

## exchanges

The event. Name, dates, budget and currency, a free-text second budget line for mixed-currency exchanges, time zone, organizer name and address, whether the organizer takes part, reminder settings, whether anyone with the link may join, whether messaging is on, when registration was closed early, when the draw ran, and a hash of the organizer's management token.

## invitees

A person in one exchange. Name, email, status (Invite Pending, Invited, Registered), wishlist, preferences, whether they're the organizer, whether they joined themselves, when they opted out of reminders, and a hash of their personal token.

Several rows may share an email address.

## assignments

Who gives to whom. Reachable only by the service role. Never returned to any browser, including the organizer's.

## restrictions

Who must not be matched with whom, in a single direction, with a flag for whether the organizer set it or the person did.

## messages

The two anonymous threads per assignment.

## notifications

The outbox. Every email is a row here first: kind, recipient, context, when it may be sent, when it was claimed, when it was sent, how many attempts, and the last error. This is what makes retries, rate-limit recovery, and after-the-fact diagnosis possible.

## invitee_tokens and exchange_tokens

Links that were mailed out, hashed, with an expiry. Separate from the person's primary token so that an emailed link can be retired — when an address is corrected, for instance — without locking somebody out of a link they're already using.

## Notes

- There is no phone column. SMS is a future idea; carrying the field now invites building for it.
- Tokens are never stored in the clear. Nothing in the database can be read back into a working link.

---

# Operational Risks

Not features. These are what can go wrong while nobody's watching.

## Deliverability

Email currently lands in Junk. Authentication is correct and verified — DKIM published, SPF on the sending subdomain, DMARC present — so there's nothing to fix. It's a new domain with no sending history, and it improves with age and volume.

If it's still bad after real traffic: replace the `_dmarc` CNAME with your own TXT record at `p=none` with a `rua=` address, read the reports for a week or two, then move to `p=quarantine` and later `p=reject`.

Never set `adkim=s` or `aspf=s`. SPF and DKIM live on the `send.` subdomain while the From address is at the apex, so strict alignment would turn passing mail into failing mail — and at `p=reject` that means invitations stop being delivered.

## Sending at scale

Resend allows ten requests a second. One exchange of thirteen people exceeded that and four emails were refused; sends are now paced to about five a second. Several exchanges drawing on the same morning is a different problem, and the pacing fix doesn't solve it. Watch for it before the next December.

## Unattended runs

Every part has worked in production, but the whole chain has never run on a schedule with nobody watching. The draw is the test. A failure emails the exchange's organizer address, so that needs to be an inbox somebody reads that day.

---

# Next — v1.1

Small, and each has a known cause.

- [ ] Retry a rate limit within the run rather than waiting an hour. A 429 means "slow down," not "something is wrong."
- [ ] Fire the sender immediately after queueing invitations, keeping the hourly job as the safety net. The organizer is sitting there having just clicked, and it's the one place the delay is visible.
- [ ] Let the organizer change their own details and whether they take part. Deliberately excluded for now: toggling participation adds or removes an invitee row and would silently take a registration and its restrictions with it.
- [ ] One home for the currency symbols. The budget label exists twice — TypeScript for the screen, SQL for the email — because the email's label is built in the database. Tests on both sides stop them drifting silently, but it's duplication.
- [ ] Check what importing a saved exchange does to a live one. Import writes to local state only, so it may appear to work and quietly do nothing. Unverified.

---

# Next — v2

- [ ] Portuguese, for the app and the emails. Browsers will offer to translate the pages; the emails stay English either way. Note a long-standing bug between React and Chrome's translator, which can blank a section where text and links are mixed in one sentence.
- [ ] Currency conversion, only for genuinely mixed exchanges. The free-text second budget line is the cheap answer; live rates need a paid API and are stale by the time anyone reads them.
- [ ] Explain why a draw can't resolve. The validation screen shows forbidden pairings beforehand and a failure emails the organizer, but working out which restriction made it impossible is still manual.

---

# Decided, Not Deferred

Recorded so they aren't reopened by accident.

- Messaging is off for a whole exchange or not at all.
- The organizer never receives a copy of an invitation — each carries the private link to that person's page. They get a receipt listing names and addresses instead.
- A participant's own restrictions are shown to the organizer but can't be undone by them.
- Quick Draw's two similar purpose cards stay as they are.
- No phone number is stored until SMS is real.

---

# Housekeeping

- [ ] Two unused logo files, about 2.2 MB, still in the repo
- [ ] A `_to_delete/` folder holding stray files
- [ ] Two redundant `color-scheme` rules patching the date picker, now that the root follows the page theme
- [ ] Exchanges created before 25 November 2026 have no stored restrictions, because nothing ever saved them

---

# Future Ideas

- Previous-year exclusion logic — needs history across exchanges, which nothing currently keeps
- Spouse exclusion logic — largely covered by organizer-set restrictions today
- Multi-round exchanges
- Team exchanges
- Book recommendations
- Charity exchange events
- Corporate event templates
- Recurring annual exchanges
