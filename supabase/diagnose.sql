-- What is actually in this database? Read-only; changes nothing.
--
-- Run this when a migration half-applied, or to confirm a fresh
-- project came out the way it should.

select 'pgcrypto lives in: ' || n.nspname as finding
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgcrypto'

union all

select 'tables: ' || coalesce(string_agg(tablename, ', ' order by tablename), 'none')
from pg_tables where schemaname = 'public'

union all

select 'functions: ' || count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'

union all

select 'missing functions: ' || coalesce(string_agg(wanted, ', '), 'none')
from (
  select unnest(array[
    'ping', 'token_hash', 'new_token', 'create_exchange', 'organizer_view',
    'registration_view', 'register_participant', 'set_my_restriction',
    'clear_my_restriction', 'my_assignment', 'my_thread', 'send_message',
    'mark_thread_read', 'set_messaging_enabled',
    'pending_message_notifications', 'mark_notified'
  ]) as wanted
) w
where not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = w.wanted
)

union all

select 'messaging_enabled column: ' ||
  case when exists (
    select 1 from information_schema.columns
    where table_name = 'exchanges' and column_name = 'messaging_enabled'
  ) then 'present' else 'MISSING (0003 did not finish)' end

union all

-- Not a call: if token_hash were missing this whole query would fail
-- to parse, which is the one case this file exists for. Its existence
-- is proof enough anyway, because Postgres validates a SQL function's
-- body when it is created, so token_hash could not have been created
-- unless digest() was found.
select 'pgcrypto reachable: ' ||
  case when to_regprocedure('public.token_hash(text)') is not null
  then 'yes, token_hash was created'
  else 'unknown, token_hash does not exist yet' end;
