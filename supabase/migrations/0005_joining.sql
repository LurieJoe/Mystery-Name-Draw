-- Joining an exchange from the shared link.
--
-- The app has one registration link for everybody, and the FAQ says so:
-- you create an exchange, you get a link, and whoever follows it
-- registers with a name and an email address. Until now the schema
-- could not express that. registration_view wants a token that only
-- create_exchange hands out, so only people the organizer had already
-- listed could ever appear.
--
-- Two functions. One shows an exchange to a stranger holding the code,
-- so they can see what they are joining. The other lets them join and
-- hands back the token that is theirs from then on.

-- --------------------------------------------------------------------
-- Looking before you leap
-- --------------------------------------------------------------------

/*
 * What somebody holding only the event code may see: enough to decide
 * whether to join, and nothing about anybody who already has.
 *
 * No names, no count, no wishlists. Whether an exchange exists is the
 * one thing this reveals, which is unavoidable in a link anyone can
 * follow.
 */
create or replace function exchange_preview(p_event_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange exchanges;
begin
  select * into v_exchange from exchanges
  where upper(event_code) = upper(btrim(p_event_code));

  if v_exchange.id is null then
    raise exception 'No exchange with that code'
      using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'name', v_exchange.name,
    'giftBudget', v_exchange.gift_budget,
    'currency', v_exchange.currency,
    'noGiftLimit', v_exchange.no_gift_limit,
    'registrationDeadline', v_exchange.registration_deadline,
    'drawDate', v_exchange.draw_date,
    'organizerName', v_exchange.organizer_name,
    'registrationOpen', registration_is_open(v_exchange.id),
    'drawn', v_exchange.drawn_at is not null
  );
end;
$$;

-- --------------------------------------------------------------------
-- Joining
-- --------------------------------------------------------------------

/*
 * Join with the event code, and get back the token that identifies you
 * from then on. Returned once and never again: only its hash is kept.
 *
 * An address the organizer already listed is that person arriving, so
 * their row is claimed rather than duplicated, and the wishlist they
 * write lands where the organizer expects it.
 *
 * An address that has already registered is refused. Matching on email
 * is how an invited person is recognised, but it would also mean that
 * anybody holding the code and a guess at a colleague's address could
 * be handed that colleague's token, and with it their wishlist, their
 * restrictions, and eventually the name they drew. Refusing costs a
 * real person one message to the organizer. Not refusing costs somebody
 * their privacy, quietly.
 */
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
set search_path = public, pg_temp
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

  if v_existing.id is not null and v_existing.status = 'Registered' then
    raise exception 'Somebody has already registered with that address. If that was you, use the link from your own registration, or ask % to help.', v_exchange.organizer_name
      using errcode = 'unique_violation';
  end if;

  if v_existing.id is not null then
    -- Invited, and now arriving.
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
      registered_at, invitee_token_hash
    )
    values (
      v_exchange.id, v_name, v_email, 'Registered', p_wishlist,
      p_preferences, now(), token_hash(v_token)
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
-- Permissions
-- --------------------------------------------------------------------

revoke all on function exchange_preview(text) from public;
revoke all on function join_exchange(text, text, text, text, text) from public;

grant execute on function exchange_preview(text) to anon;
grant execute on function join_exchange(text, text, text, text, text) to anon;
