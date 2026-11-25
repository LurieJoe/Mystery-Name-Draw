-- The restriction window: when it opens, when it shuts, and the dates
-- between which it does not exist at all.

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
begin
  v_created := create_exchange(jsonb_build_object(
    'name', 'Window test',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana@example.com', 'participating', false),
    'invitees', '[]'::jsonb
  ));
  v_id := (v_created ->> 'exchangeId')::uuid;

  -- Before the deadline: registration open, restrictions not yet.
  perform assert('while registration is open, restrictions are not',
    registration_is_open(v_id) and not restrictions_are_open(v_id));

  -- The deadline day itself still counts as open.
  update exchanges set registration_deadline = current_date where id = v_id;
  perform assert('registration is open through the whole deadline day',
    registration_is_open(v_id));
  perform assert('and restrictions have still not opened',
    not restrictions_are_open(v_id));

  -- The day after: restrictions open.
  update exchanges set registration_deadline = current_date - 1 where id = v_id;
  perform assert('registration closes the day after the deadline',
    not registration_is_open(v_id));
  perform assert('and that is when restrictions open',
    restrictions_are_open(v_id));

  -- The draw date itself: still open, because the draw has not run.
  update exchanges set draw_date = current_date where id = v_id;
  perform assert('restrictions stay open through the draw date',
    restrictions_are_open(v_id));

  -- The draw runs: shut immediately, whatever the date says.
  update exchanges set drawn_at = now() where id = v_id;
  perform assert('and shut the moment the draw runs',
    not restrictions_are_open(v_id));

  -- A draw that has not run, the day after its date: still open, so a
  -- late draw does not lock people out while they are waiting.
  update exchanges set drawn_at = null, draw_date = current_date - 1
  where id = v_id;
  perform assert('a draw date that has passed without a draw does close them',
    not restrictions_are_open(v_id));

  -- Dates one day apart leave no usable window at all.
  update exchanges
  set registration_deadline = current_date, draw_date = current_date + 1,
      drawn_at = null
  where id = v_id;
  perform assert('a one-day gap gives no window on the deadline day',
    not restrictions_are_open(v_id));

  raise notice '--- restriction window: all checks passed ---';
end $$;
