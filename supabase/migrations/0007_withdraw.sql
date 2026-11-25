-- "Cancel my registration", which until now was a button with nothing
-- behind it: the screen offered it, and no function could carry it out.
--
-- Leaving has to do two different things depending on how the person
-- got in, because the row means two different things:
--
--   Invited by the organizer
--     Their place in the exchange is not theirs to give away. The row
--     stays, goes back to 'Invited', and what they wrote is cleared.
--     The organizer sees them as invited but not registered, which is
--     where they were before, and they can register again.
--
--   Let themselves in with the shared link
--     Nobody put them on the list, so leaving takes the row with them.
--     Keeping it would leave a claimable address in an exchange that
--     may later be set to invitation only, and would leave the
--     organizer looking at somebody who was never invited and is not
--     coming.
--
-- Telling those apart needs a column. invited_at looks like it would
-- do the job and does not: nothing has ever written to it, so it is
-- null on every row, including the ones the organizer typed in
-- themselves. Rather than start writing to it and give one column two
-- meanings (when the invitation was sent, and where this person came
-- from), this records the fact it actually needs.
--
-- Existing rows default to false, which is right: every row that
-- exists before this migration was made by create_exchange.

alter table invitees
  add column self_joined boolean not null default false;

-- --------------------------------------------------------------------
-- Joining: record which door they came through
--
-- Unchanged from 0006 but for the one column on the insert. The update
-- branch deliberately does not touch self_joined: that branch is a
-- person the organizer listed, registering for the first time.
-- --------------------------------------------------------------------

create or replace function join_exchange(
  p_event_code text,
  p_name text,
  p_email text,
  p_wishlist text default null,
  p_preferences text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_exchange exchanges;
  v_existing invitees;
  v_token text := new_token();
  v_id uuid;
  v_name text := btrim(p_name);
  v_email text := lower(btrim(p_email));
begin
  if v_name = '' then
    raise exception 'A name is needed' using errcode = 'check_violation';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That does not look like an email address'
      using errcode = 'check_violation';
  end if;

  select * into v_exchange from exchanges
  where upper(event_code) = upper(btrim(p_event_code));

  if v_exchange.id is null then
    raise exception 'No exchange with that code'
      using errcode = 'no_data_found';
  end if;

  if not registration_is_open(v_exchange.id) then
    raise exception 'Registration has closed for this exchange'
      using errcode = 'check_violation';
  end if;

  select * into v_existing from invitees
  where exchange_id = v_exchange.id and lower(email) = v_email;

  -- Invitation only, and this address was not invited.
  if v_existing.id is null and not v_exchange.allow_open_join then
    raise exception 'This exchange is invitation only. Ask % to add you.', v_exchange.organizer_name
      using errcode = 'insufficient_privilege';
  end if;

  if v_existing.id is not null and v_existing.status = 'Registered' then
    raise exception 'Somebody has already registered with that address. If that was you, use the link from your own registration, or ask % to help.', v_exchange.organizer_name
      using errcode = 'unique_violation';
  end if;

  if v_existing.id is not null then
    update invitees
    set name = v_name,
        wishlist = p_wishlist,
        preferences = p_preferences,
        status = 'Registered',
        registered_at = now(),
        invitee_token_hash = token_hash(v_token)
    where id = v_existing.id
    returning id into v_id;
  else
    insert into invitees (
      exchange_id, name, email, status, wishlist, preferences,
      registered_at, invitee_token_hash, self_joined
    )
    values (
      v_exchange.id, v_name, v_email, 'Registered', p_wishlist,
      p_preferences, now(), token_hash(v_token), true
    )
    returning id into v_id;
  end if;

  return jsonb_build_object(
    'inviteeToken', v_token,
    'registration', registration_view(v_token)
  );
end;
$$;

-- --------------------------------------------------------------------
-- Leaving
-- --------------------------------------------------------------------

create or replace function withdraw_registration(p_invitee_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_invitee invitees;
  v_exchange exchanges;
begin
  select * into v_invitee from invitees
  where invitee_token_hash = token_hash(p_invitee_token);

  if v_invitee.id is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  select * into v_exchange from exchanges where id = v_invitee.exchange_id;

  -- After the draw there is an assignment pointing at them and somebody
  -- shopping for them. Leaving is no longer something the app can do on
  -- its own, so the organizer has to sort it out.
  if v_exchange.drawn_at is not null then
    raise exception 'The draw has already happened, so ask % to take you out.', v_exchange.organizer_name
      using errcode = 'check_violation';
  end if;

  -- The organizer's own row belongs to the exchange rather than to
  -- them. "Include me in the draw" on the management screen is how
  -- that one comes out, and it has to be, because removing it here
  -- would leave the exchange without the row its restrictions name.
  if v_invitee.is_organizer then
    raise exception 'The organizer leaves the draw from the exchange settings, not from here'
      using errcode = 'check_violation';
  end if;

  if v_invitee.self_joined then
    -- Restrictions in both directions go with the row: owner_invitee_id
    -- and other_invitee_id both cascade from invitees.
    delete from invitees where id = v_invitee.id;

    return jsonb_build_object('rejoined', false, 'rowKept', false);
  end if;

  -- Their own choices go. A restriction the organizer entered about
  -- them is the organizer's, and survives, so a safety net set because
  -- two people do not get along is still there if they come back.
  delete from restrictions
  where owner_invitee_id = v_invitee.id
    and not set_by_organizer;

  update invitees
  set status = 'Invited',
      wishlist = null,
      preferences = null,
      registered_at = null,
      -- Not nullable, and leaving the old one in place would leave a
      -- working link in whatever they forwarded it to. A fresh token
      -- nobody holds retires it without emptying the column.
      invitee_token_hash = token_hash(new_token())
  where id = v_invitee.id;

  return jsonb_build_object('rejoined', false, 'rowKept', true);
end;
$$;

revoke all on function join_exchange(text, text, text, text, text) from public;
revoke all on function withdraw_registration(text) from public;

grant execute on function join_exchange(text, text, text, text, text) to anon;
grant execute on function withdraw_registration(text) to anon;
