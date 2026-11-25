-- Running the draw.
--
-- The matching itself is not here. It lives in src/draw/assignment.ts,
-- is an augmenting-path matching that explains its own failures, and
-- has a test suite. Porting it to PL/pgSQL would make two
-- implementations that have to agree forever, and the day they stop
-- agreeing is the day somebody is told they are buying for a person
-- they said they would rather not. So the Edge Function reads the
-- people and the forbidden pairings through claim_due_draws, runs the
-- algorithm that is already trusted, and hands the result back to
-- record_draw.
--
-- Nothing in this file is granted to anon. These functions return
-- every participant in an exchange and write the one table that must
-- never be readable from a browser, so they are for service_role
-- alone. That is also why the draw cannot be a GitHub Action: it
-- would need a key that is not safe to put in a repository secret.

-- --------------------------------------------------------------------
-- Claiming
--
-- Two columns rather than one. drawn_at means the draw happened;
-- draw_claimed_at means a run is working on it right now. Without the
-- second, a function that crashed between matching and writing would
-- either leave the exchange drawn with no assignments, or leave it
-- open to being drawn twice by the next run.
-- --------------------------------------------------------------------

alter table exchanges
  add column draw_claimed_at timestamptz,
  -- Why the last attempt did not produce a draw, for the organizer.
  -- Cleared on success.
  add column draw_error text;

-- How long a claim is honored before another run may take it. Long
-- enough that a slow draw is not picked up twice, short enough that a
-- crash does not strand an exchange until somebody notices.
create or replace function draw_claim_timeout()
returns interval
language sql
immutable
as $$ select interval '15 minutes' $$;

/*
 * The exchanges that are due, claimed in the same statement that finds
 * them.
 *
 * Due means the local clock has passed nine in the morning on the draw
 * date. Local, because a calendar date only means something in a
 * place: the same UTC instant is the day before in Honolulu and the
 * day after in Auckland. An exchange whose date passed while nothing
 * was running is still due, so a missed run catches up rather than
 * skipping the draw entirely.
 */
create or replace function claim_due_draws(p_limit int default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_result jsonb;
begin
  -- One statement: find, lock, claim, and read back what was claimed.
  -- Split across statements, two runs starting together could both
  -- see the same row as unclaimed. SKIP LOCKED means a second run
  -- takes the next exchange rather than waiting for this one.
  with due as (
    select e.id
    from exchanges e
    where e.drawn_at is null
      and (now() at time zone e.time_zone)
            >= (e.draw_date + time '09:00')
      and (e.draw_claimed_at is null
           or e.draw_claimed_at < now() - draw_claim_timeout())
    order by e.draw_date
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update exchanges e
    set draw_claimed_at = now()
    from due
    where e.id = due.id
    returning e.id, e.draw_date
  )
  select coalesce(
    jsonb_agg(drawable_exchange(claimed.id) order by claimed.draw_date),
    '[]'::jsonb
  )
  into v_result
  from claimed;

  return v_result;
end;
$$;

/*
 * Everything one draw needs: who is in it, and which pairings are
 * forbidden.
 *
 * Restrictions are owned and one-way, and both directions collapse to
 * the same thing here. "I would rather not buy for X" forbids
 * (me -> X); "I would rather not receive from X" forbids (X -> me).
 * Both sources count: a restriction the organizer entered on
 * somebody's behalf is honored exactly like one that person set, which
 * is the whole point of allowing the organizer to set them.
 *
 * Unsubscribed people are still in the draw. Unsubscribing stops the
 * email, and somebody who wants out of the exchange withdraws instead.
 */
create or replace function drawable_exchange(p_exchange_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'eventCode', e.event_code,
    'timeZone', e.time_zone,
    'organizerName', e.organizer_name,
    'organizerEmail', e.organizer_email,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name)
                       order by i.id)
      from invitees i
      where i.exchange_id = e.id and i.status = 'Registered'
    ), '[]'::jsonb),
    'forbidden', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'giverId', case when r.direction = 'give'
                        then r.owner_invitee_id else r.other_invitee_id end,
        'receiverId', case when r.direction = 'give'
                           then r.other_invitee_id else r.owner_invitee_id end
      ))
      from restrictions r
      join invitees owner on owner.id = r.owner_invitee_id
      join invitees other on other.id = r.other_invitee_id
      where r.exchange_id = e.id
        -- A restriction naming somebody who never registered cannot
        -- constrain a draw they are not in, and would otherwise
        -- forbid a pairing against a person who does not exist.
        and owner.status = 'Registered'
        and other.status = 'Registered'
    ), '[]'::jsonb)
  )
  from exchanges e
  where e.id = p_exchange_id;
$$;

/*
 * Write the result.
 *
 * Checked rather than trusted, because this is the one table nobody
 * can read back to verify: every participant gives exactly once,
 * receives exactly once, and not to themselves. A partial draw written
 * by a run that died halfway would leave some people with no name and
 * no way for anyone to find out.
 */
