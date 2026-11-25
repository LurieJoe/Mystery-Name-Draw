-- Filling and draining the outbox.
--
-- Nothing in this file is granted to anon. Claiming returns every
-- recipient's address in an exchange and mints working links; that is
-- for the sender and nobody else.

-- --------------------------------------------------------------------
-- Links for the organizer
--
-- The same problem invitee_tokens solved, for the other side. The
-- roll call and the failure notice both have to put the organizer on
-- their management page, and organizer_token_hash is a hash: there is
-- nothing to put in a link. An organizer may hold several tokens too.
-- --------------------------------------------------------------------

create table exchange_tokens (
  token_hash text primary key,

  exchange_id uuid not null references exchanges (id) on delete cascade,

  purpose text not null check (purpose in ('email_link')),

  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index exchange_tokens_exchange_idx on exchange_tokens (exchange_id);

alter table exchange_tokens enable row level security;

/*
 * Which exchange an organizer token opens, from either place.
 *
 * STABLE for the same reason invitee_for_token is: organizer_view and
 * everything built on it are stable, and a version of this that wrote
 * anything would fail for every organizer opening their own page.
 */
create or replace function exchange_for_organizer(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    (select id from exchanges
     where organizer_token_hash = token_hash(p_token)),
    (select exchange_id from exchange_tokens
     where token_hash = token_hash(p_token)
       and expires_at > now())
  );
$$;

-- --------------------------------------------------------------------
-- Filling it
-- --------------------------------------------------------------------

/*
 * How long a link emailed about an exchange keeps working.
 *
 * Thirty days past the draw, not past the sending: two emails about
 * the same exchange should die together, and a reminder sent early
 * should not outlive the result sent later.
 */
create or replace function link_expiry(p_exchange_id uuid)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select (e.draw_date + interval '30 days')::timestamptz
  from exchanges e where e.id = p_exchange_id;
$$;

/*
 * Queue one email.
 *
 * ON CONFLICT DO NOTHING against the one-per-kind index, so queueing
 * is safe to call twice: a retry of whatever queued it does not
 * produce a second copy of "here is who you drew", which is the
 * message that makes somebody doubt the first one.
 */
create or replace function queue_notification(
  p_exchange_id uuid,
  p_invitee_id uuid,
  p_to_email text,
  p_kind text,
  p_context jsonb default '{}'::jsonb,
  p_send_after timestamptz default now()
)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  insert into notifications (
    exchange_id, invitee_id, to_email, kind, context, send_after
  )
  values (
    p_exchange_id, p_invitee_id, p_to_email, p_kind, p_context, p_send_after
  )
  on conflict do nothing;
$$;

-- --------------------------------------------------------------------
-- Draining it
-- --------------------------------------------------------------------

create or replace function notification_claim_timeout()
returns interval
language sql
immutable
as $$ select interval '10 minutes' $$;

/* Give up after this many tries and leave it for somebody to look at. */
create or replace function notification_max_attempts()
returns int
language sql
immutable
as $$ select 5 $$;

/*
 * What is ready to send, with a working link for each.
 *
 * The token is minted here rather than when the row was queued,
 * because only its hash is ever stored: a token created at queue time
 * could not be read back at send time. Minting on claim means the raw
 * token exists only in this result and in the email, never at rest.
 *
 * Returns the token rather than a URL. The database does not know
 * what the site is called, and should not have to.
 */
create or replace function claim_notifications(p_limit int default 50)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row record;
  v_token text;
  v_out jsonb := '[]'::jsonb;
begin
  for v_row in
    with ready as (
      select n.id
      from notifications n
      where n.sent_at is null
        and n.send_after <= now()
        and n.attempts < notification_max_attempts()
        and (n.claimed_at is null
             or n.claimed_at < now() - notification_claim_timeout())
      order by n.send_after
      limit p_limit
      for update skip locked
    ),
    claimed as (
      update notifications n
      set claimed_at = now(),
          attempts = n.attempts + 1
      from ready
      where n.id = ready.id
      returning n.*
    )
    select c.*, e.name as exchange_name, e.organizer_name,
           e.draw_date, e.registration_deadline,
           i.name as invitee_name
    from claimed c
    join exchanges e on e.id = c.exchange_id
    left join invitees i on i.id = c.invitee_id
  loop
    v_token := new_token();

    if v_row.invitee_id is not null then
      insert into invitee_tokens (token_hash, invitee_id, purpose, expires_at)
      values (token_hash(v_token), v_row.invitee_id, 'email_link',
              link_expiry(v_row.exchange_id));
    else
      insert into exchange_tokens (token_hash, exchange_id, purpose, expires_at)
      values (token_hash(v_token), v_row.exchange_id, 'email_link',
              link_expiry(v_row.exchange_id));
    end if;

    v_out := v_out || jsonb_build_object(
      'id', v_row.id,
      'exchangeId', v_row.exchange_id,
      'kind', v_row.kind,
      'to', v_row.to_email,
      -- Null for the organizer, whose name is on the exchange.
      'name', coalesce(v_row.invitee_name, v_row.organizer_name),
      'exchangeName', v_row.exchange_name,
      'organizerName', v_row.organizer_name,
      'drawDate', v_row.draw_date,
      'registrationDeadline', v_row.registration_deadline,
      'forOrganizer', v_row.invitee_id is null,
      'token', v_token,
      'context', v_row.context,
      'attempt', v_row.attempts
    );
  end loop;

  return v_out;
end;
$$;

create or replace function mark_notification_sent(
  p_id uuid,
  p_provider_id text default null
)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update notifications
  set sent_at = now(),
      claimed_at = null,
      last_error = null,
      provider_id = p_provider_id
  where id = p_id;
$$;

/*
 * Record a failure and let it come round again.
 *
 * The claim is released rather than the row being marked dead, so the
 * next pass retries it. attempts was already incremented on claim, so
 * a send that fails the same way five times stops on its own instead
 * of hammering the provider until somebody notices.
 */
create or replace function mark_notification_failed(
  p_id uuid,
  p_error text
)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update notifications
  set claimed_at = null,
      last_error = p_error
  where id = p_id;
$$;

-- --------------------------------------------------------------------
-- Permissions
-- --------------------------------------------------------------------

revoke all on function queue_notification(uuid, uuid, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function claim_notifications(int) from public, anon, authenticated;
revoke all on function mark_notification_sent(uuid, text) from public, anon, authenticated;
revoke all on function mark_notification_failed(uuid, text) from public, anon, authenticated;

grant execute on function claim_notifications(int) to service_role;
grant execute on function mark_notification_sent(uuid, text) to service_role;
grant execute on function mark_notification_failed(uuid, text) to service_role;


-- --------------------------------------------------------------------
-- The draw fills the outbox
--
-- Reproduced from 0009 with the queueing added, so the diff between
-- what ran before and what runs now is the insert and nothing else.
-- --------------------------------------------------------------------

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

  /*
   * The emails, queued in this same transaction.
   *
   * A draw that happened with nobody told is worse than one that did
   * not happen: the exchange looks finished, everybody is waiting,
   * and there is no signal that anything went wrong. Writing the
   * assignments and the outbox together means the only way to have a
   * draw is to have the emails queued for it.
   *
   * Unsubscribed people are included here and nowhere else. Opting
   * out means no reminders; it should not mean never finding out who
   * you are buying for, which is the thing they registered for.
   */
  insert into notifications (exchange_id, invitee_id, to_email, kind)
  select p_exchange_id, i.id, i.email, 'draw_result'
  from invitees i
  where i.exchange_id = p_exchange_id
    and i.status = 'Registered'
  on conflict do nothing;

  return jsonb_build_object('drawn', v_expected);
end;
$$;

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

  /*
   * Tell the organizer, once.
   *
   * ON CONFLICT DO NOTHING rather than resending: the draw retries
   * every hour, and an exchange with an impossible set of
   * restrictions would otherwise mail them hourly until they fixed
   * it. One email, and the reason stays on their management page.
   */
  insert into notifications (exchange_id, invitee_id, to_email, kind, context)
  select e.id, null, e.organizer_email, 'draw_failed',
         jsonb_build_object('reason', p_reason)
  from exchanges e
  where e.id = p_exchange_id
  on conflict do nothing;

  return jsonb_build_object('recorded', true);
end;
$$;
