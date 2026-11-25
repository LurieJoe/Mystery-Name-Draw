-- The outbox.
--
-- Every email this app sends is a row here first, written in the same
-- transaction as the thing it tells somebody about. That ordering is
-- the whole point: record_draw writes the assignments and queues the
-- emails together, so a draw can never succeed with nobody told, and
-- a send that fails can be retried without running the draw again.
-- drawn_at stops a second draw; nothing stopped a second send, and
-- those need to be different mechanisms.
--
-- What is deliberately NOT here: who drew whom. A notification names
-- its recipient and the kind of thing it is, and the sender reads the
-- secret at send time from that person's own assignment. Copying the
-- drawn name into this table would make a second place where the
-- whole draw can be read, and the promise this app makes is that
-- there is no such place.

create table notifications (
  id uuid primary key default gen_random_uuid(),

  exchange_id uuid not null references exchanges (id) on delete cascade,

  -- Null for the organizer, who may not be taking part and so may not
  -- have an invitee row at all.
  invitee_id uuid references invitees (id) on delete cascade,

  -- Captured rather than joined at send time: somebody who withdraws
  -- between the draw and the send should still be told, and an
  -- address that changes later should not silently redirect an email
  -- that was already queued.
  to_email text not null,

  kind text not null check (kind in (
    'invitation',
    'registration_reminder',
    'registration_closed',
    'draw_reminder',
    'draw_result',
    'draw_failed',
    'message_waiting',
    -- To the organizer rather than a participant.
    'registration_roll_call'
  )),

  -- Context a template needs that is not a secret: dates, the
  -- exchange name, how many people registered. Never the drawn name.
  context jsonb not null default '{}'::jsonb,

  -- Nine in the morning, local to the exchange, is decided when the
  -- row is written, so the sender only has to ask what is ready now.
  send_after timestamptz not null default now(),

  claimed_at timestamptz,
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text,

  -- What the provider called it, so a complaint about a missing email
  -- can be traced rather than guessed at.
  provider_id text,

  created_at timestamptz not null default now()
);

-- One of each kind per person per exchange. A retry updates its row;
-- it does not add another. Without this, a sender that crashed after
-- sending but before marking would send again on the next run, and
-- the second copy of "here is who you drew" is the one that makes
-- somebody doubt the first.
create unique index notifications_once_idx
  on notifications (exchange_id, kind, coalesce(invitee_id, exchange_id));

-- The sender's query: what is ready, oldest first.
create index notifications_pending_idx
  on notifications (send_after)
  where sent_at is null;

alter table notifications enable row level security;

-- --------------------------------------------------------------------
-- Links that arrive by email
--
-- An email has to open the recipient's own page on a device that may
-- never have visited the site, so it must carry a token. Only hashes
-- are stored, and the raw token an invitee holds lives in their
-- browser, so there is nothing to put in a link.
--
-- Minting a fresh one into invitees.invitee_token_hash would work and
-- would log them out everywhere else: somebody who registered on
-- their phone would find it dead the moment the email reached their
-- laptop. So an invitee may hold several valid tokens, each with a
-- purpose, and a new one for an email takes nothing away.
-- --------------------------------------------------------------------

create table invitee_tokens (
  token_hash text primary key,

  invitee_id uuid not null references invitees (id) on delete cascade,

  purpose text not null check (purpose in ('email_link')),

  -- A link in an inbox is a credential that outlives the exchange it
  -- was for. Thirty days past the draw covers the shopping, the
  -- event, and somebody looking up what they bought; after that it
  -- stops being useful and starts being only a risk.
  expires_at timestamptz not null,

  created_at timestamptz not null default now()
);

create index invitee_tokens_invitee_idx on invitee_tokens (invitee_id);

alter table invitee_tokens enable row level security;

