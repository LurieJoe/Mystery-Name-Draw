-- Tell the organizer when invitations go out.
--
-- They had no record of it beyond a line on screen that disappears
-- when the page does. An address typed wrong is invisible until
-- somebody says they never got anything.
--
-- A new kind rather than a reuse, and it is deliberately exempt from
-- the once-per-exchange index below: invitations can be sent more
-- than once - latecomers, a deliberate resend - and each batch is its
-- own event worth recording.

alter table notifications
  drop constraint notifications_kind_check;

alter table notifications
  add constraint notifications_kind_check check (kind in (
    'invitation',
    'invitations_sent',
    'registration_reminder',
    'registration_closed',
    'draw_reminder',
    'draw_result',
    'draw_failed',
    'message_waiting',
    'registration_roll_call'
  ));

drop index notifications_once_idx;

create unique index notifications_once_idx
  on notifications (exchange_id, kind, coalesce(invitee_id, exchange_id))
  where kind not in ('message_waiting', 'invitation', 'invitations_sent');

-- Lifted from its current definition with the queueing added.

create or replace function send_invitations(
  p_organizer_token text,
  p_resend boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
  v_budget text;
  v_invitee invitees;
  v_before int;
  v_queued int := 0;
  v_skipped int := 0;
  v_recipients jsonb := '[]'::jsonb;
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  if not registration_is_open(v_exchange_id) then
    raise exception 'Registration has closed, so an invitation would be no use'
      using errcode = 'check_violation';
  end if;

  v_budget := gift_budget_label(v_exchange_id);

  for v_invitee in
    select * from invitees
    where exchange_id = v_exchange_id
      and not is_organizer
      -- Somebody who has registered has no use for an invitation, in
      -- either mode: they are already in.
      and status <> 'Registered'
      and (p_resend or status = 'Invite Pending')
      -- One already waiting to go out is enough.
      and not exists (
        select 1 from notifications n
        where n.invitee_id = invitees.id
          and n.kind = 'invitation'
          and n.sent_at is null
      )
    order by created_at
  loop
    select count(*) into v_before from notifications
    where exchange_id = v_exchange_id and kind = 'invitation';

    perform queue_notification(
      v_exchange_id,
      v_invitee.id,
      v_invitee.email,
      'invitation',
      jsonb_build_object('budget', v_budget)
    );

    if (select count(*) from notifications
        where exchange_id = v_exchange_id and kind = 'invitation') > v_before
    then
      v_queued := v_queued + 1;

      -- Marked only once something is really on its way. Somebody who
      -- opted out is left alone and left pending rather than being
      -- recorded as invited when no email was written.
      update invitees
      set status = 'Invited', invited_at = now()
      where id = v_invitee.id;

      v_recipients := v_recipients || jsonb_build_object(
        'name', v_invitee.name, 'email', v_invitee.email);
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  /*
   * Tell the organizer what just went out.
   *
   * Not a copy of the invitation: each one carries the private link
   * that opens that person's page, so forwarding one would hand over
   * somebody else's. This is a list of who it reached, which is what
   * catches a mistyped address, and it is only queued when something
   * really was queued.
   */
  if (v_queued > 0) then
    perform queue_notification(
      v_exchange_id,
      null,
      (select organizer_email from exchanges where id = v_exchange_id),
      'invitations_sent',
      jsonb_build_object('recipients', v_recipients)
    );
  end if;

  return jsonb_build_object('queued', v_queued, 'skipped', v_skipped);
end;
$$;

revoke all on function send_invitations(text, boolean) from public;
grant execute on function send_invitations(text, boolean) to anon;
