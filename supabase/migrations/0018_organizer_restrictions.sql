-- The restrictions an organizer sets after the exchange exists.
--
-- Until now they reached the database exactly once, in the payload
-- that created the exchange. Everything set afterwards lived in the
-- browser that set it: it showed on the screen, it was gone on the
-- next page load, and the draw never saw it. That is the worst way
-- for this particular feature to fail, because nothing looks wrong.
-- An organizer who carefully keeps two people apart gets told the
-- draw succeeded, and the two people are paired.
--
-- Organizer restrictions are the ones the person they are about
-- never sees, so these are deliberately separate from the two
-- functions a participant uses on their own page.

create or replace function set_organizer_restriction(
  p_organizer_token text,
  p_owner_id uuid,
  p_other_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  if p_direction not in ('give', 'receive') then
    raise exception 'A restriction is about giving or receiving'
      using errcode = 'check_violation';
  end if;

  if p_owner_id = p_other_id then
    raise exception 'Nobody can be kept apart from themselves'
      using errcode = 'check_violation';
  end if;

  -- Both halves have to be people in this exchange. Without the
  -- check, an organizer token would be enough to write a row naming
  -- somebody in a different exchange entirely.
  if (select count(*) from invitees
      where exchange_id = v_exchange_id
        and id in (p_owner_id, p_other_id)) <> 2 then
    raise exception 'Both people have to be in this exchange'
      using errcode = 'no_data_found';
  end if;

  if (select drawn_at from exchanges where id = v_exchange_id) is not null then
    raise exception 'The draw has run, so the restrictions are settled'
      using errcode = 'check_violation';
  end if;

  insert into restrictions (
    exchange_id, owner_invitee_id, other_invitee_id, direction,
    set_by_organizer
  )
  values (v_exchange_id, p_owner_id, p_other_id, p_direction, true)
  on conflict do nothing;

  return jsonb_build_object('set', true);
end;
$$;

create or replace function clear_organizer_restriction(
  p_organizer_token text,
  p_owner_id uuid,
  p_other_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_exchange_id uuid := exchange_for_organizer(p_organizer_token);
begin
  if v_exchange_id is null then
    raise exception 'No exchange for that link' using errcode = 'no_data_found';
  end if;

  if (select drawn_at from exchanges where id = v_exchange_id) is not null then
    raise exception 'The draw has run, so the restrictions are settled'
      using errcode = 'check_violation';
  end if;

  -- Only the organizer's own. A choice somebody made on their own
  -- page is theirs, and an organizer clearing it from a screen that
  -- never showed it to them would be acting on their behalf without
  -- their knowing.
  delete from restrictions
  where exchange_id = v_exchange_id
    and owner_invitee_id = p_owner_id
    and other_invitee_id = p_other_id
    and direction = p_direction
    and set_by_organizer;

  return jsonb_build_object('cleared', true);
end;
$$;

revoke all on function set_organizer_restriction(text, uuid, uuid, text) from public;
revoke all on function clear_organizer_restriction(text, uuid, uuid, text) from public;

grant execute on function set_organizer_restriction(text, uuid, uuid, text) to anon;
grant execute on function clear_organizer_restriction(text, uuid, uuid, text) to anon;
