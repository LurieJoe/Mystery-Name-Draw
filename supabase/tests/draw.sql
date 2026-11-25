-- Running the draw: who is due, who may run it, and what the database
-- refuses to write down.

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

-- A whole exchange with everybody registered, ready to draw.
create or replace function a_drawable_exchange(
  p_name text,
  p_draw_date date,
  p_time_zone text,
  p_people int
)
returns uuid
language plpgsql
as $$
declare
  v_created jsonb;
  v_id uuid;
  v_code text;
  v_invitees jsonb := '[]'::jsonb;
  i int;
begin
  for i in 1..p_people loop
    v_invitees := v_invitees || jsonb_build_object(
      'name', 'Person ' || i,
      'email', 'person' || i || '-' || p_name || '@example.com'
    );
  end loop;

  -- Built with dates in the future so registration is open, then
  -- moved to the dates the test wants. Both at once: the schema
  -- requires the draw on or after the deadline, so moving one at a
  -- time breaks the constraint halfway.
  v_created := create_exchange(jsonb_build_object(
    'name', p_name,
    'registrationDeadline', (current_date + 30)::text,
    'drawDate', (current_date + 35)::text,
    'timeZone', p_time_zone,
    'organizer', jsonb_build_object(
      'name', 'Dana', 'email', 'dana-' || p_name || '@example.com',
      'participating', false),
    'invitees', v_invitees
  ));

  v_id := (v_created ->> 'exchangeId')::uuid;
  v_code := v_created ->> 'eventCode';

  for i in 1..p_people loop
    perform join_exchange(v_code, 'Person ' || i,
                          'person' || i || '-' || p_name || '@example.com',
                          null, null);
  end loop;

  update exchanges
  set draw_date = p_draw_date,
      registration_deadline = p_draw_date - 5
  where id = v_id;

  return v_id;
end;
$$;

-- The matching itself lives in TypeScript. This stands in for it:
-- everyone gives to the next person round a ring, which is always a
-- valid draw when no restriction forbids it.
create or replace function a_ring_draw(p_exchange_id uuid)
returns jsonb
language sql
stable
as $$
  with people as (
    select id, row_number() over (order by id) - 1 as n,
           count(*) over () as total
    from invitees
    where exchange_id = p_exchange_id and status = 'Registered'
  )
  select jsonb_agg(jsonb_build_object(
    'giverId', g.id,
    'receiverId', (select id from people where n = (g.n + 1) % g.total)
  ))
  from people g;
$$;

do $$
declare
  v_due uuid;
  v_early uuid;
  v_far uuid;
  v_claimed jsonb;
  v_pairs jsonb;
  v_people jsonb;
  v_failed boolean;
  v_count int;
  v_other uuid;
