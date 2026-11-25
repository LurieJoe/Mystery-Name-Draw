-- Anonymous messaging: what each end may learn.
--
-- The thing worth proving is a negative. A receiver can hold a whole
-- conversation with their gifter and still not be able to name them,
-- and the organizer cannot see that the conversation exists at all.

\set ON_ERROR_STOP on

-- Defined here as well as in access.sql so either file runs on its own.
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
  v_exchange_id uuid;
  v_organizer_token text;
  v_joe uuid;
  v_joe_token text;
  v_evelyn uuid;
  v_evelyn_token text;
  v_alan uuid;
  v_alan_token text;
  v_thread jsonb;
  v_pending integer;
begin
  v_created := create_exchange(jsonb_build_object(
    'name', 'Book swap',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Joe', 'email', 'joe@example.com'),
      jsonb_build_object('name', 'Evelyn', 'email', 'evelyn@example.com'),
      jsonb_build_object('name', 'Theo', 'email', 'alan@example.com'))
  ));

  v_exchange_id := (v_created ->> 'exchangeId')::uuid;
  v_organizer_token := v_created ->> 'organizerToken';

  select (value ->> 'id')::uuid, value ->> 'token' into v_joe, v_joe_token
  from jsonb_array_elements(v_created -> 'invitees')
  where value ->> 'email' = 'joe@example.com';

  select (value ->> 'id')::uuid, value ->> 'token' into v_evelyn, v_evelyn_token
  from jsonb_array_elements(v_created -> 'invitees')
  where value ->> 'email' = 'evelyn@example.com';

  select (value ->> 'id')::uuid, value ->> 'token' into v_alan, v_alan_token
  from jsonb_array_elements(v_created -> 'invitees')
  where value ->> 'email' = 'alan@example.com';

  -- Before the draw there is nobody to talk to.
  perform assert('no thread exists before the draw',
    not (my_thread(v_joe_token, 'giver') ->> 'available')::boolean);

  begin
    perform send_message(v_joe_token, 'giver', 'Hello?');
    perform assert('messaging before the draw is refused', false);
  exception when check_violation then
    perform assert('messaging before the draw is refused', true);
  end;

  -- Evelyn writes a preference at registration. It matters that this
  -- exists: the organizer is meant to see it, so a check that the
  -- organizer cannot see the conversation has to be about words that
  -- appear only in the conversation.
  update invitees set preferences = 'Likes candles' where id = v_evelyn;

  -- Joe draws Evelyn, Evelyn draws Theo, Theo draws Joe.
  insert into assignments (exchange_id, giver_id, receiver_id)
  values (v_exchange_id, v_joe, v_evelyn),
         (v_exchange_id, v_evelyn, v_alan),
         (v_exchange_id, v_alan, v_joe);
  update exchanges set drawn_at = now() where id = v_exchange_id;

  -- Joe knows who he drew, so his end of the thread is named.
  v_thread := my_thread(v_joe_token, 'giver');
  perform assert('a giver is told who they are writing to',
    v_thread ->> 'withName' = 'Evelyn');

  -- Evelyn does not know who drew her, and nothing here tells her.
  v_thread := my_thread(v_evelyn_token, 'receiver');
  perform assert('a receiver is told nothing about who drew them',
    v_thread -> 'withName' is null or v_thread ->> 'withName' is null);
  perform assert('and no identifier for them leaks into the thread',
    v_thread::text not like '%' || v_joe::text || '%'
    and v_thread::text not like '%Joe%');

  -- A question in each direction.
  perform send_message(v_joe_token, 'giver',
    'I know you like candles. Any scent you would rather avoid?');
  perform send_message(v_evelyn_token, 'receiver',
    'Nothing with vanilla, please.');

  v_thread := my_thread(v_evelyn_token, 'receiver');
  perform assert('both messages are in the thread',
    jsonb_array_length(v_thread -> 'messages') = 2);
  perform assert('each message says only you or them',
    not exists (
      select 1 from jsonb_array_elements(v_thread -> 'messages')
      where value ->> 'from' not in ('you', 'them')
    ));

  -- What the labels actually say, from each end.
  perform assert('a receiver sees Your Giver, not a name',
    v_thread ->> 'withLabel' = 'Your Giver'
    and exists (
      select 1 from jsonb_array_elements(v_thread -> 'messages')
      where value ->> 'fromLabel' = 'Your Giver'
    )
    and exists (
      select 1 from jsonb_array_elements(v_thread -> 'messages')
      where value ->> 'fromLabel' = 'You'
    ));

  perform assert('and a giver sees the name of the person they drew',
    my_thread(v_joe_token, 'giver') ->> 'withLabel' = 'Evelyn'
    and exists (
      select 1 from jsonb_array_elements(
        my_thread(v_joe_token, 'giver') -> 'messages')
      where value ->> 'fromLabel' = 'Evelyn'
    ));
  perform assert('the reply still names nobody',
    v_thread::text not like '%Joe%');

  -- Evelyn's own two threads are different conversations.
  perform assert('a person is in two threads, with different people',
    (my_thread(v_evelyn_token, 'giver') ->> 'withName') = 'Theo'
    and (my_thread(v_evelyn_token, 'receiver') -> 'withName') = 'null'::jsonb);

  -- Theo is in neither of those conversations.
  perform assert('a third party sees none of it',
    jsonb_array_length(my_thread(v_alan_token, 'giver') -> 'messages') = 0
    and jsonb_array_length(my_thread(v_alan_token, 'receiver') -> 'messages') = 0);

  -- The organizer is the one who must learn nothing at all.
  perform assert('the organizer view carries no message text',
    organizer_view(v_organizer_token)::text not like '%vanilla%'
    and organizer_view(v_organizer_token)::text not like '%scent%');

  -- The counterpart, stated so a change to it is a failing test rather
  -- than a surprise: preferences are the organizer's to see.
  perform assert('though the organizer does see stated preferences',
    organizer_view(v_organizer_token)::text like '%Likes candles%');
  perform assert('and does not reveal that a thread exists',
    not (organizer_view(v_organizer_token) ? 'messages')
    and not (organizer_view(v_organizer_token) ? 'threads'));

  -- The email job knows an inbox, and that is all it hands over.
  -- Scoped to this exchange: the queue is global, so an unscoped count
  -- passes or fails depending on what ran before it.
  select count(*) into v_pending from pending_message_notifications()
  where exchange_id = v_exchange_id;
  perform assert('both messages are waiting to be notified', v_pending = 2);
  perform assert('a notification names the exchange, not the sender',
    exists (
      select 1 from pending_message_notifications()
      where exchange_id = v_exchange_id
        and to_email = 'evelyn@example.com'
        and exchange_name = 'Book swap'
    ));

  perform assert('and carries the code the link needs',
    exists (
      select 1 from pending_message_notifications()
      where exchange_id = v_exchange_id and length(event_code) = 6
    ));

  perform mark_notified(array(
    select message_id from pending_message_notifications()
    where exchange_id = v_exchange_id
  ));
  select count(*) into v_pending from pending_message_notifications()
  where exchange_id = v_exchange_id;
  perform assert('and they are not notified twice', v_pending = 0);

  -- Reading is per end: Joe reading his thread does not mark his own.
  perform mark_thread_read(v_evelyn_token, 'receiver');
  perform assert('reading marks only what the other end wrote',
    (select count(*) from messages
     where giver_id = v_joe and sender_role = 'giver' and read_at is not null) = 1
    and (select count(*) from messages
     where giver_id = v_joe and sender_role = 'receiver' and read_at is not null) = 0);

  -- The organizer's one lever.
  perform set_messaging_enabled(v_organizer_token, false);

  begin
    perform send_message(v_joe_token, 'giver', 'Still there?');
    perform assert('switching messaging off stops it', false);
  exception when check_violation then
    perform assert('switching messaging off stops it', true);
  end;

  perform set_messaging_enabled(v_organizer_token, true);
  perform send_message(v_joe_token, 'giver', 'Thanks, that helps.');
  perform assert('and switching it back on restores it',
    jsonb_array_length(my_thread(v_joe_token, 'giver') -> 'messages') = 3);

  raise notice '';
  raise notice 'All messaging checks passed.';
end;
$$;
