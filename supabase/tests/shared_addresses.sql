-- One inbox, several people. A family gives separately and reads the
-- same address; the shared registration link has to tell them apart
-- without ever handing one of them somebody else's place.

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
  v_mom_token text;
  v_open jsonb;
  v_open_code text;
  v_open_token text;
  v_maren uuid;
  v_elsie uuid;
  v_juno uuid;
  v_message text;
  v_twin jsonb;
begin
  -- Invitation only, three people, one address.
  v_created := create_exchange(jsonb_build_object(
    'name', 'Family swap',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'allowOpenJoin', false,
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Maren', 'email', 'house@example.com'),
      jsonb_build_object('name', 'Elsie', 'email', 'house@example.com'),
      jsonb_build_object('name', 'Juno', 'email', 'house@example.com'),
      jsonb_build_object('name', 'Rowan', 'email', 'rowan@example.com'))
  ));

  v_exchange_id := (v_created ->> 'exchangeId')::uuid;
  v_code := v_created ->> 'eventCode';
  v_organizer_token := v_created ->> 'organizerToken';

  -- Held by id, because join_exchange writes the name it was given
  -- onto whichever row it matched: an assertion that looks a person up
  -- by name would be reading back the name the mutation just wrote.
  select id into v_maren from invitees
  where exchange_id = v_exchange_id and name = 'Maren';
  select id into v_elsie from invitees
  where exchange_id = v_exchange_id and name = 'Elsie';
  select id into v_juno from invitees
  where exchange_id = v_exchange_id and name = 'Juno';

  perform assert('three people may share one address',
    (select count(*) from invitees
     where exchange_id = v_exchange_id and email = 'house@example.com') = 3);

  perform assert('and each of them has a link of their own',
    (select count(distinct invitee_token_hash) from invitees
     where exchange_id = v_exchange_id and email = 'house@example.com') = 3);

  -- ------------------------------------------------------------------
  -- Arriving on the shared link
  -- ------------------------------------------------------------------

  v_joined := join_exchange(v_code, 'Elsie', 'house@example.com');
  v_mom_token := v_joined ->> 'inviteeToken';

  perform assert('the name decides which of them is registering',
    (select status from invitees where id = v_elsie) = 'Registered');

  perform assert('and the other two are left exactly as they were',
    (select status from invitees where id = v_maren) = 'Invite Pending'
    and (select status from invitees where id = v_juno) = 'Invite Pending'
    and (select name from invitees where id = v_maren) = 'Maren'
    and (select name from invitees where id = v_juno) = 'Juno');

  perform assert('whichever of them it was, nobody new was created',
    (select count(*) from invitees
     where exchange_id = v_exchange_id and email = 'house@example.com') = 3);

  -- Case and stray spaces are how people actually type their own name.
  v_joined := join_exchange(v_code, '  juno ', 'HOUSE@example.com');

  perform assert('a name typed loosely still finds the right person',
    (select status from invitees where id = v_juno) = 'Registered'
    and (select status from invitees where id = v_maren) = 'Invite Pending');

  begin
    perform join_exchange(v_code, 'Elsie', 'house@example.com');
    perform assert('and registering twice is still refused', false);
  exception when unique_violation then
    perform assert('and registering twice is still refused', true);
  end;

  -- The one case the app must not guess at. The message matters as
  -- much as the refusal: somebody who typed "Mum" instead of "Maren"
  -- is on this list, and telling them to ask the organizer to add
  -- them would send them after the wrong thing.
  begin
    perform join_exchange(v_code, 'Somebody Else', 'house@example.com');
    perform assert('an unknown name at a shared address is not let in', false);
  exception when insufficient_privilege then
    get stacked diagnostics v_message = message_text;
    perform assert('an unknown name at a shared address is not let in', true);
    perform assert('and they are pointed at their own invitation link',
      v_message like '%invitation email%');
  end;

  perform assert('so no fourth person appeared at that address',
    (select count(*) from invitees
     where exchange_id = v_exchange_id and email = 'house@example.com') = 3);

  perform assert('and the one person still unregistered was not touched',
    (select status from invitees where id = v_maren) = 'Invite Pending'
    and (select name from invitees where id = v_maren) = 'Maren');

  -- An address only one person uses behaves exactly as it always has.
  v_joined := join_exchange(v_code, 'Rowan Hale', 'rowan@example.com');

  perform assert('one person at an address still needs no name match',
    (select status from invitees
     where exchange_id = v_exchange_id and email = 'rowan@example.com')
    = 'Registered'
    and (select name from invitees
         where exchange_id = v_exchange_id and email = 'rowan@example.com')
        = 'Rowan Hale');

  -- ------------------------------------------------------------------
  -- An open exchange, where a new name is a new person
  -- ------------------------------------------------------------------

  v_open := create_exchange(jsonb_build_object(
    'name', 'Open swap',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'allowOpenJoin', true,
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana2@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Maren', 'email', 'house@example.com'),
      jsonb_build_object('name', 'Elsie', 'email', 'house@example.com'))
  ));

  v_open_code := v_open ->> 'eventCode';
  v_open_token := v_open ->> 'organizerToken';

  perform join_exchange(v_open_code, 'Juno', 'house@example.com');

  perform assert('on an open exchange a new name at that address joins',
    (select count(*) from invitees
     where exchange_id = (v_open ->> 'exchangeId')::uuid
       and email = 'house@example.com') = 3);

  perform assert('and does so as somebody who joined themselves',
    (select self_joined from invitees
     where exchange_id = (v_open ->> 'exchangeId')::uuid
       and name = 'Juno'));

  -- ------------------------------------------------------------------
  -- Two people with the same name as well as the same address
  --
  -- add_invitee refuses this, but an organizer can type it straight
  -- into the list they create, and then the name is no tiebreak
  -- either. Open or not, the only safe answer is their own link.
  -- ------------------------------------------------------------------

  v_twin := create_exchange(jsonb_build_object(
    'name', 'Two Sams',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'allowOpenJoin', true,
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana3@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Sam', 'email', 'twins@example.com'),
      jsonb_build_object('name', 'Sam', 'email', 'twins@example.com'))
  ));

  begin
    perform join_exchange(v_twin ->> 'eventCode', 'Sam', 'twins@example.com');
    perform assert('two people with one name and one address are not guessed between', false);
  exception when insufficient_privilege then
    perform assert('two people with one name and one address are not guessed between', true);
  end;

  perform assert('and neither of them was registered by the attempt',
    not exists (
      select 1 from invitees
      where exchange_id = (v_twin ->> 'exchangeId')::uuid
        and status = 'Registered'));

  -- ------------------------------------------------------------------
  -- The draw does not care about addresses
  -- ------------------------------------------------------------------

  update invitees set status = 'Registered', registered_at = now()
  where exchange_id = v_exchange_id and status <> 'Registered';

  perform assert('everybody at the shared address is drawable',
    (select count(*) from invitees
     where exchange_id = v_exchange_id and status = 'Registered') = 4);

  raise notice '';
  raise notice 'All shared address checks passed.';
end;
$$;
