-- "Allow participants to invite others", which until now was a
-- checkbox that did nothing: no state behind it, no handler, and
-- nothing in the schema it could have meant.
--
-- On  (the default): anybody holding the link may join. That is what
--     makes the link shareable, and how somebody's partner or the new
--     person in the office gets in without the organizer doing
--     anything.
-- Off: only the addresses the organizer listed may join. The link
--     still opens and still shows what the exchange is, because the
--     people who were invited need that, but a stranger is turned away
--     rather than quietly added.

alter table exchanges
  add column allow_open_join boolean not null default true;

-- --------------------------------------------------------------------
-- Creating: take the setting from the wizard
-- --------------------------------------------------------------------

create or replace function create_exchange(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
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
    allow_open_join, organizer_token_hash
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
    coalesce((p_payload ->> 'allowOpenJoin')::boolean, true),
    token_hash(v_organizer_token)
  )
  returning id into v_exchange_id;

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
-- Joining: honour the setting
-- --------------------------------------------------------------------

create or replace function join_exchange(
  p_event_code text,
  p_name text,
  p_email text,
  p_wishlist text default null,
  p_preferences text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_exchange exchanges;
  v_existing invitees;
  v_token text := new_token();
  v_id uuid;
  v_name text := btrim(p_name);
  v_email text := lower(btrim(p_email));
begin
  if v_name = '' then
    raise exception 'A name is needed' using errcode = 'check_violation';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That does not look like an email address'
      using errcode = 'check_violation';
  end if;

  select * into v_exchange from exchanges
  where upper(event_code) = upper(btrim(p_event_code));

  if v_exchange.id is null then
    raise exception 'No exchange with that code'
      using errcode = 'no_data_found';
  end if;

  if not registration_is_open(v_exchange.id) then
    raise exception 'Registration has closed for this exchange'
      using errcode = 'check_violation';
  end if;

  select * into v_existing from invitees
  where exchange_id = v_exchange.id and lower(email) = v_email;

  -- Invitation only, and this address was not invited.
  if v_existing.id is null and not v_exchange.allow_open_join then
    raise exception 'This exchange is invitation only. Ask % to add you.', v_exchange.organizer_name
      using errcode = 'insufficient_privilege';
  end if;

  if v_existing.id is not null and v_existing.status = 'Registered' then
    raise exception 'Somebody has already registered with that address. If that was you, use the link from your own registration, or ask % to help.', v_exchange.organizer_name
      using errcode = 'unique_violation';
  end if;

  if v_existing.id is not null then
    update invitees
    set name = v_name,
        wishlist = p_wishlist,
        preferences = p_preferences,
        status = 'Registered',
        registered_at = now(),
        invitee_token_hash = token_hash(v_token)
    where id = v_existing.id
    returning id into v_id;
  else
    insert into invitees (
      exchange_id, name, email, status, wishlist, preferences,
      registered_at, invitee_token_hash
    )
    values (
      v_exchange.id, v_name, v_email, 'Registered', p_wishlist,
      p_preferences, now(), token_hash(v_token)
    )
    returning id into v_id;
  end if;

  return jsonb_build_object(
    'inviteeToken', v_token,
    'registration', registration_view(v_token)
  );
end;
$$;

-- --------------------------------------------------------------------
-- The preview says which kind of exchange this is
-- --------------------------------------------------------------------

create or replace function exchange_preview(p_event_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_exchange exchanges;
begin
  select * into v_exchange from exchanges
  where upper(event_code) = upper(btrim(p_event_code));

  if v_exchange.id is null then
    raise exception 'No exchange with that code'
      using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'name', v_exchange.name,
    'giftBudget', v_exchange.gift_budget,
    'currency', v_exchange.currency,
    'noGiftLimit', v_exchange.no_gift_limit,
    'registrationDeadline', v_exchange.registration_deadline,
    'drawDate', v_exchange.draw_date,
    'organizerName', v_exchange.organizer_name,
    'registrationOpen', registration_is_open(v_exchange.id),
    -- So the page can say "invitation only" before somebody types
    -- their details in and is turned away afterwards.
    'openToAnyone', v_exchange.allow_open_join,
    'drawn', v_exchange.drawn_at is not null
  );
end;
$$;

-- --------------------------------------------------------------------
-- And the organizer can change their mind
-- --------------------------------------------------------------------

create or replace function set_open_join(
  p_organizer_token text,
  p_allowed boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  update exchanges set allow_open_join = p_allowed where id = v_exchange_id;

  return organizer_view(p_organizer_token);
end;
$$;

revoke all on function set_open_join(text, boolean) from public;
grant execute on function set_open_join(text, boolean) to anon;
