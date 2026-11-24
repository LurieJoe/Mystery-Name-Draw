-- Mystery Name Draw: the only way in.
--
-- Every function here is SECURITY DEFINER and takes a token. The tables
-- deny the browser's roles outright, so what these functions return is
-- exactly what a given holder is allowed to know. Two rules decide the
-- shape of all of them:
--
--   The organizer may see who registered and every restriction, because
--   they are the one who has to sort it out when a draw is impossible.
--   They may never see an assignment.
--
--   An invitee may see their own row, their own restrictions, and the
--   names of the other participants, because they need those to choose.
--   They may never see another person's restrictions, their wishlist is
--   their own to write, and after the draw they see one name.
--
-- set search_path on every function: a definer function without one can
-- be hijacked by a caller's search_path.

-- --------------------------------------------------------------------
-- Helpers
-- --------------------------------------------------------------------

create or replace function token_hash(p_token text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

comment on function token_hash is
  'A token in a URL is a password in disguise. Only the hash is stored, '
  'so a copy of this database is not a list of working links.';

create or replace function new_token()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select encode(gen_random_bytes(32), 'hex');
$$;

/* Today where the exchange lives, not where the caller happens to be. */
create or replace function exchange_today(p_exchange_id uuid)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone e.time_zone)::date
  from exchanges e
  where e.id = p_exchange_id;
$$;

create or replace function registration_is_open(p_exchange_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exchange_today(p_exchange_id) <= e.registration_deadline
     and e.drawn_at is null
  from exchanges e
  where e.id = p_exchange_id;
$$;

/*
 * Restrictions open when registration closes: they are choices about
 * the other people in the exchange, so they only mean something once
 * that list is final. They close on the draw date.
 */
create or replace function restrictions_are_open(p_exchange_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exchange_today(p_exchange_id) > e.registration_deadline
     and exchange_today(p_exchange_id) < e.draw_date
     and e.drawn_at is null
  from exchanges e
  where e.id = p_exchange_id;
$$;

/* The exchange a token opens, or null. */
create or replace function exchange_for_organizer(p_token text)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from exchanges
  where organizer_token_hash = token_hash(p_token);
$$;

create or replace function invitee_for_token(p_token text)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from invitees
  where invitee_token_hash = token_hash(p_token);
$$;

-- --------------------------------------------------------------------
-- Creating an exchange
-- --------------------------------------------------------------------

/*
 * Returns the tokens in plain text, the one time they exist: the
 * organizer's, and one per invitee for their registration link. They
 * are not recoverable afterwards, only replaceable.
 */
create or replace function create_exchange(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid;
  v_event_code text;
  v_organizer_token text := new_token();
  v_invitee jsonb;
  v_token text;
  v_invitees jsonb := '[]'::jsonb;
  v_id uuid;
begin
  -- Six characters from an alphabet with no O/0 or I/1, so a code read
  -- down a phone survives the journey.
  v_event_code := upper(
    string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
             1 + floor(random() * 32)::int, 1),
      ''
    )
  )
  from generate_series(1, 6);

  insert into exchanges (
    event_code, name, gift_budget, currency, no_gift_limit,
    registration_deadline, draw_date, time_zone,
    organizer_name, organizer_email, organizer_participates,
    remind_before_registration_deadline, remind_before_draw_date,
    organizer_token_hash
  )
  values (
    v_event_code,
    p_payload ->> 'name',
    p_payload ->> 'giftBudget',
    coalesce(p_payload ->> 'currency', 'USD'),
    coalesce((p_payload ->> 'noGiftLimit')::boolean, false),
    (p_payload ->> 'registrationDeadline')::date,
    (p_payload ->> 'drawDate')::date,
    coalesce(p_payload ->> 'timeZone', 'UTC'),
    p_payload -> 'organizer' ->> 'name',
    p_payload -> 'organizer' ->> 'email',
    coalesce((p_payload -> 'organizer' ->> 'participating')::boolean, true),
    coalesce((p_payload ->> 'remindBeforeRegistrationDeadline')::boolean, false),
    coalesce((p_payload ->> 'remindBeforeDrawDate')::boolean, false),
    token_hash(v_organizer_token)
  )
  returning id into v_exchange_id;

  -- The organizer is an invitee row like anyone else when taking part,
  -- so a restriction naming them survives the checkbox being toggled.
  if coalesce((p_payload -> 'organizer' ->> 'participating')::boolean, true) then
    v_token := new_token();

    insert into invitees (exchange_id, name, email, is_organizer,
                          status, invitee_token_hash)
    values (v_exchange_id,
            p_payload -> 'organizer' ->> 'name',
            p_payload -> 'organizer' ->> 'email',
            true,
            'Registered',
            token_hash(v_token))
    returning id into v_id;

    v_invitees := v_invitees || jsonb_build_object(
      'id', v_id,
      'email', p_payload -> 'organizer' ->> 'email',
      'token', v_token
    );
  end if;

  for v_invitee in
    select * from jsonb_array_elements(coalesce(p_payload -> 'invitees', '[]'::jsonb))
  loop
    v_token := new_token();

    insert into invitees (exchange_id, name, email, invitee_token_hash)
    values (v_exchange_id,
            v_invitee ->> 'name',
            v_invitee ->> 'email',
            token_hash(v_token))
    returning id into v_id;

    v_invitees := v_invitees || jsonb_build_object(
      'id', v_id,
      'email', v_invitee ->> 'email',
      'token', v_token
    );
  end loop;

  return jsonb_build_object(
    'exchangeId', v_exchange_id,
    'eventCode', v_event_code,
    'organizerToken', v_organizer_token,
    'invitees', v_invitees
  );
end;
$$;

-- --------------------------------------------------------------------
-- What the organizer sees
-- --------------------------------------------------------------------

create or replace function organizer_view(p_organizer_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  return (
    select jsonb_build_object(
      'exchange', to_jsonb(e) - 'organizer_token_hash',
      'registrationOpen', registration_is_open(e.id),
      'restrictionsOpen', restrictions_are_open(e.id),
      'invitees', coalesce((
        select jsonb_agg(to_jsonb(i) - 'invitee_token_hash' order by i.created_at)
        from invitees i
        where i.exchange_id = e.id
      ), '[]'::jsonb),
      -- Every restriction, from both sources, because the organizer is
      -- the one who has to free up an impossible draw.
      'restrictions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id,
          'ownerId', r.owner_invitee_id,
          'otherId', r.other_invitee_id,
          'direction', r.direction,
          'setByOrganizer', r.set_by_organizer
        ) order by r.created_at)
        from restrictions r
        where r.exchange_id = e.id
      ), '[]'::jsonb)
      -- No assignments. Not even for the organizer, drawn or not.
    )
    from exchanges e
    where e.id = v_exchange_id
  );
