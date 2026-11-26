-- Why hasn't an invitation arrived?
--
-- Read-only. Looks at the most recently created exchange and shows
-- every person on it, what was queued for them, and what happened to
-- it. Paste into the SQL editor and run.

with latest as (
  select id, name, event_code, registration_deadline, draw_date,
         registration_closed_at, drawn_at
  from exchanges
  order by created_at desc
  limit 1
)
select
  l.name              as exchange,
  l.event_code,
  registration_is_open(l.id) as registration_open,
  i.name              as person,
  i.email,
  i.status,
  i.is_organizer,
  i.unsubscribed_at is not null as opted_out,
  n.kind,
  n.to_email,
  n.send_after,
  n.sent_at,
  n.attempts,
  n.last_error
from latest l
join invitees i on i.exchange_id = l.id
left join notifications n on n.invitee_id = i.id
order by i.created_at, n.kind;
