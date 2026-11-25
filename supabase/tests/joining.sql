-- Joining from the shared link: who may, who may not, and what each
-- one learns.

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
  v_joined jsonb;
  v_evelyn_token text;
  v_preview jsonb;
  v_rowan uuid;
begin
  v_created := create_exchange(jsonb_build_object(
    'name', 'Book swap',
    'giftBudget', '20',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Rowan', 'email', 'rowan@example.com'))
  ));

  v_exchange_id := (v_created ->> 'exchangeId')::uuid;
  v_code := v_created ->> 'eventCode';
  v_organizer_token := v_created ->> 'organizerToken';

  select (value ->> 'id')::uuid into v_rowan
  from jsonb_array_elements(v_created -> 'invitees')
  where value ->> 'email' = 'rowan@example.com';

  -- A stranger with the code, before joining.
  v_preview := exchange_preview(v_code);
  perform assert('a preview names the exchange and its dates',
    v_preview ->> 'name' = 'Book swap'
    and (v_preview ->> 'registrationOpen')::boolean);
  perform assert('and says nothing about who is in it',
    not (v_preview ? 'invitees') and not (v_preview ? 'participants')
    and v_preview::text not like '%rowan@example.com%'
    and v_preview::text not like '%Rowan%');

  perform assert('the code is not case sensitive, since people retype it',
    exchange_preview(lower(v_code)) ->> 'name' = 'Book swap');

  begin
    perform exchange_preview('ZZZZZZ');
    perform assert('an unknown code is refused', false);
  exception when no_data_found then
    perform assert('an unknown code is refused', true);
  end;

  -- Somebody the organizer never listed.
  v_joined := join_exchange(v_code, 'Evelyn', 'evelyn@example.com',
    'Books about birds', 'Nothing with vanilla');
  v_evelyn_token := v_joined ->> 'inviteeToken';

  perform assert('a stranger can join and is given a token',
    length(v_evelyn_token) = 64);
  perform assert('and is registered straight away',
    v_joined -> 'registration' -> 'me' ->> 'status' = 'Registered');
  perform assert('with what they wrote',
    v_joined -> 'registration' -> 'me' ->> 'wishlist' = 'Books about birds');

  -- Somebody the organizer did list: their row, not a second one.
  v_joined := join_exchange(v_code, 'Rowan Hale', 'ROWAN@example.com', null, null);
  perform assert('an invited address claims the row it was invited as',
    (select count(*) from invitees
     where exchange_id = v_exchange_id and lower(email) = 'rowan@example.com') = 1);
  perform assert('matching on the address ignores case',
    (select id from invitees
     where exchange_id = v_exchange_id and lower(email) = 'rowan@example.com') = v_rowan);
  perform assert('and the organizer sees them as registered',
    (select status from invitees where id = v_rowan) = 'Registered');

  -- The trap: anybody with the code plus a guess at an address.
  begin
    perform join_exchange(v_code, 'Not Evelyn', 'evelyn@example.com', null, null);
    perform assert('an address that already registered cannot be taken over', false);
  exception when unique_violation then
    perform assert('an address that already registered cannot be taken over', true);
  end;

  perform assert('and the real person''s token still works',
    registration_view(v_evelyn_token) -> 'me' ->> 'name' = 'Evelyn');

  -- Rubbish in.
  begin
    perform join_exchange(v_code, '   ', 'someone@example.com', null, null);
    perform assert('a blank name is refused', false);
  exception when check_violation then
    perform assert('a blank name is refused', true);
  end;

  begin
    perform join_exchange(v_code, 'Someone', 'not-an-email', null, null);
    perform assert('a malformed address is refused', false);
  exception when check_violation then
    perform assert('a malformed address is refused', true);
  end;

  -- After the deadline.
  update exchanges set registration_deadline = current_date - 1
  where id = v_exchange_id;

  begin
    perform join_exchange(v_code, 'Late', 'late@example.com', null, null);
    perform assert('joining after the deadline is refused', false);
  exception when check_violation then
    perform assert('joining after the deadline is refused', true);
  end;

  perform assert('the preview says registration is closed',
    not (exchange_preview(v_code) ->> 'registrationOpen')::boolean);

  -- The organizer sees everybody who joined, listed or not.
  perform assert('the organizer sees the stranger too',
    (select count(*) from jsonb_array_elements(
      organizer_view(v_organizer_token) -> 'invitees')) = 2);

  -- --------------------------------------------------------------
  -- Invitation only
  -- --------------------------------------------------------------

  perform assert('an exchange is open to anyone by default',
    (exchange_preview(v_code) ->> 'openToAnyone')::boolean);

  declare
    v_shut jsonb;
    v_shut_code text;
    v_shut_organizer text;
    v_listed uuid;
  begin
    v_shut := create_exchange(jsonb_build_object(
      'name', 'Family only',
      'registrationDeadline', (current_date + 7)::text,
      'drawDate', (current_date + 21)::text,
      'timeZone', 'America/New_York',
      'allowOpenJoin', false,
      'organizer', jsonb_build_object(
        'name', 'Dana', 'email', 'dana2@example.com', 'participating', false),
      'invitees', jsonb_build_array(
        jsonb_build_object('name', 'Mina', 'email', 'mina@example.com'))
    ));

    v_shut_code := v_shut ->> 'eventCode';
    v_shut_organizer := v_shut ->> 'organizerToken';

    perform assert('an invitation-only exchange says so in its preview',
      not (exchange_preview(v_shut_code) ->> 'openToAnyone')::boolean);

    perform assert('and still shows what it is, since invited people need that',
      exchange_preview(v_shut_code) ->> 'name' = 'Family only');

    begin
      perform join_exchange(v_shut_code, 'Stranger', 'stranger@example.com', null, null);
      perform assert('a stranger is turned away', false);
    exception when insufficient_privilege then
      perform assert('a stranger is turned away', true);
    end;

    perform assert('while an invited address still gets in',
      length(join_exchange(v_shut_code, 'Mina', 'mina@example.com', null, null)
             ->> 'inviteeToken') = 64);

    -- The organizer changes their mind.
    perform set_open_join(v_shut_organizer, true);

    perform assert('opening it up lets the stranger in after all',
      length(join_exchange(v_shut_code, 'Stranger', 'stranger@example.com', null, null)
             ->> 'inviteeToken') = 64);

    perform set_open_join(v_shut_organizer, false);

    begin
      perform join_exchange(v_shut_code, 'Another', 'another@example.com', null, null);
      perform assert('and shutting it again turns the next one away', false);
    exception when insufficient_privilege then
      perform assert('and shutting it again turns the next one away', true);
    end;
  end;

  raise notice '';
  raise notice 'All joining checks passed.';
end;
$$;
