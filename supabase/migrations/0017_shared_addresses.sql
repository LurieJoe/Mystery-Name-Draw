-- More than one person may use the same inbox.
--
-- A family exchange is the ordinary case: a mother and two daughters
-- give separately and all three read one address. Until now the table
-- refused it outright, so the second daughter could not be added at
-- all. Nothing about the draw needs an address to be unique, and
-- every person already has their own row and their own personal
-- link, so what was being enforced was a convention rather than a
-- requirement.
--
-- What the address really does is identify somebody arriving on the
-- shared registration link, with nothing else to go on. With one row
-- per address that worked. With several it cannot, so this takes the
-- name they typed as the tiebreak, and falls back to telling them to
-- use the link in their own invitation, which is the only thing that
-- can tell three people in one inbox apart.

drop index invitees_one_email_idx;

-- Still indexed, because every lookup below is by this pair; only the
-- uniqueness goes.
create index invitees_email_idx on invitees (exchange_id, lower(email));

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
  v_sharing int;
  v_named int;
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

  select count(*) into v_sharing from invitees
  where exchange_id = v_exchange.id and lower(email) = v_email;

  if v_sharing <= 1 then
    -- One row, or none: exactly as it has always worked.
    select * into v_existing from invitees
    where exchange_id = v_exchange.id and lower(email) = v_email;
  else
    -- Several people read this inbox, so the address alone says
    -- nothing. The name they just typed is the only other thing they
    -- have given us.
    select count(*) into v_named from invitees
    where exchange_id = v_exchange.id
      and lower(email) = v_email
      and lower(btrim(name)) = lower(v_name);

    if v_named = 1 then
      select * into v_existing from invitees
      where exchange_id = v_exchange.id
        and lower(email) = v_email
        and lower(btrim(name)) = lower(v_name);
    elsif v_named > 1 or not v_exchange.allow_open_join then
      -- Either two people on this list share an address and a name,
      -- or this is an invitation-only exchange and the name is not
      -- one of the people invited at it. Guessing which row to hand
      -- over would be handing somebody else's place to whoever asked.
      raise exception 'More than one person here uses that address. Open the link in your own invitation email, or ask % which one is yours.', v_exchange.organizer_name
        using errcode = 'insufficient_privilege';
    end if;

    -- Falls through with v_existing empty on an open exchange: a new
    -- person who happens to share the inbox, which is the family case
    -- again, one step later.
  end if;

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

revoke all on function join_exchange(text, text, text, text, text) from public;
grant execute on function join_exchange(text, text, text, text, text) to anon;