begin
  -- ------------------------------------------------------------------
  -- Who is due
  -- ------------------------------------------------------------------

  -- Drawn yesterday's date, in a zone where it is well past 9am.
  v_due := a_drawable_exchange('due', current_date - 1, 'UTC', 4);
  -- Draw date a fortnight out.
  v_far := a_drawable_exchange('far', current_date + 14, 'UTC', 4);

  v_claimed := claim_due_draws();

  perform assert('an exchange past its draw date is claimed',
    exists (select 1 from jsonb_array_elements(v_claimed) e
            where (e.value ->> 'id')::uuid = v_due));
  perform assert('one with a draw date still ahead is not',
    not exists (select 1 from jsonb_array_elements(v_claimed) e
                where (e.value ->> 'id')::uuid = v_far));

  perform assert('claiming records that a run has it',
    (select draw_claimed_at is not null from exchanges where id = v_due));

  perform assert('and a second run does not claim it again',
    not exists (select 1 from jsonb_array_elements(claim_due_draws()) e
                where (e.value ->> 'id')::uuid = v_due));

  -- A claim that was never finished is retried, not stranded.
  update exchanges set draw_claimed_at = now() - interval '1 hour'
  where id = v_due;

  perform assert('a stale claim is picked up again',
    exists (select 1 from jsonb_array_elements(claim_due_draws()) e
            where (e.value ->> 'id')::uuid = v_due));

  -- ------------------------------------------------------------------
  -- Nine in the morning, local to the exchange
  -- ------------------------------------------------------------------

  -- Draw date is today. Whether it is due depends on the zone: this
  -- test runs at some unknown hour, so it checks the two zones that
  -- disagree with each other rather than a fixed expectation.
  v_early := a_drawable_exchange('today', current_date, 'Pacific/Kiritimati', 4);

  perform assert('a draw date of today in a zone already past 9am is due',
    case when (now() at time zone 'Pacific/Kiritimati')
              >= (current_date + time '09:00')
         then exists (select 1 from jsonb_array_elements(claim_due_draws()) e
                      where (e.value ->> 'id')::uuid = v_early)
         else true end);

  update exchanges set draw_claimed_at = null where id = v_early;
  update exchanges set time_zone = 'Pacific/Midway' where id = v_early;

  perform assert('and the same date in a zone still before 9am is not',
    case when (now() at time zone 'Pacific/Midway')
              < (current_date + time '09:00')
         then not exists (select 1 from jsonb_array_elements(claim_due_draws()) e
                          where (e.value ->> 'id')::uuid = v_early)
         else true end);

  -- ------------------------------------------------------------------
  -- What claiming hands over
  -- ------------------------------------------------------------------

  v_people := drawable_exchange(v_due) -> 'people';

  perform assert('every registered person is handed to the draw',
    jsonb_array_length(v_people) = 4);
  perform assert('with a name and an id and nothing else',
    (select bool_and(
       p.value ?& array['id', 'name']
       and (select count(*) from jsonb_object_keys(p.value)) = 2)
     from jsonb_array_elements(v_people) p));

  perform assert('and no wishlist, preferences or address come with them',
    not (drawable_exchange(v_due)::text like '%wishlist%'));

  -- ------------------------------------------------------------------
  -- Restrictions become forbidden pairings, both directions
  -- ------------------------------------------------------------------

  declare
    v_a uuid;
    v_b uuid;
    v_token text;
  begin
    select id into v_a from invitees
    where exchange_id = v_due and status = 'Registered' order by id limit 1;
    select id into v_b from invitees
    where exchange_id = v_due and status = 'Registered' order by id offset 1 limit 1;

    insert into restrictions (exchange_id, owner_invitee_id, other_invitee_id,
                              direction, set_by_organizer)
    values (v_due, v_a, v_b, 'give', false);

    perform assert('"I will not buy for X" forbids me as the giver',
      exists (select 1 from jsonb_array_elements(
                drawable_exchange(v_due) -> 'forbidden') f
              where (f.value ->> 'giverId')::uuid = v_a
                and (f.value ->> 'receiverId')::uuid = v_b));

    insert into restrictions (exchange_id, owner_invitee_id, other_invitee_id,
                              direction, set_by_organizer)
    values (v_due, v_a, v_b, 'receive', true);

    perform assert('"I will not receive from X" forbids X as the giver',
      exists (select 1 from jsonb_array_elements(
                drawable_exchange(v_due) -> 'forbidden') f
              where (f.value ->> 'giverId')::uuid = v_b
                and (f.value ->> 'receiverId')::uuid = v_a));

    perform assert('an organizer-set restriction counts the same as a personal one',
      jsonb_array_length(drawable_exchange(v_due) -> 'forbidden') = 2);

    -- A restriction naming somebody who never registered.
    select id into v_other from invitees
    where exchange_id = v_far and status = 'Registered' limit 1;

    update invitees set status = 'Invited' where id = v_b;

    perform assert('a restriction naming somebody unregistered is dropped',
      jsonb_array_length(drawable_exchange(v_due) -> 'forbidden') = 0);

    update invitees set status = 'Registered' where id = v_b;
  end;

  -- ------------------------------------------------------------------
  -- Recording a draw
  -- ------------------------------------------------------------------

  delete from restrictions where exchange_id = v_due;
  v_pairs := a_ring_draw(v_due);

  perform record_draw(v_due, v_pairs);

  perform assert('the assignments are written',
    (select count(*) from assignments where exchange_id = v_due) = 4);
  perform assert('and the exchange is marked drawn',
    (select drawn_at is not null from exchanges where id = v_due));
  perform assert('and its claim is released',
    (select draw_claimed_at is null from exchanges where id = v_due));
  perform assert('everybody gives exactly once',
    (select count(distinct giver_id) from assignments
     where exchange_id = v_due) = 4);
  perform assert('and receives exactly once',
    (select count(distinct receiver_id) from assignments
     where exchange_id = v_due) = 4);
  perform assert('and nobody drew themselves',
    not exists (select 1 from assignments
                where exchange_id = v_due and giver_id = receiver_id));

  perform assert('a drawn exchange is never claimed again',
    not exists (select 1 from jsonb_array_elements(claim_due_draws()) e
                where (e.value ->> 'id')::uuid = v_due));

  -- Checking the message, not just that something raised: the
  -- assignments primary key also refuses a second insert, so a test
  -- that only asks "did it fail" passes even with the drawn_at guard
  -- removed, and reports a constraint name to whoever hits it.
  declare
    v_message text := '';
  begin
    begin
      perform record_draw(v_due, v_pairs);
    exception when others then
      v_message := sqlerrm;
    end;
    perform assert('and cannot be drawn a second time',
      v_message like '%already been drawn%');
  end;

  -- ------------------------------------------------------------------
  -- What record_draw refuses
  -- ------------------------------------------------------------------

  -- Bring it due. Both dates together, as above.
  update exchanges
  set draw_claimed_at = null,
      draw_date = current_date - 1,
      registration_deadline = current_date - 6
  where id = v_far;

  -- Somebody left out.
  v_failed := false;
  begin
    perform record_draw(v_far,
      (select jsonb_agg(value) from jsonb_array_elements(a_ring_draw(v_far))
       with ordinality t(value, n) where n > 1));
  exception when others then
    v_failed := true;
  end;
  perform assert('a draw that leaves somebody out is refused', v_failed);

  -- Somebody matched with themselves.
  v_failed := false;
  begin
    perform record_draw(v_far, (
      select jsonb_agg(jsonb_build_object('giverId', id, 'receiverId', id))
      from invitees where exchange_id = v_far and status = 'Registered'));
  exception when others then
    v_failed := true;
  end;
  perform assert('a draw that matches somebody with themselves is refused',
    v_failed);

  -- Somebody from another exchange.
  v_failed := false;
  begin
    perform record_draw(v_far, (
      select jsonb_agg(jsonb_build_object(
        'giverId', (p.value ->> 'giverId'),
        'receiverId', case when n = 1
                           then (select id::text from invitees
                                 where exchange_id = v_due limit 1)
                           else (p.value ->> 'receiverId') end))
      from jsonb_array_elements(a_ring_draw(v_far)) with ordinality p(value, n)));
  exception when others then
    v_failed := true;
  end;
  perform assert('a draw naming an outsider is refused', v_failed);

  perform assert('and none of those wrote anything',
    (select count(*) from assignments where exchange_id = v_far) = 0);
  perform assert('nor marked it drawn',
    (select drawn_at is null from exchanges where id = v_far));

  -- A pairing a restriction forbids.
  declare
    v_g uuid;
    v_r uuid;
  begin
    v_pairs := a_ring_draw(v_far);
    v_g := (v_pairs -> 0 ->> 'giverId')::uuid;
    v_r := (v_pairs -> 0 ->> 'receiverId')::uuid;

    insert into restrictions (exchange_id, owner_invitee_id, other_invitee_id,
                              direction, set_by_organizer)
    values (v_far, v_g, v_r, 'give', false);

    v_failed := false;
    begin
      perform record_draw(v_far, v_pairs);
    exception when others then
      v_failed := true;
    end;
    perform assert('a draw that breaks a restriction is refused', v_failed);

    delete from restrictions where exchange_id = v_far;
  end;

  -- ------------------------------------------------------------------
  -- Too few people, and failing gracefully
  -- ------------------------------------------------------------------

  update invitees set status = 'Invited'
  where exchange_id = v_far
    and id <> (select id from invitees where exchange_id = v_far
               and status = 'Registered' limit 1);

  v_failed := false;
  begin
    perform record_draw(v_far, '[]'::jsonb);
  exception when others then
    v_failed := true;
  end;
  perform assert('an exchange with one person cannot be drawn', v_failed);

  perform fail_draw(v_far, 'Not enough people registered');

  perform assert('a failure is recorded for the organizer',
    (select draw_error from exchanges where id = v_far)
      = 'Not enough people registered');
  perform assert('the claim is released so the next run tries again',
    (select draw_claimed_at is null from exchanges where id = v_far));
  perform assert('and it is still not drawn',
    (select drawn_at is null from exchanges where id = v_far));

  perform assert('so it is claimed again next time',
    exists (select 1 from jsonb_array_elements(claim_due_draws()) e
            where (e.value ->> 'id')::uuid = v_far));

  raise notice '--- draw: all checks passed ---';
end $$;
