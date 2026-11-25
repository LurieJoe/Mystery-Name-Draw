-- Four things the organizer could do on screen but not for real.
--
-- Adding somebody to the list after the exchange exists has been a
-- local illusion: the row appeared, the next page load fetched the
-- roster from here, and the person was gone. Editing an address and
-- removing somebody had the same shape. And the invitation email has
-- had a template, a queue, and a sender for a while now, with nothing
-- anywhere that ever put a row in the queue, so every organizer has
-- been copying one shared link by hand.
--
-- Inviting is deliberately not automatic. Addresses get typed wrong,
-- and an email is the one thing in this app that cannot be taken
-- back, so it waits for the organizer to ask.

-- --------------------------------------------------------------------
-- An invitation may be sent more than once
--
-- Every other kind is once per person per exchange, which is what
-- stops a retry mailing somebody twice. An invitation is the one the
-- organizer may deliberately want again: an address was wrong, or it
-- landed in a junk folder. What stops the duplicates instead is the
-- status on the row and, for a deliberate resend, a check that there
-- is not already one waiting to go out.
-- --------------------------------------------------------------------

drop index notifications_once_idx;

create unique index notifications_once_idx
  on notifications (exchange_id, kind, coalesce(invitee_id, exchange_id))
  where kind not in ('message_waiting', 'invitation');

-- --------------------------------------------------------------------
-- What the invitation says the budget is
--
-- The same three cases as giftBudgetLabel in src/exchange/format.ts,
-- which is where the screen gets it. Two copies of five currency
-- symbols is not ideal; the alternative is the sender inventing the
-- label from parts, which puts the duplication somewhere worse.
-- --------------------------------------------------------------------

