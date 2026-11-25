-- The controls on the manage screen that have never done anything.
--
-- Closing registration, changing the event code, and editing the
-- exchange itself were all local state: the button moved, the screen
-- agreed with itself, and the database never heard about it. The
-- first two had no function to call; the third had no function at
-- all, so "Edit Exchange" walked back through the wizard and ended
-- at the one that creates exchanges, which made a second one.

-- --------------------------------------------------------------------
-- Closing registration before the deadline
--
-- Until now "open" was worked out entirely from the deadline date, so
-- there was nowhere to record an organizer closing it early and
-- nothing for the button to write.
-- --------------------------------------------------------------------

alter table exchanges
  add column registration_closed_at timestamptz;

create or replace function registration_is_open(p_exchange_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exchange_today(p_exchange_id) <= e.registration_deadline
     and e.drawn_at is null
     and e.registration_closed_at is null
  from exchanges e
  where e.id = p_exchange_id;
$$;

create or replace function set_registration_open(
  p_organizer_token text,
  p_open boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  if (select drawn_at from exchanges where id = v_exchange_id) is not null then
    raise exception 'The draw has run, so registration is over either way'
      using errcode = 'check_violation';
  end if;

  update exchanges
  set registration_closed_at = case when p_open then null else now() end
  where id = v_exchange_id;

  -- Reopening cannot undo a deadline that has passed, and saying so
  -- here is kinder than a button that appears to work and changes
  -- nothing anybody can see.
  return jsonb_build_object(
    'open', registration_is_open(v_exchange_id),
    'deadlinePassed', (
      select exchange_today(v_exchange_id) > registration_deadline
      from exchanges where id = v_exchange_id
    )
  );
end;
$$;

-- --------------------------------------------------------------------
-- A new event code
--
-- The button has always warned that existing links stop working. It
-- was not true: the code lived in the browser and the database kept
-- the old one, so the old links kept working and the new code the
-- organizer handed out matched nothing. Now it is true.
-- --------------------------------------------------------------------

create or replace function regenerate_event_code(p_organizer_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
  v_code text;
  v_tries int := 0;
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  if (select drawn_at from exchanges where id = v_exchange_id) is not null then
    raise exception 'The draw has run, so the code is history now'
      using errcode = 'check_violation';
  end if;

  loop
    v_tries := v_tries + 1;

    select upper(string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
             1 + floor(random() * 32)::int, 1), ''))
    into v_code
    from generate_series(1, 6);

    exit when not exists (
      select 1 from exchanges where event_code = v_code
    );

    if v_tries > 20 then
      raise exception 'Could not find a free code' using errcode = 'internal_error';
    end if;
  end loop;

  update exchanges set event_code = v_code where id = v_exchange_id;

  return jsonb_build_object('eventCode', v_code);
end;
$$;

-- --------------------------------------------------------------------
-- Editing the exchange itself
--
-- Only the fields the settings screen offers. Not who the organizer
-- is and not whether they take part: those add or remove an invitee
-- row, which would silently take somebody's registration and their
-- restrictions with it. That one stays where it is until it can be
-- done deliberately.
-- --------------------------------------------------------------------

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

revoke all on function set_registration_open(text, boolean) from public;
revoke all on function regenerate_event_code(text) from public;
revoke all on function update_exchange(text, jsonb) from public;

grant execute on function set_registration_open(text, boolean) to anon;
grant execute on function regenerate_event_code(text) to anon;
grant execute on function update_exchange(text, jsonb) to anon;
