-- A throwaway exchange that proves the invitation chain works in
-- production: send_invitations queues, the sender claims, Resend
-- delivers, and the link in the email opens that person's own page.
--
-- THIS SENDS REAL EMAIL. The address below gets three of them.
--
-- Step 1 of 3. Paste into the SQL editor, cleared first, and run.
-- Then smoke-send.sql, then smoke-invite-check.sql.

do $$
declare
  -- ------------------------------------------------------------------
  -- EDIT THIS LINE, then run.
  v_email text := 'jlurie15@live.com';
  -- ------------------------------------------------------------------

  v_created jsonb;
  v_id uuid;
  v_code text;
  v_token text;
  v_a text;
  v_b text;
  v_c text;
  v_sent jsonb;
begin
  if v_email = 'you@example.com' then
    raise exception 'Put your own email address on the v_email line first.';
  end if;

  v_a := split_part(v_email, '@', 1) || '+inv-a@' || split_part(v_email, '@', 2);
  v_b := split_part(v_email, '@', 1) || '+inv-b@' || split_part(v_email, '@', 2);

  -- Two people on one address, which the old schema refused outright.
  -- If this exchange is created at all, shared inboxes work.
  v_c := v_b;

  v_created := create_exchange(jsonb_build_object(
    'name', 'Invitation smoke test',
    'giftBudget', '25',
    'currency', 'USD',
    'registrationDeadline', (current_date + 30)::text,
    'drawDate', (current_date + 35)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Joe', 'email', v_email, 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Test Person A', 'email', v_a),
      jsonb_build_object('name', 'Test Person B', 'email', v_b),
      jsonb_build_object('name', 'Test Person C', 'email', v_c))
  ));

  v_id := (v_created ->> 'exchangeId')::uuid;
  v_code := v_created ->> 'eventCode';
  v_token := v_created ->> 'organizerToken';

  -- Nobody registers. The whole point is the invitation, which only
  -- goes to people who have not been sent one.
  v_sent := send_invitations(v_token);

  raise notice 'Exchange % (%), queued % invitations',
    v_id, v_code, v_sent ->> 'queued';
  raise notice 'Three people, two addresses: % and % (twice)', v_a, v_b;
end $$;

-- What you should see: three invitations queued and unsent, three
-- people still Invited, and two of them sharing one address.
select
  i.name,
  i.email,
  i.status,
  n.kind,
  n.sent_at is null as still_queued
from invitees i
left join notifications n
  on n.invitee_id = i.id and n.kind = 'invitation'
join exchanges e on e.id = i.exchange_id
where e.name = 'Invitation smoke test'
order by i.created_at;