create or replace function gift_budget_label(p_exchange_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when e.no_gift_limit then 'No limit'
    when coalesce(trim(e.gift_budget), '') = '' then 'Not set'
    else case e.currency
           when 'GBP' then '£'
           when 'EUR' then '€'
           when 'USD' then '$'
           when 'CAD' then '$'
           when 'AUD' then '$'
           else ''
         end || trim(e.gift_budget) || ' ' || e.currency
  end
  from exchanges e
  where e.id = p_exchange_id;
$$;

-- --------------------------------------------------------------------
-- Adding somebody
-- --------------------------------------------------------------------

create or replace function add_invitee(
  p_organizer_token text,
  p_name text,
  p_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text;
  v_id uuid;
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  if v_name = '' then
    raise exception 'That person needs a name'
      using errcode = 'check_violation';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'That person needs an email address'
      using errcode = 'check_violation';
  end if;

  if (select drawn_at from exchanges where id = v_exchange_id) is not null then
    raise exception 'The draw has run, so the list is closed'
      using errcode = 'check_violation';
  end if;

  -- Somebody added after the deadline could never register, and a row
  -- that can only sit there unregistered is worse than being told now.
  if not registration_is_open(v_exchange_id) then
    raise exception 'Registration has closed, so nobody new can be added'
      using errcode = 'check_violation';
  end if;

  -- An address may be shared: a family reads one inbox and gives
  -- separately. The same name at the same address is a different
  -- thing, and almost always the organizer entering somebody twice.
  if exists (
    select 1 from invitees
    where exchange_id = v_exchange_id
      and lower(email) = v_email
      and lower(name) = lower(v_name)
  ) then
    raise exception 'That person is already on the list'
      using errcode = 'unique_violation';
  end if;

  v_token := new_token();

  insert into invitees (exchange_id, name, email, invitee_token_hash)
  values (v_exchange_id, v_name, v_email, token_hash(v_token))
  returning id into v_id;

  -- No token comes back. The organizer never needs somebody else's
  -- personal link, and the invitation mints its own when it is sent.
  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'email', v_email,
    'status', 'Invite Pending'
  );
end;
$$;

-- --------------------------------------------------------------------
-- Correcting a name or an address
--
-- A mistyped address is the reason this exists, and a mistyped
-- address has a sharp edge: the invitation already sent is a working
-- personal link sitting in somebody else's inbox. So changing the
-- address rotates the link as well, which retires the one that went
-- astray. The exception is somebody who has already registered: they
-- are using their link, and pulling it out from under them to fix a
-- typo in a field they never see would be a worse trade.
-- --------------------------------------------------------------------

create or replace function update_invitee(
  p_organizer_token text,
  p_invitee_id uuid,
  p_name text,
  p_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
  v_invitee invitees;
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_moved boolean;
  v_status text;
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  select * into v_invitee from invitees
  where id = p_invitee_id and exchange_id = v_exchange_id;

  if v_invitee.id is null then
    raise exception 'Nobody on this list by that id'
      using errcode = 'no_data_found';
  end if;

  if v_name = '' then
    raise exception 'That person needs a name'
      using errcode = 'check_violation';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'That person needs an email address'
      using errcode = 'check_violation';
  end if;

  -- Sharing an address is allowed; being the same person twice is not.
  if exists (
    select 1 from invitees
    where exchange_id = v_exchange_id
      and lower(email) = v_email
      and lower(name) = lower(v_name)
      and id <> v_invitee.id
  ) then
    raise exception 'Somebody else on the list already has that name and address'
      using errcode = 'unique_violation';
  end if;

  v_moved := lower(v_invitee.email) is distinct from v_email;

  -- An invitation that went to the old address never reached them, so
  -- they are owed another one. A registered person is left alone:
  -- they are in, and nothing is waiting to be delivered.
  v_status := case
    when v_moved and v_invitee.status = 'Invited' then 'Invite Pending'
    else v_invitee.status
  end;

  update invitees
  set name = v_name,
      email = v_email,
      status = v_status,
      invited_at = case when v_status = 'Invite Pending' then null
                        else invited_at end,
      invitee_token_hash = case
        when v_moved and v_invitee.status <> 'Registered'
          then token_hash(new_token())
        else invitee_token_hash
      end
  where id = v_invitee.id;

  if v_moved and v_invitee.status <> 'Registered' then
    -- Links already mailed out stop opening anything.
    delete from invitee_tokens where invitee_id = v_invitee.id;
  end if;

  if v_moved then
    -- Anything queued carries the address it was queued with, so a
    -- reminder written before the correction would still go to the
    -- old inbox. Only what has not gone yet can be redirected.
    update notifications
    set to_email = v_email
    where invitee_id = v_invitee.id and sent_at is null;
  end if;

  return jsonb_build_object(
    'id', v_invitee.id,
    'name', v_name,
    'email', v_email,
    'status', v_status,
    'addressChanged', v_moved
  );
end;
$$;

-- --------------------------------------------------------------------
-- Taking somebody off the list
-- --------------------------------------------------------------------

create or replace function remove_invitee(
  p_organizer_token text,
  p_invitee_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
  v_invitee invitees;
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  select * into v_invitee from invitees
  where id = p_invitee_id and exchange_id = v_exchange_id;

  if v_invitee.id is null then
    raise exception 'Nobody on this list by that id'
      using errcode = 'no_data_found';
  end if;

  if v_invitee.is_organizer then
    raise exception 'Use the "Include me" setting to leave your own exchange'
      using errcode = 'check_violation';
  end if;

  -- After the draw somebody is buying for this person and somebody
  -- else is waiting on a gift from them. Removing the row would make
  -- both assignments point at nothing.
  if (select drawn_at from exchanges where id = v_exchange_id) is not null then
    raise exception 'The draw has run, so nobody can be taken off the list'
      using errcode = 'check_violation';
  end if;

  -- Their restrictions, their tokens, and anything queued for them go
  -- with the row: every one of those is a cascade on this table.
  delete from invitees where id = v_invitee.id;

  return jsonb_build_object('removed', true, 'id', v_invitee.id);
end;
$$;

-- --------------------------------------------------------------------
-- Sending the invitations
--
-- Two modes, because clicking the button twice can mean two different
-- things. The default is "catch up": only people who have never been
-- sent one, which is everybody the first time and only the latecomers
-- after that. Resend is the deliberate one, for an exchange where the
-- first batch went into junk folders.
--
-- Neither mode will pile up: somebody with an invitation still
-- waiting in the queue is skipped either way, so a second click while
-- the sender has not run yet changes nothing.
-- --------------------------------------------------------------------

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
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('queued', v_queued, 'skipped', v_skipped);
end;
$$;

-- --------------------------------------------------------------------
-- What the button should say before it is pressed
--
-- The organizer is about to email real people, so the screen has to
-- be able to tell them how many and which kind, rather than offering
-- "Send invitations" and reporting afterwards.
-- --------------------------------------------------------------------

create or replace function invitation_counts(p_organizer_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  return (
    select jsonb_build_object(
      -- Never sent one.
      'pending', count(*) filter (where status = 'Invite Pending'),
      -- Sent one, nothing back yet: the people a resend is for.
      'invited', count(*) filter (where status = 'Invited'),
      'registered', count(*) filter (where status = 'Registered'),
      -- Already in the queue, so neither button would move them.
      'waiting', count(*) filter (where exists (
        select 1 from notifications n
        where n.invitee_id = i.id
          and n.kind = 'invitation'
          and n.sent_at is null
      ))
    )
    from invitees i
    where i.exchange_id = v_exchange_id and not i.is_organizer
  );
end;
$$;

revoke all on function gift_budget_label(uuid) from public, anon;
revoke all on function add_invitee(text, text, text) from public;
revoke all on function update_invitee(text, uuid, text, text) from public;
revoke all on function remove_invitee(text, uuid) from public;
revoke all on function send_invitations(text, boolean) from public;
revoke all on function invitation_counts(text) from public;

grant execute on function add_invitee(text, text, text) to anon;
grant execute on function update_invitee(text, uuid, text, text) to anon;
grant execute on function remove_invitee(text, uuid) to anon;
grant execute on function send_invitations(text, boolean) to anon;
grant execute on function invitation_counts(text) to anon;
