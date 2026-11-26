-- A reminder must never be the first thing somebody hears from us.

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
  v_token text;
  v_waiting uuid;
  v_delivered uuid;
  v_manual uuid;
  v_reminders int;
begin
  -- Deadline two days out, which is when the reminder becomes due.
  v_created := create_exchange(jsonb_build_object(
    'name', 'Reminder ordering',
    'registrationDeadline', (current_date + 2)::text,
    'drawDate', (current_date + 9)::text,
    'timeZone', 'UTC',
    'remindBeforeRegistrationDeadline', true,
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Waiting', 'email', 'waiting@example.com'),
      jsonb_build_object('name', 'Delivered', 'email', 'delivered@example.com'),
      jsonb_build_object('name', 'Manual', 'email', 'manual@example.com'))
  ));

  v_id := (v_created ->> 'exchangeId')::uuid;
  v_token := v_created ->> 'organizerToken';

  select id into v_waiting from invitees
  where exchange_id = v_id and email = 'waiting@example.com';
  select id into v_delivered from invitees
  where exchange_id = v_id and email = 'delivered@example.com';
  select id into v_manual from invitees
  where exchange_id = v_id and email = 'manual@example.com';

  perform send_invitations(v_token);

  -- One got through; one is still sitting in the queue, which is what
  -- a refused send looks like until it is retried. The third was
  -- never queued at all: the organizer invited them their own way.
  update notifications set sent_at = now()
  where invitee_id = v_delivered and kind = 'invitation';

  delete from notifications
  where invitee_id = v_manual and kind = 'invitation';

  update invitees set status = 'Invite Pending' where id = v_manual;

  -- Nine in the morning, local to the exchange, has to have passed.
  perform queue_due_notifications();

  select count(*) into v_reminders from notifications
  where exchange_id = v_id and kind = 'registration_reminder';

  perform assert('the person whose invitation is still queued is left alone',
    not exists (select 1 from notifications
                where invitee_id = v_waiting
                  and kind = 'registration_reminder'));

  perform assert('the person whose invitation went gets their reminder',
    exists (select 1 from notifications
            where invitee_id = v_delivered
              and kind = 'registration_reminder'));

  perform assert('and so does somebody the organizer invited themselves',
    exists (select 1 from notifications
            where invitee_id = v_manual
              and kind = 'registration_reminder'));

  perform assert('which is two reminders, not three',
    v_reminders = 2);

  -- Once the invitation finally goes, the reminder follows.
  update notifications set sent_at = now()
  where invitee_id = v_waiting and kind = 'invitation';

  perform queue_due_notifications();

  perform assert('the held reminder goes out once the invitation has',
    exists (select 1 from notifications
            where invitee_id = v_waiting
              and kind = 'registration_reminder'));

  raise notice '';
  raise notice 'All reminder ordering checks passed.';
end;
$$;
