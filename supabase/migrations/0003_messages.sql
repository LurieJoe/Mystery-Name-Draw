-- Anonymous messaging between the two ends of one assignment.
--
-- Joe draws Evelyn. Joe can ask her what scents she dislikes, and
-- Evelyn can ask her gifter for something specific. Neither question
-- can be asked out loud without spoiling the draw.
--
-- Three things follow from that, and they shape everything here.
--
-- A thread is an assignment. There is exactly one conversation per
-- drawn pair, and every person is in two of them: one where they are
-- the giver and know who they are talking to, and one where they are
-- the receiver and do not. The anonymity runs one way only. The giver
-- knows the receiver by definition, which is the whole point of having
-- drawn them.
--
-- The organizer must not see any of this. Not the messages, not who has
-- a thread, not how many there are. A thread is an assignment, so
-- anything that reveals one reveals the draw. There is deliberately no
-- organizer function in this file that returns a message or counts one.
--
-- Nothing may travel by email. A reply that arrives in an inbox carries
-- an address, and an address is a name. Notifications say only that a
-- message is waiting, and link back to the thread.

-- Lets the organizer switch messaging off for the whole exchange
-- without learning anything about who is talking to whom. It is the
-- only lever they have over this, on purpose.
alter table exchanges
  add column messaging_enabled boolean not null default true;

create table messages (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null,

  -- The thread, named by the assignment it belongs to. The foreign key
  -- means a conversation cannot exist without a draw behind it, and a
  -- re-drawn exchange takes its old conversations with it.
  giver_id uuid not null,
  receiver_id uuid not null references invitees (id) on delete cascade,

  -- Which end wrote it. Never a name: the reader is told "you" or
  -- "them", and who "them" is depends on which end they are.
  sender_role text not null check (sender_role in ('giver', 'receiver')),

  body text not null check (length(btrim(body)) between 1 and 2000),

  created_at timestamptz not null default now(),
  read_at timestamptz,

  -- Set once the "you have a message" email has gone out. The email
  -- carries no part of the message and names nobody: it says a message
  -- is waiting and links back to the thread, because an inbox is the
  -- one place an address could give a sender away.
  notified_at timestamptz,

  foreign key (exchange_id, giver_id)
    references assignments (exchange_id, giver_id) on delete cascade
);

create index messages_thread_idx
  on messages (exchange_id, giver_id, created_at);

alter table messages enable row level security;

-- --------------------------------------------------------------------
-- Reading and writing a thread
-- --------------------------------------------------------------------

/*
 * The thread a token can reach, from the end it reaches it by.
 *
 * p_as is 'giver' for the person you drew, and 'receiver' for whoever
 * drew you. A person's two threads are different conversations with
 * different people, so the caller has to say which one they mean.
 */
create or replace function thread_for(p_invitee_token text, p_as text)
returns assignments
language sql
stable
set search_path = public, pg_temp
as $$
  select a.*
  from assignments a
  join invitees i on i.invitee_token_hash = token_hash(p_invitee_token)
  where (p_as = 'giver' and a.giver_id = i.id)
     or (p_as = 'receiver' and a.receiver_id = i.id);
$$;

