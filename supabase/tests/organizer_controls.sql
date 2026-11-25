-- Closing registration early, changing the code, and editing the
-- exchange. Three buttons that used to move on screen and nowhere
-- else.

\set ON_ERROR_STOP on

create or replace function assert(p_label text, p_condition boolean)
returns void
language plpgsql
as $$
begin
  if p_condition then
    raise notice 'PASS  %', p_label;
  else
    raise exception 'FAIL  %', p_label;
  end if;
end;
$$;

do $$
declare
  v_created jsonb;
  v_exchange_id uuid;
  v_code text;
  v_organizer_token text;
  v_result jsonb;
  v_new_code text;
  v_rowan uuid;
  v_message text;
begin
  v_created := create_exchange(jsonb_build_object(
    'name', 'Office swap',
    'giftBudget', '25',
    'currency', 'USD',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'remindBeforeRegistrationDeadline', true,
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Rowan', 'email', 'rowan@example.com'))
  ));

  v_exchange_id := (v_created ->> 'exchangeId')::uuid;
  v_code := v_created ->> 'eventCode';
  v_organizer_token := v_created ->> 'organizerToken';

  select id into v_rowan from invitees where exchange_id = v_exchange_id;

  -- ------------------------------------------------------------------
  -- Closing registration before the deadline
  -- ------------------------------------------------------------------

  perform assert('registration starts open',
    registration_is_open(v_exchange_id));

  v_result := set_registration_open(v_organizer_token, false);

  perform assert('closing it early really closes it',
    not registration_is_open(v_exchange_id)
    and not (v_result ->> 'open')::boolean);

  perform assert('and the deadline has not passed, which it says',
    not (v_result ->> 'deadlinePassed')::boolean);

  -- The point of closing it: nobody else gets in.
  begin
    perform join_exchange(v_code, 'Latecomer', 'late@example.com');
    perform assert('nobody can join once it is closed', false);
  exception when check_violation then
    perform assert('nobody can join once it is closed', true);
  end;

  v_result := set_registration_open(v_organizer_token, true);

  perform assert('and reopening lets them in again',
    registration_is_open(v_exchange_id)
    and (v_result ->> 'open')::boolean);

  -- Reopening cannot undo a date that has gone by, and says so
  -- rather than appearing to work.
  update exchanges set registration_deadline = current_date - 1,
                       draw_date = current_date + 7
  where id = v_exchange_id;

  v_result := set_registration_open(v_organizer_token, true);

  perform assert('reopening past the deadline is honest about it',
    not (v_result ->> 'open')::boolean
    and (v_result ->> 'deadlinePassed')::boolean);

  update exchanges set registration_deadline = current_date + 7,
                       draw_date = current_date + 21
  where id = v_exchange_id;

  -- ------------------------------------------------------------------
  -- A new event code
  -- ------------------------------------------------------------------

  v_result := regenerate_event_code(v_organizer_token);
  v_new_code := v_result ->> 'eventCode';

  perform assert('a new code is a different code',
    v_new_code is not null and v_new_code <> v_code);

  perform assert('and it is the one the exchange answers to',
    (select event_code from exchanges where id = v_exchange_id) = v_new_code);

  -- The warning on that button has always said this. Now it is true.
  begin
    perform join_exchange(v_code, 'Somebody', 'somebody@example.com');
    perform assert('the old code stops opening anything', false);
  exception when no_data_found then
    perform assert('the old code stops opening anything', true);
  end;

  perform assert('while a personal link is untouched by it',
    (select count(*) from invitees where id = v_rowan) = 1);

  -- ------------------------------------------------------------------
  -- Editing the exchange
  -- ------------------------------------------------------------------

  perform queue_notification(
    v_exchange_id, v_rowan, 'rowan@example.com', 'registration_reminder');

  perform assert('a reminder is waiting for the dates as they stand',
    exists (select 1 from notifications
            where exchange_id = v_exchange_id
              and kind = 'registration_reminder' and sent_at is null));

  v_result := update_exchange(v_organizer_token, jsonb_build_object(
    'name', 'Office swap 2026',
    'giftBudget', '40',
    'currency', 'GBP',
    'registrationDeadline', (current_date + 10)::text,
    'drawDate', (current_date + 24)::text,
    'remindBeforeDrawDate', true
  ));

  perform assert('the name and the budget change',
    (select name from exchanges where id = v_exchange_id) = 'Office swap 2026'
    and gift_budget_label(v_exchange_id) = '£40 GBP');

  perform assert('and both dates move together',
    (select registration_deadline from exchanges where id = v_exchange_id)
      = current_date + 10
    and (select draw_date from exchanges where id = v_exchange_id)
      = current_date + 24);

  perform assert('a reminder addressed to the old dates is dropped',
    not exists (select 1 from notifications
                where exchange_id = v_exchange_id
                  and kind = 'registration_reminder' and sent_at is null));

  perform assert('and what it returns is the exchange as it now stands',
    v_result -> 'exchange' ->> 'name' = 'Office swap 2026');

  begin
    perform update_exchange(v_organizer_token, jsonb_build_object(
      'name', 'Office swap 2026',
      'registrationDeadline', (current_date + 20)::text,
      'drawDate', (current_date + 10)::text));
    perform assert('the draw cannot be moved before registration closes', false);
  exception when check_violation then
    get stacked diagnostics v_message = message_text;
    perform assert('the draw cannot be moved before registration closes', true);
    -- The table constraint refuses it too, but reports itself by its
    -- own name. An organizer reading "draw_after_registration" learns
    -- nothing about what they just did.
    perform assert('and says so in words rather than by constraint name',
      v_message not like '%draw_after_registration%'
      and v_message like '%before registration closes%');
  end;

  perform assert('and nothing moved when it was refused',
    (select draw_date from exchanges where id = v_exchange_id)
      = current_date + 24);

  begin
    perform update_exchange(v_organizer_token,
      jsonb_build_object('name', '   '));
    perform assert('an exchange cannot be left nameless', false);
  exception when check_violation then
    perform assert('an exchange cannot be left nameless', true);
  end;

  begin
    perform update_exchange('not-a-token',
      jsonb_build_object('name', 'Hijacked'));
    perform assert('a token nobody holds changes nothing', false);
  exception when no_data_found then
    perform assert('a token nobody holds changes nothing', true);
  end;

  perform assert('so the name is still the organizer''s own',
    (select name from exchanges where id = v_exchange_id) = 'Office swap 2026');

  -- ------------------------------------------------------------------
  -- Once the draw has run
  -- ------------------------------------------------------------------

  update exchanges set drawn_at = now() where id = v_exchange_id;

  begin
    perform set_registration_open(v_organizer_token, true);
    perform assert('registration cannot reopen after the draw', false);
  exception when check_violation then
    perform assert('registration cannot reopen after the draw', true);
  end;

  begin
    perform regenerate_event_code(v_organizer_token);
    perform assert('the code cannot change after the draw', false);
  exception when check_violation then
    perform assert('the code cannot change after the draw', true);
  end;

  begin
    perform update_exchange(v_organizer_token,
      jsonb_build_object('name', 'Too late'));
    perform assert('and neither can the exchange itself', false);
  exception when check_violation then
    perform assert('and neither can the exchange itself', true);
  end;

  raise notice '';
  raise notice 'All organizer control checks passed.';
end;
$$;
