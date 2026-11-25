-- A second line on the budget, for an exchange in two currencies.
--
-- A draw with people in the United States and people in Brazil has
-- one budget and two ways of saying it. Converting between them would
-- need live rates, a paid API, and a number that is wrong by the time
-- anybody reads it. A line the organizer writes themselves - "about
-- US$30" - costs nothing, never goes stale in a way that misleads,
-- and says exactly what they meant.
--
-- Free text on purpose. It is read by people, not by the draw.
--
-- The four functions below are reproduced to carry one more field.
-- They were lifted from their current definitions rather than
-- retyped, so the only difference from what is running now is the
-- line each one gains.

alter table exchanges
  add column gift_budget_note text;

-- --------------------------------------------------------------------
-- The label every screen and the invitation email print
-- --------------------------------------------------------------------

create or replace function gift_budget_label(p_exchange_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when e.no_gift_limit then 'No limit'
    when coalesce(trim(e.gift_budget), '') = '' then 'Not set'
    -- The note is a gloss on an amount, so it goes inside this branch
    -- rather than after the whole thing. With no limit, or no amount,
    -- there is nothing for it to be a second way of saying, and a
    -- note left over from before would otherwise still reach the
    -- invitation email.
    else case e.currency
           when 'GBP' then '£'
           when 'EUR' then '€'
           when 'BRL' then 'R$'
           when 'USD' then '$'
           when 'CAD' then '$'
           when 'AUD' then '$'
           else ''
         end || trim(e.gift_budget) || ' ' || e.currency
         || case
              when coalesce(trim(e.gift_budget_note), '') = '' then ''
              else ' (' || trim(e.gift_budget_note) || ')'
            end
  end
  from exchanges e
  where e.id = p_exchange_id;
$$;

-- --------------------------------------------------------------------
-- Carrying the note to the four places that hand a budget to a browser
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
    event_code, name, gift_budget, gift_budget_note, currency, no_gift_limit,
    registration_deadline, draw_date, time_zone,
    organizer_name, organizer_email, organizer_participates,
    remind_before_registration_deadline, remind_before_draw_date,
    allow_open_join, organizer_token_hash
  )
  values (
    v_event_code,
    p_payload ->> 'name',
    p_payload ->> 'giftBudget',
    p_payload ->> 'giftBudgetNote',
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

create or replace function registration_view(p_invitee_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
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
        'eventCode', e.event_code,
        'name', e.name,
        'giftBudget', e.gift_budget,
        'giftBudgetNote', e.gift_budget_note,
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
      -- Names only, and only of people who registered: enough to
      -- choose a restriction, and nothing about anyone's wishlist or
      -- choices.
      'others', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name)
                         order by i.name)
        from invitees i
        where i.exchange_id = e.id
          and i.id <> v_invitee.id
          and i.status = 'Registered'
      ), '[]'::jsonb),
      -- Their own choices only. A restriction the organizer entered
      -- for them is honored by the draw and never shown here.
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
    'giftBudgetNote', v_exchange.gift_budget_note,
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

create or replace function update_exchange(
  p_organizer_token text,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
  v_deadline date;
  v_draw date;
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  if (select drawn_at from exchanges where id = v_exchange_id) is not null then
    raise exception 'The draw has run, so the exchange is settled'
      using errcode = 'check_violation';
  end if;

  if v_name = '' then
    raise exception 'The exchange needs a name'
      using errcode = 'check_violation';
  end if;

  v_deadline := coalesce(
    (p_payload ->> 'registrationDeadline')::date,
    (select registration_deadline from exchanges where id = v_exchange_id));

  v_draw := coalesce(
    (p_payload ->> 'drawDate')::date,
    (select draw_date from exchanges where id = v_exchange_id));

  -- The table constraint says the same thing, but it reports itself
  -- as a constraint name rather than as something an organizer did.
  if v_draw < v_deadline then
    raise exception 'The draw cannot be before registration closes'
      using errcode = 'check_violation';
  end if;

  -- Both dates move together, so neither passes through a moment
  -- where it disagrees with the other.
  update exchanges
  set name = v_name,
      gift_budget = p_payload ->> 'giftBudget',
      gift_budget_note = p_payload ->> 'giftBudgetNote',
      currency = coalesce(p_payload ->> 'currency', currency),
      no_gift_limit = coalesce(
        (p_payload ->> 'noGiftLimit')::boolean, no_gift_limit),
      registration_deadline = v_deadline,
      draw_date = v_draw,
      remind_before_registration_deadline = coalesce(
        (p_payload ->> 'remindBeforeRegistrationDeadline')::boolean,
        remind_before_registration_deadline),
      remind_before_draw_date = coalesce(
        (p_payload ->> 'remindBeforeDrawDate')::boolean,
        remind_before_draw_date)
  where id = v_exchange_id;

  /*
   * A reminder queued for a date that has just moved is addressed to
   * the old plan. Nothing sent can be recalled, but anything still
   * waiting is wrong now, and queue_due_notifications will put back
   * whichever of them the new dates call for.
   */
  delete from notifications
  where exchange_id = v_exchange_id
    and sent_at is null
    and kind in ('registration_reminder', 'draw_reminder',
                 'registration_closed', 'registration_roll_call');

  return organizer_view(p_organizer_token);
end;
$$;

-- create or replace keeps the existing privileges, but stating them
-- costs nothing and means this file stands on its own if it is ever
-- read without the four it inherits from.
revoke all on function gift_budget_label(uuid) from public, anon;

grant execute on function create_exchange(jsonb) to anon;
grant execute on function registration_view(text) to anon;
grant execute on function exchange_preview(text) to anon;
grant execute on function update_exchange(text, jsonb) to anon;
