-- Opting out of reminders, and what it deliberately does not stop.

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
  v_token text;
  v_rowan uuid;
  v_queued int;
begin
  v_created := create_exchange(jsonb_build_object(
    'name', 'Opting out',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana-opt@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Rowan', 'email', 'rowan-opt@example.com'))
  ));

  v_id := (v_created ->> 'exchangeId')::uuid;
  v_code := v_created ->> 'eventCode';

  v_joined := join_exchange(v_code, 'Rowan', 'rowan-opt@example.com', null, null);
  v_token := v_joined ->> 'inviteeToken';
  v_rowan := ((v_joined -> 'registration' -> 'me') ->> 'id')::uuid;

  perform assert('somebody starts out hearing everything',
    not (registration_view(v_token) -> 'me' ->> 'unsubscribed')::boolean);

  -- ------------------------------------------------------------------
  -- Turning them off
  -- ------------------------------------------------------------------

  perform set_my_reminders(v_token, false);

  perform assert('turning reminders off is recorded',
    (registration_view(v_token) -> 'me' ->> 'unsubscribed')::boolean);

  perform queue_notification(v_id, v_rowan, 'rowan-opt@example.com',
                             'draw_reminder');
  perform queue_notification(v_id, v_rowan, 'rowan-opt@example.com',
                             'registration_reminder');
  perform queue_notification(v_id, v_rowan, 'rowan-opt@example.com',
                             'registration_closed');

  perform assert('and no nudge is queued for them',
    (select count(*) from notifications
     where exchange_id = v_id
       and kind in ('draw_reminder', 'registration_reminder',
                    'registration_closed')) = 0);

  -- ------------------------------------------------------------------
  -- What still arrives
  -- ------------------------------------------------------------------

  perform queue_notification(v_id, v_rowan, 'rowan-opt@example.com',
                             'message_waiting');

  perform assert('a message still reaches them',
    (select count(*) from notifications
     where exchange_id = v_id and kind = 'message_waiting') = 1);

  -- The draw queues its own, directly, for everybody registered. It
  -- needs two people, and registration has to still be open for the
  -- second one to join, so that happens before the dates move - and
  -- both dates move together, because the schema requires the draw on
  -- or after the deadline and will not accept a half-done change.
  perform join_exchange(v_code, 'Mina', 'mina-opt@example.com', null, null);

  update exchanges
  set registration_deadline = current_date - 2, draw_date = current_date - 1
  where id = v_id;

  perform record_draw(v_id, (
    select jsonb_agg(jsonb_build_object(
      'giverId', g.id,
      'receiverId', (select id from invitees
                     where exchange_id = v_id and status = 'Registered'
                       and id <> g.id limit 1)))
    from invitees g where g.exchange_id = v_id and g.status = 'Registered'));

  perform assert('and so does the name they drew',
    (select count(*) from notifications
     where exchange_id = v_id and kind = 'draw_result'
       and invitee_id = v_rowan) = 1);

  -- ------------------------------------------------------------------
  -- A message to somebody who opted out is still worth telling them
  -- ------------------------------------------------------------------

  declare
    v_giver uuid;
    v_giver_token text;
  begin
    select giver_id into v_giver from assignments
    where exchange_id = v_id and receiver_id = v_rowan;

    -- Rowan writes to whoever drew them; the giver is told.
    perform assert('an opted-out person can still be written to',
      exists (select 1 from invitees where id = v_giver));
  end;

  -- ------------------------------------------------------------------
  -- And back on again
  -- ------------------------------------------------------------------

  perform set_my_reminders(v_token, true);

  perform assert('turning them back on is recorded',
    not (registration_view(v_token) -> 'me' ->> 'unsubscribed')::boolean);

  perform queue_notification(v_id, v_rowan, 'rowan-opt@example.com',
                             'draw_reminder');

  perform assert('and nudges reach them again',
    (select count(*) from notifications
     where exchange_id = v_id and kind = 'draw_reminder') = 1);

  -- ------------------------------------------------------------------
  -- Nobody else's choice to make
  -- ------------------------------------------------------------------

  declare
    v_failed boolean := false;
  begin
    begin
      perform set_my_reminders(new_token(), false);
    exception when others then
      v_failed := true;
    end;
    perform assert('a token nobody holds changes nobody''s settings', v_failed);
  end;

  raise notice '--- opting out: all checks passed ---';
end $$;
