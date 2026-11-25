-- A throwaway exchange, drawn immediately, to prove the whole chain
-- works in production.
--
-- THIS SENDS REAL EMAIL. Put an address you own on the line below.
-- Both participants use it with plus-addressing, so both emails land
-- in one inbox and you can see them side by side.
--
-- Paste into the SQL editor, cleared first, and run. It creates the
-- exchange, registers two people, and moves the dates so the draw is
-- due. It does not fire anything: that is the next step, on purpose.

do $$
declare
  -- ------------------------------------------------------------------
  -- EDIT THIS LINE, then run.
  v_email text := 'jlurie15@live.com';
  -- ------------------------------------------------------------------

  v_created jsonb;
  v_id uuid;
  v_code text;
  v_a text;
  v_b text;
  v_joined jsonb;
begin
  if v_email = 'you@example.com' then
    raise exception 'Put your own email address on the v_email line first.';
  end if;

  v_a := split_part(v_email, '@', 1) || '+mnd-a@' || split_part(v_email, '@', 2);
  v_b := split_part(v_email, '@', 1) || '+mnd-b@' || split_part(v_email, '@', 2);

  -- Future dates so registration is open, moved back afterwards.
  v_created := create_exchange(jsonb_build_object(
    'name', 'Smoke test exchange',
    'giftBudget', '25',
    'currency', 'USD',
    'registrationDeadline', (current_date + 30)::text,
    'drawDate', (current_date + 35)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Joe', 'email', v_email, 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Test Person A', 'email', v_a),
      jsonb_build_object('name', 'Test Person B', 'email', v_b))
  ));

  v_id := (v_created ->> 'exchangeId')::uuid;
  v_code := v_created ->> 'eventCode';

  perform join_exchange(v_code, 'Test Person A', v_a,
                        'A book about engines', 'No chocolate');
  perform join_exchange(v_code, 'Test Person B', v_b,
                        'Hot sauce, the hotter the better', null);

  -- Both dates together: the schema wants the draw on or after the
  -- deadline and rejects a half-done change.
  update exchanges
  set registration_deadline = current_date - 2,
      draw_date = current_date - 1
  where id = v_id;

  raise notice 'Exchange % is ready and due. Event code: %', v_id, v_code;
end $$;

-- What you should see: two people registered, no assignments yet,
-- nothing queued, and the draw due.
select
  e.name,
  e.event_code,
  e.draw_date,
  (now() at time zone e.time_zone) >= (e.draw_date + time '09:00') as due_now,
  (select count(*) from invitees i
   where i.exchange_id = e.id and i.status = 'Registered') as registered,
  (select count(*) from assignments a where a.exchange_id = e.id) as assignments,
  (select count(*) from notifications n where n.exchange_id = e.id) as queued
from exchanges e
where e.name = 'Smoke test exchange'
order by e.created_at desc
limit 1;