/*
 * Which invitee a token opens, from either place.
 *
 * Replaces the 0002 version, which knew only about the column. The
 * column stays the primary one: it is what registering hands back and
 * what withdrawing retires.
 *
 * Still STABLE, and that is load-bearing rather than tidy. my_assignment
 * and my_thread are STABLE and call this. A STABLE function may not
 * write, so a version of this that stamped a last-used time would fail
 * at runtime for every person opening their own page - the one path
 * that has to work on the morning of the draw.
 */
create or replace function invitee_for_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    (select id from invitees
     where invitee_token_hash = token_hash(p_token)),
    (select invitee_id from invitee_tokens
     where token_hash = token_hash(p_token)
       and expires_at > now())
  );
$$;


-- --------------------------------------------------------------------
-- Teaching the rest of the functions about the second kind of token
--
-- These five found their caller with
--
--   where invitee_token_hash = token_hash(p_invitee_token)
--
-- which only ever matches the token handed out at registration. An
-- email link would open my_assignment, which goes through
-- invitee_for_token, and nothing else: somebody following it from a
-- new device could see the name they drew and not their own page.
--
-- Reproduced from 0002 and 0007 verbatim apart from that one line, so
-- the diff between what ran before and what runs now is the lookup
-- and nothing else.
-- --------------------------------------------------------------------

create or replace function registration_view(p_invitee_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitee invitees;
begin
  select * into v_invitee from invitees
  where id = invitee_for_token(p_invitee_token);

  if v_invitee.id is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  return (
    select jsonb_build_object(
      'exchange', jsonb_build_object(
        'name', e.name,
        'giftBudget', e.gift_budget,
        'currency', e.currency,
        'noGiftLimit', e.no_gift_limit,
        'registrationDeadline', e.registration_deadline,
        'drawDate', e.draw_date,
        'organizerName', e.organizer_name,
        'drawn', e.drawn_at is not null
      ),
      'registrationOpen', registration_is_open(e.id),
      'restrictionsOpen', restrictions_are_open(e.id),
      'me', jsonb_build_object(
        'id', v_invitee.id,
        'name', v_invitee.name,
        'email', v_invitee.email,
        'status', v_invitee.status,
        'wishlist', v_invitee.wishlist,
        'preferences', v_invitee.preferences,
        'unsubscribed', v_invitee.unsubscribed_at is not null
      ),
      -- Names only, and only of people who registered: enough to choose
      -- a restriction, and nothing about anyone's wishlist or choices.
      'others', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name)
                         order by i.name)
        from invitees i
        where i.exchange_id = e.id
          and i.id <> v_invitee.id
          and i.status = 'Registered'
      ), '[]'::jsonb),
      -- Their own choices only. A restriction the organizer entered for
      -- them is honoured by the draw and never shown here.
      'myRestrictions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'otherId', r.other_invitee_id,
          'direction', r.direction
        ) order by r.created_at)
        from restrictions r
        where r.owner_invitee_id = v_invitee.id
          and not r.set_by_organizer
      ), '[]'::jsonb)
    )
    from exchanges e
    where e.id = v_invitee.exchange_id
  );
end;
$$;