end;
$$;

-- --------------------------------------------------------------------
-- What an invitee sees
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
  where invitee_token_hash = token_hash(p_invitee_token);

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

-- --------------------------------------------------------------------
-- Registering, and choosing restrictions
-- --------------------------------------------------------------------

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
  where invitee_token_hash = token_hash(p_invitee_token);

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
  where invitee_token_hash = token_hash(p_invitee_token);

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
  where invitee_token_hash = token_hash(p_invitee_token);

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

-- --------------------------------------------------------------------
-- After the draw
-- --------------------------------------------------------------------

/* One name, and only their own. */
create or replace function my_assignment(p_invitee_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitee_id uuid := invitee_for_token(p_invitee_token);
begin
  if v_invitee_id is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  return coalesce((
    select jsonb_build_object(
      'name', receiver.name,
      'wishlist', receiver.wishlist,
      'preferences', receiver.preferences
    )
    from assignments a
    join invitees receiver on receiver.id = a.receiver_id
    where a.giver_id = v_invitee_id
  ), jsonb_build_object('name', null));
end;
$$;

-- --------------------------------------------------------------------
-- Permissions
--
-- Nothing is granted on the tables, so the browser can only reach what
-- is listed here.
-- --------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

revoke all on function create_exchange(jsonb) from public;
revoke all on function organizer_view(text) from public;
revoke all on function registration_view(text) from public;
revoke all on function register_participant(text, text, text, text) from public;
revoke all on function set_my_restriction(text, uuid, text) from public;
revoke all on function clear_my_restriction(text, uuid, text) from public;
revoke all on function my_assignment(text) from public;

grant execute on function create_exchange(jsonb) to anon;
grant execute on function organizer_view(text) to anon;
grant execute on function registration_view(text) to anon;
grant execute on function register_participant(text, text, text, text) to anon;
grant execute on function set_my_restriction(text, uuid, text) to anon;
grant execute on function clear_my_restriction(text, uuid, text) to anon;
grant execute on function my_assignment(text) to anon;

-- Deliberately not granted to anon: every helper above, and anything
-- that would run or read the draw. Those belong to the scheduled job,
-- which runs with the service role and never passes through a browser.
