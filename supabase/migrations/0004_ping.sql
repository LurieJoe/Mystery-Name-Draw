-- A door to knock on.
--
-- A free Supabase project is paused after about a week without
-- database activity, and a paused project is not slow but off: the
-- registration links error and no draw can run. Something has to touch
-- the database every few days, and it should be a thing that exists on
-- purpose rather than a real function called with deliberately wrong
-- arguments.
--
-- It returns the time, because a keep-alive that cannot tell "the
-- database answered" from "something answered" is not worth running. It
-- reveals nothing: the current time is not a secret, and this function
-- reads no table.

create or replace function ping()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('awake', true, 'at', now());
$$;

comment on function ping is
  'Keep-alive target. Touches no table and returns no data of anyone''s.';

revoke all on function ping() from public;
grant execute on function ping() to anon;
