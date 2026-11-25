-- A second token per invitee, so a link that arrives by email opens
-- the same page as the one they registered with, on a device that has
-- never seen the site, without taking anything away from the device
-- they registered on.

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
  v_id uuid;
  v_code text;
  v_joined jsonb;
  v_registration_token text;
  v_email_token text := new_token();
  v_rowan uuid;
  v_mina uuid;
  v_failed boolean;
begin
  v_created := create_exchange(jsonb_build_object(
    'name', 'Email links',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Rowan', 'email', 'rowan@example.com'),
      jsonb_build_object('name', 'Mina', 'email', 'mina@example.com'))
  ));

  v_id := (v_created ->> 'exchangeId')::uuid;
  v_code := v_created ->> 'eventCode';

  v_joined := join_exchange(v_code, 'Rowan', 'rowan@example.com',
                            'A good notebook', 'No candles');
  v_registration_token := v_joined ->> 'inviteeToken';
  v_rowan := ((v_joined -> 'registration' -> 'me') ->> 'id')::uuid;

  v_joined := join_exchange(v_code, 'Mina', 'mina@example.com', null, null);
  v_mina := ((v_joined -> 'registration' -> 'me') ->> 'id')::uuid;

  -- The link an email would carry.
  insert into invitee_tokens (token_hash, invitee_id, purpose, expires_at)
  values (token_hash(v_email_token), v_rowan, 'email_link',
          now() + interval '30 days');

  -- ------------------------------------------------------------------
  -- Both tokens open the same page
  -- ------------------------------------------------------------------

  perform assert('the registration token still opens their page',
    (registration_view(v_registration_token) -> 'me' ->> 'id')::uuid = v_rowan);

  perform assert('and so does the one from the email',
    (registration_view(v_email_token) -> 'me' ->> 'id')::uuid = v_rowan);

  perform assert('showing the same person, not a different view of them',
    registration_view(v_email_token) -> 'me' ->> 'wishlist'
      = 'A good notebook');

  -- ------------------------------------------------------------------
  -- And the same doors
  -- ------------------------------------------------------------------

  perform register_participant(v_email_token, 'Rowan', 'A better notebook', null);

  perform assert('saving through the email link saves',
    (select wishlist from invitees where id = v_rowan) = 'A better notebook');

  perform assert('and the registration token sees the change',
    registration_view(v_registration_token) -> 'me' ->> 'wishlist'
      = 'A better notebook');

  -- Restrictions need the window open.
  update exchanges set registration_deadline = current_date - 1 where id = v_id;

  perform set_my_restriction(v_email_token, v_mina, 'give');

  perform assert('a restriction set through the email link is theirs',
    exists (select 1 from restrictions
            where owner_invitee_id = v_rowan and other_invitee_id = v_mina
              and direction = 'give' and not set_by_organizer));

  perform clear_my_restriction(v_email_token, v_mina, 'give');

  perform assert('and can be cleared through it too',
    not exists (select 1 from restrictions where owner_invitee_id = v_rowan));

  -- ------------------------------------------------------------------
  -- Adding one takes nothing away
  -- ------------------------------------------------------------------

  perform assert('the device they registered on still works',
    (registration_view(v_registration_token) -> 'me' ->> 'id')::uuid = v_rowan);

  -- ------------------------------------------------------------------
  -- Nobody else's token opens it
  -- ------------------------------------------------------------------

  v_failed := false;
  begin
    perform registration_view(new_token());
  exception when others then
    v_failed := true;
  end;
  perform assert('a token nobody holds opens nothing', v_failed);

  v_failed := false;
  begin
    perform registration_view(token_hash(v_email_token));
  exception when others then
    v_failed := true;
  end;
  perform assert('and neither does the stored hash of a real one', v_failed);

  -- ------------------------------------------------------------------
  -- Withdrawing retires everything of theirs
  -- ------------------------------------------------------------------

  update exchanges set registration_deadline = current_date + 7 where id = v_id;

  perform withdraw_registration(v_email_token);

  perform assert('withdrawing through the email link works',
    (select status from invitees where id = v_rowan) = 'Invited');

  v_failed := false;
  begin
    perform registration_view(v_registration_token);
  exception when others then
    v_failed := true;
  end;
  perform assert('and retires the registration token', v_failed);

  v_failed := false;
  begin
    perform registration_view(v_email_token);
  exception when others then
    v_failed := true;
  end;
  perform assert('and the email token with it, rather than leaving a way back in',
    v_failed);

  -- ------------------------------------------------------------------
  -- And it does not outlive the exchange
  -- ------------------------------------------------------------------

  declare
    v_old text := new_token();
  begin
    insert into invitee_tokens (token_hash, invitee_id, purpose, expires_at)
    values (token_hash(v_old), v_mina, 'email_link',
            now() - interval '1 day');

    v_failed := false;
    begin
      perform registration_view(v_old);
    exception when others then
      v_failed := true;
    end;
    perform assert('a link past its expiry opens nothing', v_failed);

    update invitee_tokens set expires_at = now() + interval '1 day'
    where token_hash = token_hash(v_old);

    perform assert('and the same link works before it',
      (registration_view(v_old) -> 'me' ->> 'id')::uuid = v_mina);
  end;

  raise notice '--- email links: all checks passed ---';
end $$;
