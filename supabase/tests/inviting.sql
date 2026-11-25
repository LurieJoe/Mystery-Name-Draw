-- Adding people, taking them off, and sending the invitations.

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
  v_exchange_id uuid;
  v_organizer_token text;
  v_rowan uuid;
  v_added jsonb;
  v_mina uuid;
  v_sent jsonb;
  v_note notifications;
  v_closed jsonb;
  v_closed_token text;
  v_theo uuid;
  v_counts jsonb;
  v_edited jsonb;
  v_old_hash text;
begin
  v_created := create_exchange(jsonb_build_object(
    'name', 'Office swap',
    'giftBudget', '25',
    'currency', 'GBP',
    'registrationDeadline', (current_date + 7)::text,
    'drawDate', (current_date + 21)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana@example.com', 'participating', true),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Rowan', 'email', 'rowan@example.com'))
  ));

  v_exchange_id := (v_created ->> 'exchangeId')::uuid;
  v_organizer_token := v_created ->> 'organizerToken';

  select (value ->> 'id')::uuid into v_rowan
  from jsonb_array_elements(v_created -> 'invitees')
  where value ->> 'email' = 'rowan@example.com';

  -- ------------------------------------------------------------------
  -- Adding
  -- ------------------------------------------------------------------

  v_added := add_invitee(v_organizer_token, 'Mina', 'Mina@Example.com');
  v_mina := (v_added ->> 'id')::uuid;

  perform assert('somebody added lands on the list as pending',
    v_added ->> 'status' = 'Invite Pending'
    and exists (select 1 from invitees
                where id = v_mina and exchange_id = v_exchange_id));

  perform assert('their address is stored the way addresses are matched',
    v_added ->> 'email' = 'mina@example.com');

  perform assert('and no token for them comes back to the organizer',
    not (v_added ? 'token'));

  begin
    perform add_invitee(v_organizer_token, 'mina', 'MINA@example.com');
    perform assert('the same person cannot be added twice', false);
  exception when unique_violation then
    perform assert('the same person cannot be added twice', true);
  end;

  -- A family reading one inbox: separate people, one address.
  perform add_invitee(v_organizer_token, 'Nell', 'mina@example.com');

  perform assert('but somebody else may share that address',
    (select count(*) from invitees
     where exchange_id = v_exchange_id and email = 'mina@example.com') = 2);

  begin
    perform add_invitee(v_organizer_token, '', 'nameless@example.com');
    perform assert('a nameless person is refused', false);
  exception when check_violation then
    perform assert('a nameless person is refused', true);
  end;

  begin
    perform add_invitee(v_organizer_token, 'No Address', '   ');
    perform assert('so is one with no address', false);
  exception when check_violation then
    perform assert('so is one with no address', true);
  end;

  begin
    perform add_invitee('not-a-token', 'Theo', 'theo@example.com');
    perform assert('a token nobody holds adds nobody', false);
  exception when no_data_found then
    perform assert('a token nobody holds adds nobody', true);
  end;

  -- ------------------------------------------------------------------
  -- Sending
  -- ------------------------------------------------------------------

  v_sent := send_invitations(v_organizer_token);

  perform assert('everybody on the list is invited',
    (v_sent ->> 'queued')::int = 3 and (v_sent ->> 'skipped')::int = 0);

  perform assert('and the organizer is not emailed an invitation',
    not exists (
      select 1 from notifications n
      join invitees i on i.id = n.invitee_id
      where n.kind = 'invitation' and i.is_organizer));

  perform assert('each is marked invited, with a date',
    (select count(*) from invitees
     where exchange_id = v_exchange_id
       and status = 'Invited' and invited_at is not null) = 3);

  select * into v_note from notifications
  where exchange_id = v_exchange_id and kind = 'invitation'
    and invitee_id = v_rowan;

  perform assert('the invitation carries the budget the email prints',
    v_note.context ->> 'budget' = '£25 GBP');

  perform assert('and nothing about who drew whom',
    v_note.context::text not like '%assignment%'
    and v_note.context::text not like '%receiver%');

  v_sent := send_invitations(v_organizer_token);

  perform assert('running it again sends nothing, because nobody is pending',
    (v_sent ->> 'queued')::int = 0);

  perform assert('and there is still one invitation per person',
    (select count(*) from notifications
     where exchange_id = v_exchange_id and kind = 'invitation') = 3);

  -- Somebody added later is the only one the next run picks up.
  perform add_invitee(v_organizer_token, 'Theo', 'theo@example.com');
  v_sent := send_invitations(v_organizer_token);

  perform assert('a latecomer is invited on their own',
    (v_sent ->> 'queued')::int = 1
    and (select count(*) from notifications
         where exchange_id = v_exchange_id and kind = 'invitation') = 4);

  select id into v_theo from invitees
  where exchange_id = v_exchange_id and email = 'theo@example.com';

  -- ------------------------------------------------------------------
  -- Resending, on purpose
  -- ------------------------------------------------------------------

  -- Nothing resends while the first batch is still in the queue, so
  -- the sender has to have run for this to be a fair test.
  update notifications set sent_at = now()
  where exchange_id = v_exchange_id and kind = 'invitation';

  v_sent := send_invitations(v_organizer_token, true);

  perform assert('a resend reaches everybody who has not registered',
    (v_sent ->> 'queued')::int = 4);

  perform assert('and leaves a second invitation for each of them',
    (select count(*) from notifications
     where exchange_id = v_exchange_id and kind = 'invitation') = 8);

  v_sent := send_invitations(v_organizer_token, true);

  perform assert('resending again while they are queued adds nothing',
    (v_sent ->> 'queued')::int = 0
    and (select count(*) from notifications
         where exchange_id = v_exchange_id and kind = 'invitation') = 8);

  update notifications set sent_at = now()
  where exchange_id = v_exchange_id and kind = 'invitation';

  -- Somebody who registers is past needing one, either way.
  update invitees set status = 'Registered', registered_at = now()
  where id = v_theo;

  v_sent := send_invitations(v_organizer_token, true);

  perform assert('and somebody who has registered is never sent one',
    (v_sent ->> 'queued')::int = 3
    and not exists (
      select 1 from notifications
      where invitee_id = v_theo and kind = 'invitation' and sent_at is null));

  update notifications set sent_at = now()
  where exchange_id = v_exchange_id and kind = 'invitation';

  update invitees set status = 'Invited', registered_at = null
  where id = v_theo;

  -- ------------------------------------------------------------------
  -- An address that was typed wrong
  -- ------------------------------------------------------------------

  select invitee_token_hash into v_old_hash from invitees where id = v_rowan;

  v_edited := update_invitee(
    v_organizer_token, v_rowan, 'Rowan', 'Rowan@Correct.example.com');

  perform assert('the corrected address is stored, folded as addresses are',
    v_edited ->> 'email' = 'rowan@correct.example.com'
    and (v_edited ->> 'addressChanged')::boolean);

  perform assert('and they are owed an invitation again',
    v_edited ->> 'status' = 'Invite Pending'
    and (select invited_at from invitees where id = v_rowan) is null);

  perform assert('the link that went to the wrong inbox stops working',
    (select invitee_token_hash from invitees where id = v_rowan)
      <> v_old_hash
    and not exists (
      select 1 from invitee_tokens where invitee_id = v_rowan));

  -- A reminder queued before the correction must not still be
  -- addressed to the inbox the organizer just disowned.
  perform queue_notification(
    v_exchange_id, v_rowan,
    (select email from invitees where id = v_rowan),
    'registration_reminder');

  update invitees set email = 'rowan@typo.example.com' where id = v_rowan;
  update notifications set to_email = 'rowan@typo.example.com'
  where invitee_id = v_rowan and sent_at is null;

  perform update_invitee(
    v_organizer_token, v_rowan, 'Rowan', 'rowan@correct.example.com');

  perform assert('anything still in the queue follows them to the new address',
    not exists (
      select 1 from notifications
      where invitee_id = v_rowan and sent_at is null
        and to_email <> 'rowan@correct.example.com'));

  perform assert('and what already went out is left as it was sent',
    exists (
      select 1 from notifications
      where invitee_id = v_rowan and sent_at is not null
        and to_email <> 'rowan@correct.example.com'));

  v_sent := send_invitations(v_organizer_token);

  perform assert('the next ordinary send reaches the corrected address',
    (v_sent ->> 'queued')::int = 1
    and exists (
      select 1 from notifications
      where invitee_id = v_rowan and kind = 'invitation'
        and sent_at is null
        and to_email = 'rowan@correct.example.com'));

  -- Correcting only a name leaves the link alone.
  select invitee_token_hash into v_old_hash from invitees where id = v_rowan;

  v_edited := update_invitee(
    v_organizer_token, v_rowan, 'Rowan Hale', 'rowan@correct.example.com');

  perform assert('fixing a spelling does not disturb their link',
    not (v_edited ->> 'addressChanged')::boolean
    and (select invitee_token_hash from invitees where id = v_rowan)
        = v_old_hash);

  begin
    perform update_invitee(
      v_organizer_token, v_rowan, 'Theo', 'theo@example.com');
    perform assert('and cannot be turned into somebody already here', false);
  exception when unique_violation then
    perform assert('and cannot be turned into somebody already here', true);
  end;

  perform update_invitee(
    v_organizer_token, v_rowan, 'Rowan Hale', 'theo@example.com');

  perform assert('though they may be moved to an address somebody shares',
    (select email from invitees where id = v_rowan) = 'theo@example.com');

  perform update_invitee(
    v_organizer_token, v_rowan, 'Rowan Hale', 'rowan@correct.example.com');

  -- Somebody already registered keeps the link they are using.
  select invitee_token_hash into v_old_hash from invitees where id = v_theo;
  update invitees set status = 'Registered' where id = v_theo;

  perform update_invitee(
    v_organizer_token, v_theo, 'Theo', 'theo@newjob.example.com');

  perform assert('a registered person keeps the link they already have',
    (select invitee_token_hash from invitees where id = v_theo) = v_old_hash
    and (select status from invitees where id = v_theo) = 'Registered');

  update invitees set status = 'Invited' where id = v_theo;

  -- ------------------------------------------------------------------
  -- What the button is allowed to say
  -- ------------------------------------------------------------------

  v_counts := invitation_counts(v_organizer_token);

  perform assert('the counts leave the organizer out of it',
    (v_counts ->> 'pending')::int
      + (v_counts ->> 'invited')::int
      + (v_counts ->> 'registered')::int
    = (select count(*) from invitees
       where exchange_id = v_exchange_id and not is_organizer));

  perform assert('and say how many are already in the queue',
    (v_counts ->> 'waiting')::int =
      (select count(*) from invitees i
       where i.exchange_id = v_exchange_id and not i.is_organizer
         and exists (select 1 from notifications n
                     where n.invitee_id = i.id and n.kind = 'invitation'
                       and n.sent_at is null)));

  update notifications set sent_at = now()
  where exchange_id = v_exchange_id and kind = 'invitation';

  -- ------------------------------------------------------------------
  -- Somebody who opted out
  -- ------------------------------------------------------------------

  perform add_invitee(v_organizer_token, 'Alan', 'alan@example.com');

  update invitees set unsubscribed_at = now()
  where exchange_id = v_exchange_id and email = 'alan@example.com';

  v_sent := send_invitations(v_organizer_token);

  perform assert('somebody who opted out is skipped, not emailed',
    (v_sent ->> 'skipped')::int = 1
    and not exists (
      select 1 from notifications n
      join invitees i on i.id = n.invitee_id
      where i.email = 'alan@example.com' and n.kind = 'invitation'));

  perform assert('and is not recorded as having been invited',
    (select status from invitees
     where exchange_id = v_exchange_id and email = 'alan@example.com')
    = 'Invite Pending');

  -- ------------------------------------------------------------------
  -- Removing
  -- ------------------------------------------------------------------

  -- Set straight into the table: organizer restrictions arrive with
  -- the exchange, and there is no function to add one afterwards.
  insert into restrictions (exchange_id, owner_invitee_id, other_invitee_id,
                            direction, set_by_organizer)
  values (v_exchange_id, v_mina, v_rowan, 'give', true);

  perform assert('a restriction naming them is in place',
    exists (select 1 from restrictions
            where exchange_id = v_exchange_id
              and (owner_invitee_id = v_mina or other_invitee_id = v_mina)));

  perform remove_invitee(v_organizer_token, v_mina);

  perform assert('removing somebody takes their row',
    not exists (select 1 from invitees where id = v_mina));

  perform assert('and every restriction that named them',
    not exists (select 1 from restrictions
                where owner_invitee_id = v_mina or other_invitee_id = v_mina));

  perform assert('and anything still queued for them',
    not exists (select 1 from notifications where invitee_id = v_mina));

  begin
    perform remove_invitee(v_organizer_token,
      (select id from invitees
       where exchange_id = v_exchange_id and is_organizer));
    perform assert('the organizer cannot be removed this way', false);
  exception when check_violation then
    perform assert('the organizer cannot be removed this way', true);
  end;

  begin
    perform remove_invitee('not-a-token', v_rowan);
    perform assert('a token nobody holds removes nobody', false);
  exception when no_data_found then
    perform assert('a token nobody holds removes nobody', true);
  end;

  perform assert('so the person it named is still there',
    exists (select 1 from invitees where id = v_rowan));

  -- ------------------------------------------------------------------
  -- Once the door has closed
  -- ------------------------------------------------------------------

  v_closed := create_exchange(jsonb_build_object(
    'name', 'Closed swap',
    'registrationDeadline', (current_date - 1)::text,
    'drawDate', (current_date + 7)::text,
    'timeZone', 'America/New_York',
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana2@example.com', 'participating', false),
    'invitees', jsonb_build_array(
      jsonb_build_object('name', 'Rowan', 'email', 'rowan2@example.com'))
  ));

  v_closed_token := v_closed ->> 'organizerToken';

  begin
    perform add_invitee(v_closed_token, 'Late', 'late@example.com');
    perform assert('nobody is added after registration closes', false);
  exception when check_violation then
    perform assert('nobody is added after registration closes', true);
  end;

  begin
    perform send_invitations(v_closed_token);
    perform assert('and no invitation goes out after it either', false);
  exception when check_violation then
    perform assert('and no invitation goes out after it either', true);
  end;

  -- ------------------------------------------------------------------
  -- What the budget line says
  -- ------------------------------------------------------------------

  perform assert('no limit is said in words, not as an amount',
    (select gift_budget_label(id) from exchanges where id = v_exchange_id
     and false) is null);

  update exchanges set no_gift_limit = true where id = v_exchange_id;
  perform assert('no limit reads as No limit',
    gift_budget_label(v_exchange_id) = 'No limit');

  update exchanges set no_gift_limit = false, gift_budget = null
  where id = v_exchange_id;
  perform assert('and an empty budget reads as Not set',
    gift_budget_label(v_exchange_id) = 'Not set');

  -- Every currency the settings screen offers has a symbol here, or
  -- the invitation prints the amount with nothing in front of it.
  update exchanges set gift_budget = '50' where id = v_exchange_id;

  update exchanges set currency = 'BRL' where id = v_exchange_id;
  perform assert('the Brazilian real has its symbol',
    gift_budget_label(v_exchange_id) = 'R$50 BRL');

  update exchanges set currency = 'EUR' where id = v_exchange_id;
  perform assert('and so do the others',
    gift_budget_label(v_exchange_id) = '€50 EUR');

  raise notice '';
  raise notice 'All inviting checks passed.';
end;
$$;
