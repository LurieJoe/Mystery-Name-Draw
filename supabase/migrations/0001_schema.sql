-- Mystery Name Draw: tables and row level security.
--
-- Nobody has an account. Access is by two unguessable tokens instead:
-- one the organizer keeps, and one in each invitee's registration link.
-- A token in a URL is a password in disguise, so only the SHA-256 of
-- each one is stored. A copy of this database is then not a list of
-- working links.
--
-- Every table denies the anon and authenticated roles outright. Nothing
-- is readable or writable directly from the browser: all access goes
-- through the SECURITY DEFINER functions in 0002_functions.sql, which
-- take a token, check it, and return only what that holder may see.

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------
-- Exchanges
-- --------------------------------------------------------------------

create table exchanges (
  id uuid primary key default gen_random_uuid(),

  -- The short code in every link, e.g. /#/event/ABC123.
  event_code text not null unique,

  name text not null,

  -- Budget is shown, never calculated with, so it stays as entered.
  gift_budget text,
  currency text not null default 'USD',
  no_gift_limit boolean not null default false,

  registration_deadline date not null,
  draw_date date not null,

  -- Every deadline in this app is a calendar date, and a calendar date
  -- only means something in a place. The organizer's IANA zone is
  -- captured when the exchange is created, so "the deadline has passed"
  -- is decided here rather than by whichever browser happens to ask.
  time_zone text not null default 'UTC',

  organizer_name text not null,
  organizer_email text not null,
  organizer_participates boolean not null default true,

  remind_before_registration_deadline boolean not null default false,
  remind_before_draw_date boolean not null default false,

  organizer_token_hash text not null,

  created_at timestamptz not null default now(),

  -- Set when the draw has run. Its presence is what stops it running
  -- twice; see claim_exchange_for_draw.
  drawn_at timestamptz,

  constraint draw_after_registration
    check (draw_date >= registration_deadline)
);

create index exchanges_draw_date_idx on exchanges (draw_date)
  where drawn_at is null;

-- --------------------------------------------------------------------
-- Invitees
--
-- A person is an invitee from the moment the organizer adds them, and a
-- participant only once they have registered. The draw uses the latter.
-- --------------------------------------------------------------------

create table invitees (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references exchanges (id) on delete cascade,

  name text not null,
  email text not null,

  status text not null default 'Invite Pending'
    check (status in ('Invite Pending', 'Invited', 'Registered')),

  -- Written by the invitee at registration, never by the organizer.
  wishlist text,
  preferences text,

  -- The organizer taking part is an invitee row like anyone else, so a
  -- restriction naming them survives "Include me" being toggled.
  is_organizer boolean not null default false,

  invitee_token_hash text not null,

  -- Set when they opt out; they keep their row and their restrictions.
  unsubscribed_at timestamptz,

  invited_at timestamptz,
  registered_at timestamptz,

  created_at timestamptz not null default now()
);

-- One row per person per exchange, whatever case they typed their
-- address in. An expression like lower(email) is not allowed in a
-- table-level UNIQUE constraint, so it is an index.
create unique index invitees_one_email_idx
  on invitees (exchange_id, lower(email));

create index invitees_exchange_idx on invitees (exchange_id);
create unique index invitees_one_organizer_idx
  on invitees (exchange_id) where is_organizer;

-- --------------------------------------------------------------------
-- Restrictions
--
-- Owned and one-way. "Won't give to" and "won't receive from" are
-- different things, and one person's choice says nothing about the
-- other's, so two people can express the same underlying constraint as
-- two rows. The draw collapses them; the lists do not.
--
-- owner_invitee_id is always the person the restriction speaks for, so
-- direction keeps its meaning. set_by_organizer records who entered it:
-- the organizer can add one on somebody's behalf, in case that person
-- forgets. Both sources are honoured equally by the draw.
--
-- The two are separate rows on purpose. They are in the unique key, so
-- a participant's own choice and the organizer's safety net for the
-- same pairing coexist: the participant sees only their own, and
-- deleting theirs does not silently delete the organizer's.
-- --------------------------------------------------------------------

create table restrictions (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references exchanges (id) on delete cascade,

  owner_invitee_id uuid not null references invitees (id) on delete cascade,
  other_invitee_id uuid not null references invitees (id) on delete cascade,

  direction text not null check (direction in ('give', 'receive')),

  -- False: the owner's own choice, and theirs to see and remove.
  -- True:  entered by the organizer for them, and never shown to them.
  set_by_organizer boolean not null default false,

  created_at timestamptz not null default now(),

  constraint not_against_themselves
    check (owner_invitee_id <> other_invitee_id),

  constraint one_restriction_per_choice
    unique (exchange_id, owner_invitee_id, other_invitee_id,
            direction, set_by_organizer)
);

create index restrictions_exchange_idx on restrictions (exchange_id);

-- --------------------------------------------------------------------
-- Assignments
--
-- The secret. Written once by the draw, and read one row at a time by
-- the person it belongs to. The organizer never reads this table, even
-- though they own the exchange: that is the whole promise of the app,
-- and it is enforced by there being no function that returns more than
-- the caller's own row.
-- --------------------------------------------------------------------

create table assignments (
  exchange_id uuid not null references exchanges (id) on delete cascade,
  giver_id uuid not null references invitees (id) on delete cascade,
  receiver_id uuid not null references invitees (id) on delete cascade,

  created_at timestamptz not null default now(),

  primary key (exchange_id, giver_id),

  -- One present each, in both directions.
  constraint one_receiver_per_exchange unique (exchange_id, receiver_id),
  constraint nobody_draws_themselves check (giver_id <> receiver_id)
);

-- --------------------------------------------------------------------
-- Row level security
--
-- Enabled with no policies, which denies everything to anon and
-- authenticated. The functions in 0002 are SECURITY DEFINER and run as
-- the owner, so they are the only way in.
-- --------------------------------------------------------------------

alter table exchanges enable row level security;
alter table invitees enable row level security;
alter table restrictions enable row level security;
alter table assignments enable row level security;

-- Deliberately not FORCE: the SECURITY DEFINER functions run as the
-- table owner, and forcing RLS on the owner with no policies in place
-- would lock out the only legitimate way in. The secrecy of this table
-- rests on there being no function that returns more than the caller's
-- own row, not on a policy.
