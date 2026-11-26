-- Which of the recent migrations are actually in this database?
--
-- Read-only, and it looks at what the objects contain rather than at
-- any record of what was run, so it tells the truth even if a file
-- was pasted twice or not at all.

select '0020 Brazilian real' as migration,
  case when pg_get_functiondef(p.oid) like '%BRL%'
       then 'yes' else 'NO - run it' end as present
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'gift_budget_label'

union all

select '0021 budget note',
  case when exists (
    select 1 from information_schema.columns
    where table_name = 'exchanges' and column_name = 'gift_budget_note')
  then 'yes' else 'NO - run it' end

union all

select '0022 reminder waits for invitation',
  case when pg_get_functiondef(p.oid) like '%Never overtake the invitation%'
       then 'yes' else 'NO - run it' end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'queue_due_notifications'

union all

select '0019 organizer controls',
  case when exists (
    select 1 from information_schema.columns
    where table_name = 'exchanges' and column_name = 'registration_closed_at')
  then 'yes' else 'NO - run it' end;
