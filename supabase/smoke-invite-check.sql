-- Step 3 of 3, after smoke-send.sql. Did the invitations actually go?
--
-- Read-only. Run it a few seconds after the sender, since
-- net.http_post returns when the request is accepted, not finished.

select
  i.name,
  n.to_email,
  n.sent_at is not null as sent,
  n.attempts,
  n.last_error,
  -- The link in the email is a token minted at send time. One per
  -- person, even where two people share an inbox: that is what lets
  -- the second daughter open her own page rather than her mother's.
  (select count(*) from invitee_tokens t where t.invitee_id = i.id)
    as links_minted
from invitees i
join notifications n
  on n.invitee_id = i.id and n.kind = 'invitation'
join exchanges e on e.id = i.exchange_id
where e.name = 'Invitation smoke test'
order by i.created_at;
