-- The outbox: filled by the thing it announces, drained by the sender,
-- and safe to run twice at every step.

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
  v_id uuid;
  v_claimed jsonb;
  v_one jsonb;
  v_token text;
  v_failed boolean;
  v_before int;
begin
  v_id := a_drawable_exchange('outbox', current_date - 1, 'UTC', 4);

  perform assert('nothing is queued before the draw',
    (select count(*) from notifications where exchange_id = v_id) = 0);

  perform record_draw(v_id, a_ring_draw(v_id));

  -- ------------------------------------------------------------------
  -- Filled by the draw, in the same transaction
  -- ------------------------------------------------------------------

  perform assert('everybody who drew a name is queued an email',
    (select count(*) from notifications
     where exchange_id = v_id and kind = 'draw_result') = 4);

  perform assert('addressed to where they registered',
    (select count(*) from notifications n
     join invitees i on i.id = n.invitee_id
     where n.exchange_id = v_id and n.to_email = i.email) = 4);

  perform assert('and the drawn name is nowhere in the outbox',
    not exists (select 1 from notifications n
                join invitees i on i.exchange_id = n.exchange_id
                where n.exchange_id = v_id
                  and n.context::text like '%' || i.name || '%'));

  -- ------------------------------------------------------------------
  -- Claiming
  -- ------------------------------------------------------------------

  -- Scoped to this exchange throughout: the suites share a database,
  -- and draw.sql queues email of its own.
  select coalesce(jsonb_agg(c.value), '[]'::jsonb) into v_claimed
  from jsonb_array_elements(claim_notifications()) c
  where (c.value ->> 'exchangeId')::uuid = v_id;

  perform assert('the sender is handed what is ready',
    jsonb_array_length(v_claimed) = 4);

  v_one := v_claimed -> 0;

  perform assert('with an address', (v_one ->> 'to') like '%@%');
  perform assert('a name to greet them by', (v_one ->> 'name') is not null);
  perform assert('the exchange name', (v_one ->> 'exchangeName') = 'outbox');
  perform assert('and a token for their link',
    length(v_one ->> 'token') > 20);

  perform assert('the token opens that person''s page',
    (registration_view(v_one ->> 'token') -> 'me' ->> 'id')
      = (select invitee_id::text from notifications
         where id = (v_one ->> 'id')::uuid));

  perform assert('and it expires rather than lasting forever',
    (select expires_at from invitee_tokens
     where token_hash = token_hash(v_one ->> 'token')) > now());

  perform assert('a second claim takes nothing, because the first holds them',
    not exists (select 1 from jsonb_array_elements(claim_notifications()) c
                where (c.value ->> 'exchangeId')::uuid = v_id));

  -- ------------------------------------------------------------------
  -- A claim that nothing came back from is retried
  -- ------------------------------------------------------------------

  update notifications set claimed_at = now() - interval '1 hour'
  where exchange_id = v_id;

  perform assert('a stale claim is picked up again',
    (select count(*) from jsonb_array_elements(claim_notifications()) c
     where (c.value ->> 'exchangeId')::uuid = v_id) = 4);

  perform assert('and the attempt is counted',
    (select min(attempts) from notifications where exchange_id = v_id) = 2);

  -- ------------------------------------------------------------------
  -- Sent, and failed
  -- ------------------------------------------------------------------

  perform mark_notification_sent((v_one ->> 'id')::uuid, 'resend-abc123');

  perform assert('a sent email is recorded as sent',
    (select sent_at is not null from notifications
     where id = (v_one ->> 'id')::uuid));
  perform assert('with the provider''s own id, so it can be traced',
    (select provider_id from notifications
     where id = (v_one ->> 'id')::uuid) = 'resend-abc123');

  update notifications set claimed_at = null where exchange_id = v_id;

  perform assert('and is never claimed again',
    not exists (select 1 from jsonb_array_elements(claim_notifications()) c
                where c.value ->> 'id' = v_one ->> 'id'));

  perform mark_notification_failed((v_claimed -> 1 ->> 'id')::uuid, 'timeout');

  perform assert('a failure is recorded',
    (select last_error from notifications
     where id = (v_claimed -> 1 ->> 'id')::uuid) = 'timeout');
  perform assert('and it comes round again',
    (select claimed_at is null and sent_at is null from notifications
     where id = (v_claimed -> 1 ->> 'id')::uuid));

  -- ------------------------------------------------------------------
  -- Giving up rather than hammering the provider
  -- ------------------------------------------------------------------

  update notifications
  set attempts = notification_max_attempts(), claimed_at = null
  where exchange_id = v_id and sent_at is null;

  perform assert('an email that has failed too often stops being retried',
    not exists (select 1 from jsonb_array_elements(claim_notifications()) c
                where (c.value ->> 'exchangeId')::uuid = v_id));

  -- ------------------------------------------------------------------
  -- Queueing twice does not send twice
  -- ------------------------------------------------------------------

  select count(*) into v_before from notifications where exchange_id = v_id;

  insert into notifications (exchange_id, invitee_id, to_email, kind)
  select v_id, i.id, i.email, 'draw_result'
  from invitees i where i.exchange_id = v_id and i.status = 'Registered'
  on conflict do nothing;

  perform assert('a second copy of "here is who you drew" cannot be queued',
    (select count(*) from notifications where exchange_id = v_id) = v_before);

  -- ------------------------------------------------------------------
  -- A draw that cannot be made tells the organizer, once
  -- ------------------------------------------------------------------

  declare
    v_bad uuid := a_drawable_exchange('impossible', current_date - 1, 'UTC', 4);
  begin
    perform fail_draw(v_bad, 'The restrictions leave no valid draw.');

    perform assert('the organizer is told',
      (select count(*) from notifications
       where exchange_id = v_bad and kind = 'draw_failed') = 1);

    perform assert('at the address on the exchange',
      (select n.to_email = e.organizer_email
       from notifications n join exchanges e on e.id = n.exchange_id
       where n.exchange_id = v_bad));

    perform assert('with the reason, so they know what to fix',
      (select context ->> 'reason' from notifications
       where exchange_id = v_bad) = 'The restrictions leave no valid draw.');

    perform fail_draw(v_bad, 'Still no valid draw.');

    perform assert('and failing again does not mail them hourly',
      (select count(*) from notifications
       where exchange_id = v_bad and kind = 'draw_failed') = 1);

    -- The organizer's link opens the management view, not a person's.
    v_one := (select c.value from jsonb_array_elements(claim_notifications()) c
              where (c.value ->> 'kind') = 'draw_failed'
                and (c.value ->> 'exchangeId')::uuid = v_bad);

    perform assert('the organizer email is marked as theirs',
      (v_one ->> 'forOrganizer')::boolean);

    perform assert('and its token opens the exchange, not an invitee',
      exchange_for_organizer(v_one ->> 'token') = v_bad);
  end;

  raise notice '--- outbox: all checks passed ---';
end $$;
