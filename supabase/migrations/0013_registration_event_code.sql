-- registration_view now says which exchange it is.
--
-- A link that arrives by email carries a token and nothing else, so
-- the page it opens has to work out what exchange it is looking at
-- before it can remember the token for next time - this browser
-- stores a token per event code. Without the code in the view, the
-- only way to find it would be a second round trip for a fact the
-- first one already had in hand.
--
-- Reproduced from 0010 with one line added.

create or replace function registration_view(p_invitee_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_invitee invitees;
begin
  select * into v_invitee from invitees
  where id = invitee_for_token(p_invitee_token);

  if v_invitee.id is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  return (
    select jsonb_build_object(
      'exchange', jsonb_build_object(
        'eventCode', e.event_code,
        'name', e.name,
        'giftBudget', e.gift_budget,
        'currency', e.currency,
        'noGiftLimit', e.no_gift_limit,
        'registrationDeadline', e.registration_deadline,
        'drawDate', e.draw_date,
        'organizerName', e.organizer_name,
        'drawn', e.drawn_at is not null
      ),
      'registrationOpen', registration_is_open(e.id),
      'restrictionsOpen', restrictions_are_open(e.id),
      'me', jsonb_build_object(
        'id', v_invitee.id,
        'name', v_invitee.name,
        'email', v_invitee.email,
        'status', v_invitee.status,
        'wishlist', v_invitee.wishlist,
        'preferences', v_invitee.preferences,
        'unsubscribed', v_invitee.unsubscribed_at is not null
      ),
      -- Names only, and only of people who registered: enough to
      -- choose a restriction, and nothing about anyone's wishlist or
      -- choices.
      'others', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name)
                         order by i.name)
        from invitees i
        where i.exchange_id = e.id
          and i.id <> v_invitee.id
          and i.status = 'Registered'
      ), '[]'::jsonb),
      -- Their own choices only. A restriction the organizer entered
      -- for them is honored by the draw and never shown here.
      'myRestrictions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'otherId', r.other_invitee_id,
          'direction', r.direction
        ) order by r.created_at)
        from restrictions r
        where r.owner_invitee_id = v_invitee.id
          and not r.set_by_organizer
      ), '[]'::jsonb)
    )
    from exchanges e
    where e.id = v_invitee.exchange_id
  );
end;
$$;
