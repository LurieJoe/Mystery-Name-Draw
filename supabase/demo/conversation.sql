-- A whole conversation, narrated, as the database actually answers it.
--
-- Run this in the Supabase SQL editor once the migrations are in, or
-- against a scratch database. It creates an exchange, runs a draw,
-- sends messages both ways, and prints what each person's own API call
-- returns at each step, so you can read the anonymity rather than take
-- my word for it.
--
-- It deletes everything it made on the way out.

do $$
declare
  v_created jsonb;
  v_exchange_id uuid;
  v_organizer_token text;
  v_joe uuid; v_joe_token text;
  v_evelyn uuid; v_evelyn_token text;
  v_view jsonb;
  v_msg jsonb;
begin
  raise notice '';
  raise notice '== Dana sets up an exchange ==';

  v_created := create_exchange(jsonb_build_object(
    'name', 'Office Secret Santa',
    'giftBudget', '25',
    'registrationDeadline', (current_date - 1)::text,
    'drawDate', (current_date + 14)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Joe', 'email', 'joe@example.com'),
      jsonb_build_object('name', 'Evelyn', 'email', 'evelyn@example.com'))
  ));

  v_exchange_id := (v_created ->> 'exchangeId')::uuid;
  v_organizer_token := v_created ->> 'organizerToken';

  select (value ->> 'id')::uuid, value ->> 'token' into v_joe, v_joe_token
  from jsonb_array_elements(v_created -> 'invitees')
  where value ->> 'email' = 'joe@example.com';

  select (value ->> 'id')::uuid, value ->> 'token' into v_evelyn, v_evelyn_token
  from jsonb_array_elements(v_created -> 'invitees')
  where value ->> 'email' = 'evelyn@example.com';

  raise notice 'Event code: %', v_created ->> 'eventCode';
  raise notice 'Joe and Evelyn each got their own registration token.';

  update invitees set status = 'Registered', registered_at = now(),
    preferences = case when id = v_evelyn then 'Likes candles' else null end
  where exchange_id = v_exchange_id;

  raise notice '';
  raise notice '== The draw runs. Joe draws Evelyn. ==';

  insert into assignments (exchange_id, giver_id, receiver_id)
  values (v_exchange_id, v_joe, v_evelyn), (v_exchange_id, v_evelyn, v_joe);
  update exchanges set drawn_at = now() where id = v_exchange_id;

  raise notice 'Joe is told: %', my_assignment(v_joe_token) ->> 'name';
  raise notice 'Evelyn is told: %', my_assignment(v_evelyn_token) ->> 'name';

  raise notice '';
  raise notice '== Joe asks his recipient a question ==';

  perform send_message(v_joe_token, 'giver',
    'I know you like candles. Any scent you would rather avoid?');

  v_view := my_thread(v_joe_token, 'giver');
  raise notice 'Joe''s screen says he is writing to: %',
    v_view ->> 'withLabel';

  v_view := my_thread(v_evelyn_token, 'receiver');
  raise notice 'Evelyn''s screen says the message is from: %',
    v_view ->> 'withLabel';
  for v_msg in select * from jsonb_array_elements(v_view -> 'messages') loop
    raise notice '   %: %', v_msg ->> 'fromLabel', v_msg ->> 'body';
  end loop;

  raise notice '';
  raise notice '== Evelyn answers without knowing who she is answering ==';

  perform send_message(v_evelyn_token, 'receiver', 'Nothing with vanilla, please.');

  v_view := my_thread(v_joe_token, 'giver');
  for v_msg in select * from jsonb_array_elements(v_view -> 'messages') loop
    raise notice '   %: %', v_msg ->> 'fromLabel', v_msg ->> 'body';
  end loop;

  raise notice '';
  raise notice '== What Evelyn can see, in full ==';
  raise notice '%', jsonb_pretty(my_thread(v_evelyn_token, 'receiver'));
  raise notice 'Joe''s name appears in that: %',
    my_thread(v_evelyn_token, 'receiver')::text like '%Joe%';
  raise notice 'Joe''s id appears in that: %',
    my_thread(v_evelyn_token, 'receiver')::text like '%' || v_joe::text || '%';

  raise notice '';
  raise notice '== What Dana the organizer can see ==';
  v_view := organizer_view(v_organizer_token);
  raise notice 'Registered people: %', jsonb_array_length(v_view -> 'invitees');
  -- "candles" is in Evelyn's preferences as well as in the message, so
  -- checking for it would prove nothing. These words are only ever in
  -- the conversation.
  raise notice 'Any of the message text appears in her view: %',
    (v_view::text like '%vanilla%' or v_view::text like '%scent%');
  raise notice 'She does see wishlists and preferences, by design: %',
    v_view::text like '%Likes candles%';
  raise notice 'Her view has an assignments key: %', v_view ? 'assignments';
  raise notice 'Her view has a messages key: %', v_view ? 'messages';

  raise notice '';
  raise notice '== What the email job is given ==';
  raise notice '%', (
    select string_agg(format('   to %s about "%s" (no sender, no text)',
                             to_email, exchange_name), E'\n')
    from pending_message_notifications()
  );

  delete from exchanges where id = v_exchange_id;

  raise notice '';
  raise notice 'Demo data deleted.';
end;
$$;
