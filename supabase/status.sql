-- What is actually in this database, and what is still missing.
--
-- Read-only, and one statement on purpose. Two reasons: the SQL
-- editor only shows the last result set, so anything above it is
-- invisible; and a missing table named directly in a later statement
-- is a parse-time error that kills the whole batch before any of it
-- runs, which is the opposite of what a diagnostic is for. Every
-- check below goes through to_regclass or a catalog lookup, so
-- nothing here can fail because something is absent - that is the
-- thing it exists to report.

with expected(sort, part, name, source) as (values
  (1, 'extension', 'pg_cron',                   'scheduling'),
  (1, 'extension', 'pg_net',                    'scheduling'),
  (2, 'table',     'exchanges',                 '0001'),
  (2, 'table',     'invitees',                  '0001'),
  (2, 'table',     'restrictions',              '0001'),
  (2, 'table',     'assignments',               '0001'),
  (2, 'table',     'messages',                  '0003'),
  (2, 'table',     'notifications',             '0010'),
  (2, 'table',     'invitee_tokens',            '0010'),
  (2, 'table',     'exchange_tokens',           '0011'),
  (3, 'column',    'exchanges.allow_open_join', '0006'),
  (3, 'column',    'invitees.self_joined',      '0007'),
  (3, 'column',    'exchanges.draw_claimed_at', '0009'),
  (3, 'column',    'exchanges.draw_error',      '0009'),
  (4, 'function',  'join_exchange',             '0007'),
  (4, 'function',  'withdraw_registration',     '0007'),
  (4, 'function',  'restrictions_are_open',     '0008'),
  (4, 'function',  'claim_due_draws',           '0009'),
  (4, 'function',  'record_draw',               '0009'),
  (4, 'function',  'fail_draw',                 '0009'),
  (4, 'function',  'claim_notifications',       '0011'),
  (4, 'function',  'mark_notification_sent',    '0011'),
  (4, 'function',  'queue_notification',        '0012'),
  (4, 'function',  'set_my_reminders',          '0012')
)
select
  e.sort, e.part, e.name, e.source,
  case when
    case e.part
      when 'table' then to_regclass('public.' || e.name) is not null
      when 'column' then exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = split_part(e.name, '.', 1)
          and c.column_name = split_part(e.name, '.', 2))
      when 'function' then exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = e.name)
      when 'extension' then exists (
        select 1 from pg_extension where extname = e.name)
    end
  then 'yes' else '>> MISSING' end as status
from expected e

order by 1, 4, 3;

-- The scheduled jobs and the Vault entries are deliberately not part
-- of that query. Both would have to name cron.job and vault.secrets
-- directly, and a missing relation is a parse-time error: the one
-- case where you most want a diagnostic is the one where it would
-- refuse to run. Once the schedule SQL has been applied, run this on
-- its own:
--
--   select jobname, schedule, active from cron.job order by jobname;
--   select name from vault.secrets order by name;
