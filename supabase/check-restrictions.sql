-- What restrictions is the draw actually going to honor?
--
-- Read-only. Shows every restriction stored against the most recent
-- exchange, in words, with who set it.
--
-- An empty result means the draw will match everybody at random,
-- whatever the management screen shows: nothing saved restrictions
-- before 25 November 2026.

with latest as (
  select id, name, draw_date from exchanges order by created_at desc limit 1
)
select
  owner.name as person,
  case r.direction
    when 'give' then 'will not be asked to buy for'
    else 'will not be bought for by'
  end as rule,
  other.name as the_other_person,
  case when r.set_by_organizer then 'you set it' else 'they set it' end as who,
  r.created_at
from latest l
join restrictions r on r.exchange_id = l.id
join invitees owner on owner.id = r.owner_invitee_id
join invitees other on other.id = r.other_invitee_id
order by owner.name, r.direction;
