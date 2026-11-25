-- Leaving an exchange. The two kinds of row behave differently, and
-- the difference is the point: a place the organizer gave you is still
-- yours when you change your mind, and a place you took yourself is
-- not something the exchange should keep hold of.

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
  v_rowan_token text;
  v_rowan_id uuid;
  v_marlow_token text;
  v_marlow_id uuid;
  v_joined jsonb;
  v_view jsonb;
  v_row invitees;
  v_failed boolean;
  v_organizer_invitee_token text;
begin
  v_created := create_exchange(jsonb_build_object(
    'name', 'Office swap',
    'giftBudget', '25',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana@example.com', 'participating', true),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Rowan', 'email', 'rowan@example.com'),
      jsonb_build_object('name', 'Imani', 'email', 'imani@example.com'))
  ));

  v_exchange_id := (v_created ->> 'exchangeId')::uuid;
  v_code := v_created ->> 'eventCode';
  v_organizer_token := v_created ->> 'organizerToken';

  -- create_exchange hands back a token per invitee, the organizer's
  -- own row included. That is the one the guard below has to be given,
  -- because a token that matches nothing fails at the first lookup and
  -- never reaches the guard at all.
  select value ->> 'token' into v_organizer_invitee_token
  from jsonb_array_elements(v_created -> 'invitees')
  where value ->> 'email' = 'dana@example.com';

  -- Rowan was invited by the organizer.
  v_joined := join_exchange(v_code, 'Rowan', 'rowan@example.com',
                            'A good notebook', 'No candles please');
  v_rowan_token := v_joined ->> 'inviteeToken';
  v_rowan_id := ((v_joined -> 'registration' -> 'me') ->> 'id')::uuid;

  -- Marlow was not: they followed the shared link.
  v_joined := join_exchange(v_code, 'Marlow', 'marlow@example.com',
                            'Hot sauce', null);
  v_marlow_token := v_joined ->> 'inviteeToken';
  v_marlow_id := ((v_joined -> 'registration' -> 'me') ->> 'id')::uuid;

  perform assert('an invited person starts out Registered',
    (select status from invitees where id = v_rowan_id) = 'Registered');
  perform assert('somebody who used the shared link is Registered too',
    (select status from invitees where id = v_marlow_id) = 'Registered');
  perform assert('only the one who used the shared link is marked self_joined',
    (select not self_joined from invitees where id = v_rowan_id)
    and (select self_joined from invitees where id = v_marlow_id));

  -- ------------------------------------------------------------------
  -- Restrictions on both sides of each of them
  --
  -- They do not open until registration closes, because they are
  -- choices about a list of people that has to be final first. So the
  -- deadline moves into the past here, which is also the state most
  -- people will be in when they think about leaving.
  -- ------------------------------------------------------------------

  update exchanges set registration_deadline = current_date - 1
  where id = v_exchange_id;

  perform assert('restrictions are open once registration closes',
    restrictions_are_open(v_exchange_id));

  perform set_my_restriction(v_rowan_token, v_marlow_id, 'give');
  perform set_my_restriction(v_marlow_token, v_rowan_id, 'receive');

  -- And one the organizer set about Rowan, which is not Rowan's.
  insert into restrictions (exchange_id, owner_invitee_id,
                            other_invitee_id, direction, set_by_organizer)
  values (v_exchange_id, v_rowan_id, v_marlow_id, 'receive', true);

  perform assert('three restrictions are in place',
    (select count(*) from restrictions where exchange_id = v_exchange_id) = 3);

  -- ------------------------------------------------------------------
  -- The invited person leaves
  -- ------------------------------------------------------------------

  perform withdraw_registration(v_rowan_token);

  select * into v_row from invitees where id = v_rowan_id;

  perform assert('an invited person keeps their row', v_row.id is not null);
  perform assert('and goes back to Invited', v_row.status = 'Invited');
  perform assert('what they wrote is cleared',
    v_row.wishlist is null and v_row.preferences is null);
  perform assert('and so is the date they registered',
    v_row.registered_at is null);
  perform assert('their name and address stay, so the organizer still sees them',
    v_row.name = 'Rowan' and v_row.email = 'rowan@example.com');

  v_failed := false;
  begin
    perform registration_view(v_rowan_token);
  exception when others then
    v_failed := true;
  end;
  perform assert('their old link stops opening anything', v_failed);

  perform assert('their own restriction is gone',
    not exists (select 1 from restrictions
                where owner_invitee_id = v_rowan_id and not set_by_organizer));
  perform assert('the one the organizer set about them survives',
    exists (select 1 from restrictions
            where owner_invitee_id = v_rowan_id and set_by_organizer));
  perform assert('and so does the one somebody else set against them',
    exists (select 1 from restrictions where other_invitee_id = v_rowan_id
            and owner_invitee_id = v_marlow_id));

  perform assert('they no longer count as a participant',
    (select count(*) from invitees
     where exchange_id = v_exchange_id and status = 'Registered') = 2);

  perform assert('leaving works after registration has closed',
    not registration_is_open(v_exchange_id));

  -- ------------------------------------------------------------------
  -- And can come back, once the organizer reopens registration
  -- ------------------------------------------------------------------

  update exchanges set registration_deadline = current_date + 7
  where id = v_exchange_id;

  v_joined := join_exchange(v_code, 'Rowan', 'rowan@example.com',
                            'Still the notebook', null);
  perform assert('they can register again from the same code',
    (v_joined ->> 'inviteeToken') is not null);
  perform assert('and it is the same row, not a second one',
    ((v_joined -> 'registration' -> 'me') ->> 'id')::uuid = v_rowan_id);
  perform assert('with a token that is not the retired one',
    (v_joined ->> 'inviteeToken') <> v_rowan_token);

  v_rowan_token := v_joined ->> 'inviteeToken';

  -- ------------------------------------------------------------------
  -- The one who let themselves in leaves
  -- ------------------------------------------------------------------

  perform withdraw_registration(v_marlow_token);

  perform assert('somebody who used the shared link takes their row with them',
    not exists (select 1 from invitees where id = v_marlow_id));
  perform assert('and their restrictions go in both directions',
    not exists (select 1 from restrictions
                where owner_invitee_id = v_marlow_id
                   or other_invitee_id = v_marlow_id));
  -- The organizer's restriction named Marlow as the other party, so it
  -- cascades away with them. Nothing is left pointing at a missing row.
  perform assert('and take the organizer restriction that named them along',
    (select count(*) from restrictions where exchange_id = v_exchange_id) = 0);

  perform assert('the address is free again, so they could rejoin',
    not exists (select 1 from invitees
                where exchange_id = v_exchange_id
                  and lower(email) = 'marlow@example.com'));

  -- ------------------------------------------------------------------
  -- Who may not withdraw
  -- ------------------------------------------------------------------

  v_failed := false;
  begin
    perform withdraw_registration('not-a-real-token');
  exception when others then
    v_failed := true;
  end;
  perform assert('a token nobody holds withdraws nothing', v_failed);

  v_failed := false;
  begin
    perform withdraw_registration(v_organizer_invitee_token);
  exception when others then
    v_failed := true;
  end;
  perform assert('the organizer cannot withdraw their own place this way',
    v_failed);
  perform assert('so their row is untouched',
    (select status from invitees where is_organizer
       and exchange_id = v_exchange_id) = 'Registered');

  -- ------------------------------------------------------------------
  -- Once the draw has run, leaving is the organizer's problem
  -- ------------------------------------------------------------------

  insert into assignments (exchange_id, giver_id, receiver_id)
  select v_exchange_id, v_rowan_id, id from invitees
  where exchange_id = v_exchange_id and id <> v_rowan_id limit 1;

  update exchanges set drawn_at = now() where id = v_exchange_id;

  v_failed := false;
  begin
    perform withdraw_registration(v_rowan_token);
  exception when others then
    v_failed := true;
  end;
  perform assert('nobody withdraws after the draw', v_failed);

  perform assert('and they are still registered',
    (select status from invitees where id = v_rowan_id) = 'Registered');

  raise notice '--- withdrawal: all checks passed ---';
end $$;
