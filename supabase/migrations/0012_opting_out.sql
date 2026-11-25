-- Opting out of reminders, which until now was a column nothing wrote
-- to: invitees.unsubscribed_at was read in three places and set in
-- none, so nobody could opt out of anything.
--
-- What opting out means is the decision worth writing down. It stops
-- the nudges - the deadline reminder, the draw reminder, the notice
-- that registration closed. It does not stop the two emails somebody
-- registered in order to receive: the one telling them they have a
-- name to buy for, and the one telling them somebody has written to
-- them. An exchange where you never find out who you drew is not an
-- exchange you are in, and a message nobody is told about is worse
-- than no messaging at all.

/*
 * The kinds that arrive whatever somebody has chosen.
 *
 * A function rather than a literal in three places, so adding a new
 * kind of email is a decision about this list rather than something
 * that happens by default.
 */
create or replace function notification_ignores_unsubscribe(p_kind text)
returns boolean
language sql
immutable
as $$
  select p_kind in ('draw_result', 'message_waiting');
$$;

/*
 * Queue one email, unless they asked not to hear about this kind.
 *
 * The rule lives here rather than at each call site so a new caller
 * cannot forget it. record_draw inserts directly and is the one
 * exception, which is safe because draw_result ignores opting out
 * anyway; anything else that queues email should come through here.
 */
create or replace function queue_notification(
  p_exchange_id uuid,
  p_invitee_id uuid,
  p_to_email text,
  p_kind text,
  p_context jsonb default '{}'::jsonb,
  p_send_after timestamptz default now()
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if p_invitee_id is not null
     and not notification_ignores_unsubscribe(p_kind)
     and exists (select 1 from invitees
                 where id = p_invitee_id and unsubscribed_at is not null)
  then
    return;
  end if;

  insert into notifications (
    exchange_id, invitee_id, to_email, kind, context, send_after
  )
  values (
    p_exchange_id, p_invitee_id, p_to_email, p_kind, p_context, p_send_after
  )
  on conflict do nothing;
end;
$$;

/*
 * Messages reach people who opted out.
 *
 * The 0003 version excluded them, which was the opposite of what
 * opting out of reminders should mean: somebody writes to you
 * anonymously and waits for an answer that never comes, with no way
 * for either of you to find out why.
 */
create or replace function pending_message_notifications()
returns table (
  message_id uuid,
  exchange_id uuid,
  event_code text,
  exchange_name text,
  to_email text,
  to_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.id,
    e.id,
    e.event_code,
    e.name,
    recipient.email,
    recipient.name
  from messages m
  join exchanges e on e.id = m.exchange_id
  join invitees recipient
    on recipient.id = case
         when m.sender_role = 'giver' then m.receiver_id
         else m.giver_id
       end
  where m.notified_at is null
    and m.read_at is null
  order by m.created_at;
$$;

/*
 * Turning reminders off, and back on.
 *
 * Theirs to set from their own page, so it takes an invitee token
 * like everything else they control. Returns their view so the screen
 * can show the new state without asking again.
 */
create or replace function set_my_reminders(
  p_invitee_token text,
  p_wanted boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid := invitee_for_token(p_invitee_token);
begin
  if v_id is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  update invitees
  set unsubscribed_at = case when p_wanted then null else now() end
  where id = v_id;

  return registration_view(p_invitee_token);
end;
$$;

revoke all on function set_my_reminders(text, boolean) from public;
grant execute on function set_my_reminders(text, boolean) to anon;
