-- What each token may and may not see.
--
-- The promise of this app is that the organizer never learns who drew
-- whom and that one participant never sees another's choices. Those are
-- claims about data, so they are checked against a database rather than
-- argued about. Run against a scratch database:
--
--   psql -f 0001_schema.sql -f 0002_functions.sql -f tests/access.sql
--
-- Every check raises on failure, so a non-zero exit means a promise is
-- broken.

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
  v_ada_token text;
  v_grace_token text;
  v_ada uuid;
  v_grace uuid;
  v_alan uuid;
  v_view jsonb;
begin
  -- A draw three weeks out, registration closing in a week.
  v_created := create_exchange(jsonb_build_object(
    'name', 'Office Secret Santa',
    'giftBudget', '25',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Joe', 'email', 'joe@example.com', 'participating', true),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Rowan', 'email', 'ada@example.com'),
      jsonb_build_object('name', 'Mina', 'email', 'grace@example.com'),
      jsonb_build_object('name', 'Theo', 'email', 'alan@example.com'))
  ));

  v_exchange_id := (v_created ->> 'exchangeId')::uuid;
  v_organizer_token := v_created ->> 'organizerToken';

  perform assert('an exchange returns a code and a token',
    length(v_created ->> 'eventCode') = 6
    and length(v_organizer_token) = 64);

  select (value ->> 'token'), (value ->> 'id')::uuid
    into v_ada_token, v_ada
  from jsonb_array_elements(v_created -> 'invitees')
  where value ->> 'email' = 'ada@example.com';

  select (value ->> 'token'), (value ->> 'id')::uuid
    into v_grace_token, v_grace
  from jsonb_array_elements(v_created -> 'invitees')
  where value ->> 'email' = 'grace@example.com';

  select (value ->> 'id')::uuid into v_alan
  from jsonb_array_elements(v_created -> 'invitees')
  where value ->> 'email' = 'alan@example.com';

  perform assert('every invitee gets their own token',
    v_ada_token <> v_grace_token);

  -- No token is stored in the clear.
  perform assert('tokens are stored only as hashes',
    not exists (
      select 1 from invitees
      where invitee_token_hash in (v_ada_token, v_grace_token)
    )
    and not exists (
      select 1 from exchanges where organizer_token_hash = v_organizer_token
    ));

  -- A wrong token opens nothing.
  begin
    perform registration_view('not-a-real-token');
    perform assert('a wrong token is refused', false);
  exception when no_data_found then
    perform assert('a wrong token is refused', true);
  end;

  -- Registration is open, restrictions are not: the list is not final.
  perform assert('registration is open before the deadline',
    registration_is_open(v_exchange_id));
  perform assert('restrictions are shut until registration closes',
    not restrictions_are_open(v_exchange_id));

  perform register_participant(v_ada_token, 'Rowan Hale',
    'Books about engines', 'No chocolate');
  perform register_participant(v_grace_token, 'Mina Okafor',
    'A good compiler', null);

  v_view := registration_view(v_ada_token);
  perform assert('registering records the wishlist',
    v_view -> 'me' ->> 'wishlist' = 'Books about engines');

  -- Only registered people can be chosen between.
  perform assert('an unregistered invitee is not offered as a choice',
    not exists (
      select 1 from jsonb_array_elements(v_view -> 'others')
      where (value ->> 'id')::uuid = v_alan
    ));

  -- Move past the registration deadline.
  update exchanges set registration_deadline = current_date - 1
  where id = v_exchange_id;

  perform assert('registration closes on its deadline',
    not registration_is_open(v_exchange_id));
  perform assert('restrictions open when registration closes',
    restrictions_are_open(v_exchange_id));

  begin
    perform register_participant(v_ada_token, 'Rowan', null, null);
    perform assert('registering after the deadline is refused', false);
  exception when check_violation then
    perform assert('registering after the deadline is refused', true);
  end;

  -- Rowan will not give to Mina. Her choice, and hers alone.
  perform set_my_restriction(v_ada_token, v_grace, 'give');

  v_view := registration_view(v_ada_token);
  perform assert('a participant sees their own restriction',
    jsonb_array_length(v_view -> 'myRestrictions') = 1);

  v_view := registration_view(v_grace_token);
  perform assert('and nobody else sees it',
    jsonb_array_length(v_view -> 'myRestrictions') = 0);

  -- The organizer adds one for Mina, in case she forgets.
  insert into restrictions (exchange_id, owner_invitee_id,
                            other_invitee_id, direction, set_by_organizer)
  values (v_exchange_id, v_grace, v_ada, 'give', true);

  v_view := registration_view(v_grace_token);
  perform assert('an organizer-set restriction is not shown to its owner',
    jsonb_array_length(v_view -> 'myRestrictions') = 0);

  perform assert('but the draw can see both',
    (select count(*) from restrictions where exchange_id = v_exchange_id) = 2);

  -- Both sources coexist for the same pairing.
  perform set_my_restriction(v_grace_token, v_ada, 'give');
  perform assert('a participant may hold the same restriction as the organizer',
    (select count(*) from restrictions
     where exchange_id = v_exchange_id
       and owner_invitee_id = v_grace
       and other_invitee_id = v_ada
       and direction = 'give') = 2);

  perform clear_my_restriction(v_grace_token, v_ada, 'give');
  perform assert('clearing their own leaves the organizer''s standing',
    (select count(*) from restrictions
     where exchange_id = v_exchange_id
       and owner_invitee_id = v_grace
       and other_invitee_id = v_ada
       and direction = 'give'
       and set_by_organizer) = 1);

  -- The organizer's view.
  v_view := organizer_view(v_organizer_token);

  perform assert('the organizer sees who registered',
    jsonb_array_length(v_view -> 'invitees') = 4);
  perform assert('the organizer sees every restriction, from both sources',
    jsonb_array_length(v_view -> 'restrictions') = 2);
  perform assert('the organizer''s own token is not handed back',
    not (v_view -> 'exchange' ? 'organizer_token_hash'));
  perform assert('the organizer view carries no assignments at all',
    not (v_view ? 'assignments'));

  -- The draw has run.
  insert into assignments (exchange_id, giver_id, receiver_id)
  values (v_exchange_id, v_ada, v_alan),
         (v_exchange_id, v_grace, v_ada);
  update exchanges set drawn_at = now() where id = v_exchange_id;

  perform assert('a participant is told one name, their own',
    my_assignment(v_ada_token) ->> 'name' = 'Theo');
  perform assert('and sees the wishlist of the person they drew',
    my_assignment(v_grace_token) ->> 'wishlist' = 'Books about engines');

  -- Still nothing for the organizer, after the draw as before it.
  v_view := organizer_view(v_organizer_token);
  perform assert('the organizer still sees no assignment after the draw',
    not (v_view::text like '%assignment%'));

  perform assert('restrictions shut once the draw has run',
    not restrictions_are_open(v_exchange_id));

  raise notice '';
  raise notice 'All access checks passed.';
end;
$$;
