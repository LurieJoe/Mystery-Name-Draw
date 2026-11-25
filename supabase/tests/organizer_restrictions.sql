-- Restrictions the organizer sets after the exchange exists.
--
-- The draw reads these, and the person they are about never sees
-- them, so the two things that matter are that they survive and that
-- they stay inside the exchange they were set in.

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
  v_organizer_token text;
  v_invitee_token text;
  v_rowan uuid;
  v_mina uuid;
  v_theo uuid;
  v_other jsonb;
  v_outsider uuid;
  v_view jsonb;
  v_joined jsonb;
begin
  v_created := create_exchange(jsonb_build_object(
    'name', 'Restricted swap',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Rowan', 'email', 'rowan@example.com'),
      jsonb_build_object('name', 'Mina', 'email', 'mina@example.com'),
      jsonb_build_object('name', 'Theo', 'email', 'theo@example.com'))
  ));

  v_exchange_id := (v_created ->> 'exchangeId')::uuid;
  v_organizer_token := v_created ->> 'organizerToken';

  select id into v_rowan from invitees
  where exchange_id = v_exchange_id and email = 'rowan@example.com';
  select id into v_mina from invitees
  where exchange_id = v_exchange_id and email = 'mina@example.com';
  select id into v_theo from invitees
  where exchange_id = v_exchange_id and email = 'theo@example.com';

  -- ------------------------------------------------------------------
  -- Setting one
  -- ------------------------------------------------------------------

  perform set_organizer_restriction(
    v_organizer_token, v_rowan, v_mina, 'give');

  perform assert('a restriction set afterwards is stored',
    exists (select 1 from restrictions
            where exchange_id = v_exchange_id
              and owner_invitee_id = v_rowan
              and other_invitee_id = v_mina
              and direction = 'give'
              and set_by_organizer));

  perform assert('and the draw can see it',
    (select count(*) from restrictions
     where exchange_id = v_exchange_id) = 1);

  -- Clicking the same box twice is one restriction, not two.
  perform set_organizer_restriction(
    v_organizer_token, v_rowan, v_mina, 'give');

  perform assert('setting it twice leaves one',
    (select count(*) from restrictions
     where exchange_id = v_exchange_id) = 1);

  -- The two directions are separate choices.
  perform set_organizer_restriction(
    v_organizer_token, v_rowan, v_mina, 'receive');

  perform assert('giving and receiving are kept apart',
    (select count(*) from restrictions
     where exchange_id = v_exchange_id) = 2);

  -- ------------------------------------------------------------------
  -- What it must refuse
  -- ------------------------------------------------------------------

  begin
    perform set_organizer_restriction(
      v_organizer_token, v_rowan, v_rowan, 'give');
    perform assert('nobody is kept apart from themselves', false);
  exception when check_violation then
    perform assert('nobody is kept apart from themselves', true);
  end;

  begin
    perform set_organizer_restriction(
      v_organizer_token, v_rowan, v_mina, 'sideways');
    perform assert('a direction that is not a direction is refused', false);
  exception when check_violation then
    perform assert('a direction that is not a direction is refused', true);
  end;

  begin
    perform set_organizer_restriction('not-a-token', v_rowan, v_mina, 'give');
    perform assert('a token nobody holds sets nothing', false);
  exception when no_data_found then
    perform assert('a token nobody holds sets nothing', true);
  end;

  -- Somebody in a different exchange entirely.
  v_other := create_exchange(jsonb_build_object(
    'name', 'Another swap',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana2@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Elsie', 'email', 'elsie@example.com'))
  ));

  select id into v_outsider from invitees
  where exchange_id = (v_other ->> 'exchangeId')::uuid;

  begin
    perform set_organizer_restriction(
      v_organizer_token, v_rowan, v_outsider, 'give');
    perform assert('a restriction cannot reach into another exchange', false);
  exception when no_data_found then
    perform assert('a restriction cannot reach into another exchange', true);
  end;

  perform assert('and nothing was written by the attempt',
    (select count(*) from restrictions
     where exchange_id = v_exchange_id) = 2);

  -- ------------------------------------------------------------------
  -- Clearing one
  -- ------------------------------------------------------------------

  perform clear_organizer_restriction(
    v_organizer_token, v_rowan, v_mina, 'receive');

  perform assert('clearing takes the one named',
    (select count(*) from restrictions
     where exchange_id = v_exchange_id) = 1
    and exists (select 1 from restrictions
                where exchange_id = v_exchange_id and direction = 'give'));

  -- A participant's own choice is theirs, and is never the
  -- organizer's to clear from a screen that never showed it.
  insert into restrictions (exchange_id, owner_invitee_id, other_invitee_id,
                            direction, set_by_organizer)
  values (v_exchange_id, v_theo, v_mina, 'give', false);

  perform clear_organizer_restriction(
    v_organizer_token, v_theo, v_mina, 'give');

  perform assert('somebody else''s own choice survives the organizer',
    exists (select 1 from restrictions
            where exchange_id = v_exchange_id
              and owner_invitee_id = v_theo
              and not set_by_organizer));

  -- ------------------------------------------------------------------
  -- Still never shown to the person it is about
  --
  -- This is the whole reason organizer restrictions are a separate
  -- kind. Rowan may not learn that the organizer has kept them away
  -- from Mina, so their own page has to show their own choices only.
  -- ------------------------------------------------------------------

  v_joined := join_exchange(
    v_created ->> 'eventCode', 'Rowan', 'rowan@example.com');

  v_invitee_token := v_joined ->> 'inviteeToken';
  v_view := registration_view(v_invitee_token);

  perform assert('the organizer''s restriction is real and still set',
    exists (select 1 from restrictions
            where exchange_id = v_exchange_id
              and owner_invitee_id = v_rowan
              and set_by_organizer));

  perform assert('but their own page does not show it to them',
    jsonb_array_length(v_view -> 'myRestrictions') = 0);

  perform assert('and nothing in the page mentions it at all',
    v_view::text not like '%setByOrganizer%');

  -- Their own choice does show, which is what makes the check above
  -- mean something rather than just an empty list. A participant can
  -- only set one once registration has closed, so close it.
  update exchanges set registration_deadline = current_date - 1
  where id = v_exchange_id;

  perform set_my_restriction(v_invitee_token, v_theo, 'give');

  perform assert('a choice they made themselves is shown back to them',
    jsonb_array_length(
      registration_view(v_invitee_token) -> 'myRestrictions') = 1);

  -- ------------------------------------------------------------------
  -- Once the draw has run
  -- ------------------------------------------------------------------

  update exchanges set drawn_at = now() where id = v_exchange_id;

  begin
    perform set_organizer_restriction(
      v_organizer_token, v_rowan, v_theo, 'give');
    perform assert('nothing is restricted after the draw', false);
  exception when check_violation then
    perform assert('nothing is restricted after the draw', true);
  end;

  begin
    perform clear_organizer_restriction(
      v_organizer_token, v_rowan, v_mina, 'give');
    perform assert('and nothing is unrestricted after it either', false);
  exception when check_violation then
    perform assert('and nothing is unrestricted after it either', true);
  end;

  raise notice '';
  raise notice 'All organizer restriction checks passed.';
end;
$$;
