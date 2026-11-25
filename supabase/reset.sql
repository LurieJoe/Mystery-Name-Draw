-- Put the database back to empty, so the migrations can be applied to
-- a clean slate.
--
-- THIS DELETES EVERY EXCHANGE, REGISTRATION, RESTRICTION, ASSIGNMENT,
-- AND MESSAGE. It is for a project that has not been used yet, or a
-- migration that applied halfway and left a state no migration expects.
-- It is not a thing to run against an exchange somebody is waiting on.
--
-- It only touches objects this app created. Anything else in the public
-- schema is left alone, which is why this is a list of drops rather
-- than dropping the schema.

-- Tables first: cascade takes the policies, indexes, and constraints.
drop table if exists messages cascade;
drop table if exists assignments cascade;
drop table if exists restrictions cascade;
drop table if exists invitees cascade;
drop table if exists exchanges cascade;

-- Functions by signature, found rather than listed, so an overload or
-- a rename cannot leave one behind.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'ping', 'token_hash', 'new_token', 'exchange_today',
        'registration_is_open', 'restrictions_are_open',
        'exchange_for_organizer', 'invitee_for_token',
        'create_exchange', 'organizer_view', 'registration_view',
        'register_participant', 'set_my_restriction',
        'clear_my_restriction', 'my_assignment', 'thread_for',
        'my_thread', 'send_message', 'mark_thread_read',
        'set_messaging_enabled', 'pending_message_notifications',
        'mark_notified', 'assert'
      )
  loop
    execute 'drop function if exists ' || fn.signature || ' cascade';
  end loop;
end;
$$;

select 'Reset. Now apply the four migrations.' as done;