create or replace function my_thread(p_invitee_token text, p_as text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_thread assignments;
  v_me uuid := invitee_for_token(p_invitee_token);
begin
  if v_me is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  v_thread := thread_for(p_invitee_token, p_as);

  if v_thread.giver_id is null then
    -- Before the draw there is nobody to talk to, and saying so reveals
    -- nothing: everyone is in the same position.
    return jsonb_build_object('available', false, 'messages', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'available', true,
    -- A giver is talking to someone they know. A receiver is not, and
    -- is never told more than this.
    'withName', case
      when p_as = 'giver'
        then (select name from invitees where id = v_thread.receiver_id)
      else null
    end,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'from', case when m.sender_role = p_as then 'you' else 'them' end,
        'body', m.body,
        'at', m.created_at
      ) order by m.created_at)
      from messages m
      where m.exchange_id = v_thread.exchange_id
        and m.giver_id = v_thread.giver_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function send_message(
  p_invitee_token text,
  p_as text,
  p_body text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_thread assignments;
  v_recent integer;
begin
  if invitee_for_token(p_invitee_token) is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  if p_as not in ('giver', 'receiver') then
    raise exception 'Unknown end of the conversation'
      using errcode = 'check_violation';
  end if;

  v_thread := thread_for(p_invitee_token, p_as);

  if v_thread.giver_id is null then
    raise exception 'There is nobody to message yet'
      using errcode = 'check_violation';
  end if;

  if not (select messaging_enabled from exchanges where id = v_thread.exchange_id) then
    raise exception 'Messaging is switched off for this exchange'
      using errcode = 'check_violation';
  end if;

  -- An anonymous channel is the one place in this app where somebody
  -- can be unpleasant at no cost, so it is not also an unlimited one.
  select count(*) into v_recent
  from messages
  where exchange_id = v_thread.exchange_id
    and giver_id = v_thread.giver_id
    and sender_role = p_as
    and created_at > now() - interval '1 day';

  if v_recent >= 20 then
    raise exception 'That is a lot of messages for one day. Try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  insert into messages (exchange_id, giver_id, receiver_id, sender_role, body)
  values (v_thread.exchange_id, v_thread.giver_id, v_thread.receiver_id,
          p_as, btrim(p_body));

  return my_thread(p_invitee_token, p_as);
end;
$$;

create or replace function mark_thread_read(p_invitee_token text, p_as text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_thread assignments := thread_for(p_invitee_token, p_as);
begin
  if v_thread.giver_id is null then
    return;
  end if;

  update messages
  set read_at = now()
  where exchange_id = v_thread.exchange_id
    and giver_id = v_thread.giver_id
    and sender_role <> p_as
    and read_at is null;
end;
$$;

/*
 * For the email job, which runs as the service role in an Edge
 * Function and never in a browser. It has to know which inbox to write
 * to, so it necessarily sees a pairing: that is why it is not reachable
 * from the front end, and why the email it sends carries no names and
 * no message text.
 */
create or replace function pending_message_notifications()
returns table (
  message_id uuid,
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
    and recipient.unsubscribed_at is null
  order by m.created_at;
$$;

create or replace function mark_notified(p_message_ids uuid[])
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update messages set notified_at = now()
  where id = any(p_message_ids) and notified_at is null;
$$;

-- --------------------------------------------------------------------
-- The organizer's only lever
-- --------------------------------------------------------------------

/*
 * Switches messaging off for everyone in the exchange. Deliberately
 * blunt: a report cannot name the sender without naming an assignment,
 * so the organizer is given a lever that works without ever learning
 * who was talking to whom.
 */
create or replace function set_messaging_enabled(
  p_organizer_token text,
  p_enabled boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  update exchanges set messaging_enabled = p_enabled where id = v_exchange_id;

  return organizer_view(p_organizer_token);
end;
$$;

-- --------------------------------------------------------------------
-- Permissions
-- --------------------------------------------------------------------

revoke all on function my_thread(text, text) from public;
revoke all on function send_message(text, text, text) from public;
revoke all on function mark_thread_read(text, text) from public;
revoke all on function set_messaging_enabled(text, boolean) from public;

grant execute on function my_thread(text, text) to anon;
grant execute on function send_message(text, text, text) to anon;
grant execute on function mark_thread_read(text, text) to anon;
grant execute on function set_messaging_enabled(text, boolean) to anon;

-- thread_for is a helper, not an entry point: it returns an assignment
-- row, which is the secret itself. Not granted to anyone.
revoke all on function thread_for(text, text) from public, anon;

-- The notification job's two functions see pairings by necessity, so
-- they stay with the service role and never reach a browser.
revoke all on function pending_message_notifications() from public, anon;
revoke all on function mark_notified(uuid[]) from public, anon;
