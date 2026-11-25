-- The time-based email: queued when it comes round, once, and not
-- when the exchange has nothing to say.

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

-- An exchange with the dates and reminder settings a test wants.
create or replace function an_exchange_due_for(
  p_name text,
  p_deadline date,
  p_draw date,
  p_remind_deadline boolean,
  p_remind_draw boolean,
  p_register int
)
returns uuid
language plpgsql
as $$
declare
  v_created jsonb; v_id uuid; v_code text; i int;
  v_invitees jsonb := '[]'::jsonb;
begin
  for i in 1..3 loop
    v_invitees := v_invitees || jsonb_build_object(
      'name', 'Person ' || i, 'email', 'p' || i || '-' || p_name || '@example.com');
  end loop;

  v_created := create_exchange(jsonb_build_object(
    'name', p_name,
    'registrationDeadline', (current_date + 30)::text,
    'drawDate', (current_date + 35)::text,
    'timeZone', 'UTC',
    'remindBeforeRegistrationDeadline', p_remind_deadline,
    'remindBeforeDrawDate', p_remind_draw,
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana-' || p_name || '@example.com',
      'participating', false),
    'invitees', v_invitees));

  v_id := (v_created ->> 'exchangeId')::uuid;
  v_code := v_created ->> 'eventCode';

  for i in 1..p_register loop
    perform join_exchange(v_code, 'Person ' || i,
                          'p' || i || '-' || p_name || '@example.com', null, null);
  end loop;

  update exchanges
  set registration_deadline = p_deadline,
      draw_date = p_draw,
      remind_before_registration_deadline = p_remind_deadline,
      remind_before_draw_date = p_remind_draw
  where id = v_id;

  return v_id;
end;
$$;

create or replace function queued(p_exchange uuid, p_kind text)
returns int
language sql stable as $$
  select count(*)::int from notifications
  where exchange_id = p_exchange and kind = p_kind;
$$;

do $$
declare
  v_soon uuid;
  v_closed uuid;
  v_tight uuid;
  v_quiet uuid;
  v_drawn uuid;
begin
  -- Deadline two days out, reminders on, one of three registered.
  v_soon := an_exchange_due_for('soon', current_date + 2, current_date + 9,
                                true, true, 1);
  -- Registration closed yesterday, comfortable window.
  v_closed := an_exchange_due_for('closed', current_date - 1, current_date + 6,
                                  false, false, 3);
  -- Closed, but the draw follows too fast for restrictions.
  v_tight := an_exchange_due_for('tight', current_date - 1, current_date,
                                 false, false, 3);
  -- Deadline two days out, reminders off.
  v_quiet := an_exchange_due_for('quiet', current_date + 2, current_date + 9,
                                 false, false, 1);

  perform queue_due_notifications();

  -- ------------------------------------------------------------------
  -- Reminders, to the people who have not registered
  -- ------------------------------------------------------------------

  perform assert('two days out, the people who have not registered are reminded',
    queued(v_soon, 'registration_reminder') = 2);

  perform assert('and the one who did is left alone',
    not exists (select 1 from notifications n
                join invitees i on i.id = n.invitee_id
                where n.exchange_id = v_soon
                  and n.kind = 'registration_reminder'
                  and i.status = 'Registered'));

  perform assert('an organizer who did not ask for reminders gets none sent',
    queued(v_quiet, 'registration_reminder') = 0);

  -- ------------------------------------------------------------------
  -- The morning after the deadline
  -- ------------------------------------------------------------------

  perform assert('everybody registered hears that registration closed',
    queued(v_closed, 'registration_closed') = 3);

  perform assert('and the organizer gets a roll call',
    queued(v_closed, 'registration_roll_call') = 1);

  perform assert('with the numbers they need',
    (select context ->> 'registered' from notifications
     where exchange_id = v_closed and kind = 'registration_roll_call') = '3');

  perform assert('an exchange drawing too soon tells nobody restrictions opened',
    queued(v_tight, 'registration_closed') = 0);

  perform assert('though its organizer still gets the roll call',
    queued(v_tight, 'registration_roll_call') = 1);

  -- ------------------------------------------------------------------
  -- Running again changes nothing
  -- ------------------------------------------------------------------

  perform queue_due_notifications();

  perform assert('a second pass queues no duplicate reminder',
    queued(v_soon, 'registration_reminder') = 2);
  perform assert('nor a duplicate closing notice',
    queued(v_closed, 'registration_closed') = 3);
  perform assert('nor a second roll call',
    queued(v_closed, 'registration_roll_call') = 1);

  -- ------------------------------------------------------------------
  -- Nothing for an exchange that has already been drawn
  -- ------------------------------------------------------------------

  v_drawn := an_exchange_due_for('drawn', current_date + 2, current_date + 9,
                                 true, true, 1);
  update exchanges set drawn_at = now() where id = v_drawn;

  perform queue_due_notifications();

  perform assert('a drawn exchange stops nudging anybody',
    queued(v_drawn, 'registration_reminder') = 0
    and queued(v_drawn, 'draw_reminder') = 0);

  raise notice '--- queue due: all checks passed ---';
end $$;
