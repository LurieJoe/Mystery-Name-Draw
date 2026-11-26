-- Don't send the last call before the invitation.
--
-- registration_reminder went to everybody who had not registered,
-- which includes people whose invitation was queued and had not gone
-- out yet. On a real exchange four sends were refused by Resend for
-- exceeding its rate limit, and the reminder that followed an hour
-- later reached somebody whose invitation had not. Their first word
-- from this app was that registration closes on Friday.
--
-- Reproduced from its current definition with that one condition
-- added, lifted rather than retyped.

create or replace function queue_due_notifications()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_e exchanges;
  v_i invitees;
  v_m record;
  v_reminders int := 0;
  v_closed int := 0;
  v_draw_reminders int := 0;
  v_messages int := 0;
  v_before int;
begin
  for v_e in
    select * from exchanges where drawn_at is null
  loop
    -- ----------------------------------------------------------------
    -- Two days before the deadline, to whoever has not registered
    -- ----------------------------------------------------------------
    if v_e.remind_before_registration_deadline
       and registration_is_open(v_e.id)
       and local_morning_passed(v_e.id, v_e.registration_deadline - 2)
    then
      for v_i in
        select * from invitees
        where exchange_id = v_e.id
          and status <> 'Registered'
          and not is_organizer
          /*
           * Never overtake the invitation.
           *
           * A reminder is a second word to somebody who has had a
           * first. When an invitation is still sitting in the queue,
           * or has failed and is waiting to be retried, "last call"
           * would be the first thing they ever hear from us - and it
           * happened: four sends were refused for going too fast, and
           * one person was asked to hurry up and register for an
           * exchange they had never been told about.
           *
           * Somebody the organizer invited by their own means has no
           * invitation row at all, so this does not hold them back.
           */
          and not exists (
            select 1 from notifications n
            where n.invitee_id = invitees.id
              and n.kind = 'invitation'
              and n.sent_at is null
          )
      loop
        select count(*) into v_before from notifications
        where exchange_id = v_e.id and kind = 'registration_reminder';

        perform queue_notification(
          v_e.id, v_i.id, v_i.email, 'registration_reminder');

        if (select count(*) from notifications
            where exchange_id = v_e.id
              and kind = 'registration_reminder') > v_before then
          v_reminders := v_reminders + 1;
        end if;
      end loop;
    end if;

    -- ----------------------------------------------------------------
    -- The morning after the deadline: registration has closed
    -- ----------------------------------------------------------------
    if not registration_is_open(v_e.id)
       and local_morning_passed(v_e.id, v_e.registration_deadline + 1)
    then
      -- The organizer hears either way: a roll call is as useful when
      -- everybody came as when they did not.
      perform queue_notification(
        v_e.id, null, v_e.organizer_email, 'registration_roll_call',
        jsonb_build_object(
          'registered', (select count(*) from invitees
                         where exchange_id = v_e.id
                           and status = 'Registered'),
          'invited', (select count(*) from invitees
                      where exchange_id = v_e.id and not is_organizer)
        ));

      -- Participants only hear about it when there is something to
      -- do. Telling people restrictions have opened, in an exchange
      -- whose dates leave no window, is the same promise the
      -- registration screens were changed to stop making.
      if restriction_window_days(v_e.id) >= 2 then
        for v_i in
          select * from invitees
          where exchange_id = v_e.id and status = 'Registered'
        loop
          select count(*) into v_before from notifications
          where exchange_id = v_e.id and kind = 'registration_closed';

          perform queue_notification(
            v_e.id, v_i.id, v_i.email, 'registration_closed',
            jsonb_build_object(
              'people', (select count(*) from invitees
                         where exchange_id = v_e.id
                           and status = 'Registered')));

          if (select count(*) from notifications
              where exchange_id = v_e.id
                and kind = 'registration_closed') > v_before then
            v_closed := v_closed + 1;
          end if;
        end loop;
      end if;
    end if;

    -- ----------------------------------------------------------------
    -- Two days before the draw: last chance to change anything
    -- ----------------------------------------------------------------
    if v_e.remind_before_draw_date
       and local_morning_passed(v_e.id, v_e.draw_date - 2)
    then
      for v_i in
        select * from invitees
        where exchange_id = v_e.id and status = 'Registered'
      loop
        select count(*) into v_before from notifications
        where exchange_id = v_e.id and kind = 'draw_reminder';

        perform queue_notification(
          v_e.id, v_i.id, v_i.email, 'draw_reminder');

        if (select count(*) from notifications
            where exchange_id = v_e.id
              and kind = 'draw_reminder') > v_before then
          v_draw_reminders := v_draw_reminders + 1;
        end if;
      end loop;
    end if;
  end loop;

  -- ------------------------------------------------------------------
  -- Messages, which are not on anybody's calendar
  --
  -- No nine-in-the-morning rule: somebody is waiting for an answer,
  -- and an hour is already the delay. The hour is deliberate, though -
  -- a notification arriving seconds after the other person put their
  -- phone down would tell a receiver who their giver is.
  -- ------------------------------------------------------------------
  for v_m in select * from pending_message_notifications()
  loop
    declare
      v_recipient uuid;
    begin
      select id into v_recipient from invitees
      where exchange_id = v_m.exchange_id and lower(email) = lower(v_m.to_email);

      -- Marked notified either way. The message has been accounted
      -- for; whether it earns an email of its own depends on whether
      -- one is already on its way, and a second "you have a message"
      -- sitting behind the first tells them nothing new.
      perform mark_notified(array[v_m.message_id]);

      if not exists (
        select 1 from notifications
        where exchange_id = v_m.exchange_id
          and invitee_id = v_recipient
          and kind = 'message_waiting'
          and sent_at is null
      ) then
        perform queue_notification(
          v_m.exchange_id, v_recipient, v_m.to_email, 'message_waiting');

        v_messages := v_messages + 1;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'registrationReminders', v_reminders,
    'registrationClosed', v_closed,
    'drawReminders', v_draw_reminders,
    'messages', v_messages
  );
end;
$$;

revoke all on function queue_due_notifications() from public, anon;
