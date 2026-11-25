-- Everything else that needs an email, queued when it is due.
--
-- The draw queues its own, in the same transaction as the
-- assignments, because a draw with nobody told is worse than no draw.
-- The rest are time-based, and this is what notices they have come
-- round: the deadline reminder, the notice that registration closed,
-- the roll call to the organizer, the draw reminder, and a message
-- somebody is waiting on an answer to.
--
-- Safe to run as often as you like. Every insert goes through
-- queue_notification, which is one-per-kind-per-person and does
-- nothing on a repeat, so this is called on the same hourly schedule
-- as everything else rather than being timed to fire once.

-- --------------------------------------------------------------------
-- One exception to one-of-each-kind
--
-- 0010's index means a person gets at most one notification of each
-- kind per exchange, which is right for every kind that announces a
-- moment: there is one draw, one deadline, one closing. Messages are
-- not like that. Somebody can be written to in November and again in
-- December, and under that index the second would silently never be
-- mentioned.
--
-- So message_waiting is excluded from it, and kept honest a different
-- way below: a new one is not queued while an unsent one is still
-- waiting, so a flurry of messages is one email rather than five.
-- --------------------------------------------------------------------

drop index notifications_once_idx;

create unique index notifications_once_idx
  on notifications (exchange_id, kind, coalesce(invitee_id, exchange_id))
  where kind <> 'message_waiting';

/*
 * Has the local clock passed nine in the morning on this date?
 *
 * Local to the exchange, because a calendar date only means something
 * in a place: the same instant is the day before in Honolulu and the
 * day after in Auckland.
 */
create or replace function local_morning_passed(
  p_exchange_id uuid,
  p_date date
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone e.time_zone) >= (p_date + time '09:00')
  from exchanges e
  where e.id = p_exchange_id;
$$;

/*
 * How many days a draw needs after its deadline for restrictions to
 * be worth telling anybody about.
 *
 * Two, and the reason is not obvious from the dates: the "you can set
 * restrictions now" email goes out at nine the morning after the
 * deadline, and the draw runs at nine on the draw date. One day apart
 * makes those the same moment, so the email would arrive as the
 * matching completed. The app's own screens use the same rule.
 */
create or replace function restriction_window_days(p_exchange_id uuid)
returns int
language sql
stable
set search_path = public, pg_temp
as $$
  select (e.draw_date - e.registration_deadline)::int
  from exchanges e where e.id = p_exchange_id;
$$;

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

revoke all on function queue_due_notifications() from public, anon, authenticated;
grant execute on function queue_due_notifications() to service_role;
