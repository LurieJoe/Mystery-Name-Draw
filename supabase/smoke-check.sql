-- Did it work?

select
  n.kind,
  n.to_email,
  case when n.sent_at is not null then 'sent' else 'not sent' end as state,
  n.attempts,
  n.provider_id,
  n.last_error
from notifications n
join exchanges e on e.id = n.exchange_id
where e.name = 'Smoke test exchange'
order by n.created_at;