create or replace function record_draw(
  p_exchange_id uuid,
  p_pairs jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_exchange exchanges;
  v_expected int;
  v_givers int;
  v_receivers int;
  v_self int;
begin
  select * into v_exchange from exchanges where id = p_exchange_id;

  if v_exchange.id is null then
    raise exception 'No such exchange' using errcode = 'no_data_found';
  end if;

  if v_exchange.drawn_at is not null then
    raise exception 'This exchange has already been drawn'
      using errcode = 'unique_violation';
  end if;

  select count(*) into v_expected from invitees
  where exchange_id = p_exchange_id and status = 'Registered';

  if v_expected < 2 then
    raise exception 'A draw needs at least two people, and this one has %', v_expected
      using errcode = 'check_violation';
  end if;

  select count(distinct value ->> 'giverId'),
         count(distinct value ->> 'receiverId'),
         count(*) filter (where value ->> 'giverId' = value ->> 'receiverId')
  into v_givers, v_receivers, v_self
  from jsonb_array_elements(p_pairs);

  if v_givers <> v_expected or v_receivers <> v_expected then
    raise exception 'The draw covers % givers and % receivers, but the exchange has % people', v_givers, v_receivers, v_expected
      using errcode = 'check_violation';
  end if;

  if v_self > 0 then
    raise exception 'Somebody was matched with themselves'
      using errcode = 'check_violation';
  end if;

  -- Both ends, not just the giver. The assignments table references
  -- invitees without scoping to an exchange, so a receiver belonging
  -- to a different exchange satisfies the foreign key and the counts
  -- above, and my_assignment would then hand that person's name and
  -- wishlist to somebody they have never met.
  if exists (
    select 1
    from jsonb_array_elements(p_pairs) pair
    cross join lateral (
      values ((pair.value ->> 'giverId')::uuid),
             ((pair.value ->> 'receiverId')::uuid)
    ) as side(person_id)
    left join invitees i
      on i.id = side.person_id
     and i.exchange_id = p_exchange_id
     and i.status = 'Registered'
    where i.id is null
  ) then
    raise exception 'The draw names somebody who is not registered in this exchange'
      using errcode = 'foreign_key_violation';
  end if;

  -- Every forbidden pairing honored. The algorithm already guarantees
  -- this; the check is here because nobody can read the result back to
  -- find out, so a bug would be invisible and permanent.
  if exists (
    select 1
    from jsonb_array_elements(p_pairs) pair
    join jsonb_array_elements(
      drawable_exchange(p_exchange_id) -> 'forbidden'
    ) f
      on f.value ->> 'giverId' = pair.value ->> 'giverId'
     and f.value ->> 'receiverId' = pair.value ->> 'receiverId'
  ) then
    raise exception 'The draw uses a pairing a restriction forbids'
      using errcode = 'check_violation';
  end if;

  insert into assignments (exchange_id, giver_id, receiver_id)
  select p_exchange_id,
         (value ->> 'giverId')::uuid,
         (value ->> 'receiverId')::uuid
  from jsonb_array_elements(p_pairs);

  update exchanges
  set drawn_at = now(),
      draw_claimed_at = null,
      draw_error = null
  where id = p_exchange_id;

  return jsonb_build_object('drawn', v_expected);
end;
$$;

/*
 * The draw could not be made: too few people, or restrictions that
 * leave no valid matching.
 *
 * The claim is released and drawn_at stays null, so the next run tries
 * again. That matters because the usual fix is somebody withdrawing a
 * restriction, and the draw should then simply happen.
 */
create or replace function fail_draw(
  p_exchange_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  update exchanges
  set draw_claimed_at = null,
      draw_error = p_reason
  where id = p_exchange_id and drawn_at is null;

  if not found then
    raise exception 'No undrawn exchange with that id'
      using errcode = 'no_data_found';
  end if;

  return jsonb_build_object('recorded', true);
end;
$$;

-- --------------------------------------------------------------------
-- Permissions
--
-- service_role only. Nothing here is safe from a browser: the first
-- two return every participant in an exchange, and record_draw writes
-- the table whose secrecy is the whole promise of the app.
-- --------------------------------------------------------------------

revoke all on function claim_due_draws(int) from public, anon, authenticated;
revoke all on function drawable_exchange(uuid) from public, anon, authenticated;
revoke all on function record_draw(uuid, jsonb) from public, anon, authenticated;
revoke all on function fail_draw(uuid, text) from public, anon, authenticated;

grant execute on function claim_due_draws(int) to service_role;
grant execute on function drawable_exchange(uuid) to service_role;
grant execute on function record_draw(uuid, jsonb) to service_role;
grant execute on function fail_draw(uuid, text) to service_role;