create or replace function register_participant(
  p_invitee_token text,
  p_name text,
  p_wishlist text,
  p_preferences text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitee invitees;
begin
  select * into v_invitee from invitees
  where id = invitee_for_token(p_invitee_token);

  if v_invitee.id is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  if not registration_is_open(v_invitee.exchange_id) then
    raise exception 'Registration has closed for this exchange'
      using errcode = 'check_violation';
  end if;

  update invitees
  set name = coalesce(nullif(trim(p_name), ''), name),
      wishlist = p_wishlist,
      preferences = p_preferences,
      status = 'Registered',
      registered_at = coalesce(registered_at, now())
  where id = v_invitee.id;

  return registration_view(p_invitee_token);
end;
$$;

create or replace function set_my_restriction(
  p_invitee_token text,
  p_other_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitee invitees;
begin
  select * into v_invitee from invitees
  where id = invitee_for_token(p_invitee_token);

  if v_invitee.id is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  if not restrictions_are_open(v_invitee.exchange_id) then
    raise exception 'Restrictions are not open for this exchange'
      using errcode = 'check_violation';
  end if;

  -- Only against somebody in the same exchange.
  if not exists (
    select 1 from invitees
    where id = p_other_id and exchange_id = v_invitee.exchange_id
  ) then
    raise exception 'That person is not in this exchange'
      using errcode = 'foreign_key_violation';
  end if;

  insert into restrictions (exchange_id, owner_invitee_id,
                            other_invitee_id, direction, set_by_organizer)
  values (v_invitee.exchange_id, v_invitee.id, p_other_id, p_direction, false)
  on conflict do nothing;

  return registration_view(p_invitee_token);
end;
$$;

create or replace function clear_my_restriction(
  p_invitee_token text,
  p_other_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitee invitees;
begin
  select * into v_invitee from invitees
  where id = invitee_for_token(p_invitee_token);

  if v_invitee.id is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  if not restrictions_are_open(v_invitee.exchange_id) then
    raise exception 'Restrictions are not open for this exchange'
      using errcode = 'check_violation';
  end if;

  -- Only ever their own. The organizer's safety net for the same
  -- pairing is a separate row and is not touched here.
  delete from restrictions
  where owner_invitee_id = v_invitee.id
    and other_invitee_id = p_other_id
    and direction = p_direction
    and not set_by_organizer;

  return registration_view(p_invitee_token);
end;
$$;

create or replace function withdraw_registration(p_invitee_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_invitee invitees;
  v_exchange exchanges;
begin
  select * into v_invitee from invitees
  where id = invitee_for_token(p_invitee_token);

  if v_invitee.id is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  select * into v_exchange from exchanges where id = v_invitee.exchange_id;

  -- After the draw there is an assignment pointing at them and somebody
  -- shopping for them. Leaving is no longer something the app can do on
  -- its own, so the organizer has to sort it out.
  if v_exchange.drawn_at is not null then
    raise exception 'The draw has already happened, so ask % to take you out.', v_exchange.organizer_name
      using errcode = 'check_violation';
  end if;

  -- The organizer's own row belongs to the exchange rather than to
  -- them. "Include me in the draw" on the management screen is how
  -- that one comes out, and it has to be, because removing it here
  -- would leave the exchange without the row its restrictions name.
  if v_invitee.is_organizer then
    raise exception 'The organizer leaves the draw from the exchange settings, not from here'
      using errcode = 'check_violation';
  end if;

  if v_invitee.self_joined then
    -- Restrictions in both directions go with the row: owner_invitee_id
    -- and other_invitee_id both cascade from invitees.
    delete from invitees where id = v_invitee.id;

    return jsonb_build_object('rejoined', false, 'rowKept', false);
  end if;

  -- Their own choices go. A restriction the organizer entered about
  -- them is the organizer's, and survives, so a safety net set because
  -- two people do not get along is still there if they come back.
  delete from restrictions
  where owner_invitee_id = v_invitee.id
    and not set_by_organizer;

  -- And every link that was emailed to them. Rotating the column
  -- below retires the token they registered with and would leave
  -- these working: somebody who took themselves out of an exchange
  -- could still be walked back into it by anyone holding an old
  -- email. The self-joined branch above does not need this, because
  -- deleting the row cascades.
  delete from invitee_tokens where invitee_id = v_invitee.id;

  update invitees
  set status = 'Invited',
      wishlist = null,
      preferences = null,
      registered_at = null,
      -- Not nullable, and leaving the old one in place would leave a
      -- working link in whatever they forwarded it to. A fresh token
      -- nobody holds retires it without emptying the column.
      invitee_token_hash = token_hash(new_token())
  where id = v_invitee.id;

  return jsonb_build_object('rejoined', false, 'rowKept', true);
end;
$$;
