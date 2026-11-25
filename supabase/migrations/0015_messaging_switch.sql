-- Tell the page whether messaging is actually switched on.
--
-- my_thread has always reported `available` as "the draw has run, so
-- there is somebody at the other end". That is not the same question
-- as "can this person send anything", because the organizer can switch
-- messaging off for the whole exchange. Until now the screen had no
-- way to know: it would draw a box, a label, and a Send button, and
-- the first thing that told anybody otherwise was an error after they
-- had typed a message out.
--
-- So my_thread now also says canSend. Nothing about who may read what
-- changes; this only decides whether a composer is worth drawing.
-- send_message still refuses on its own account, as it must: a client
-- that ignores this flag gains nothing by it.

create or replace function my_thread(p_invitee_token text, p_as text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_thread assignments;
  v_me uuid := invitee_for_token(p_invitee_token);
begin
  if v_me is null then
    raise exception 'No invitation for that link' using errcode = 'no_data_found';
  end if;

  v_thread := thread_for(p_invitee_token, p_as);

  if v_thread.giver_id is null then
    -- Before the draw there is nobody to talk to, and saying so reveals
    -- nothing: everyone is in the same position.
    return jsonb_build_object('available', false, 'messages', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'available', true,
    'canSend', coalesce(
      (select messaging_enabled from exchanges where id = v_thread.exchange_id),
      false
    ),
    -- A giver is talking to someone they know, so they get the name. A
    -- receiver is not, and gets the relationship instead: "Your Giver"
    -- says who this is without saying who they are, and it still reads
    -- correctly for a book swap or a classroom draw.
    'withName', case
      when p_as = 'giver'
        then (select name from invitees where id = v_thread.receiver_id)
      else null
    end,
    'withLabel', case
      when p_as = 'giver'
        then (select name from invitees where id = v_thread.receiver_id)
      else 'Your Giver'
    end,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        -- 'from' is for the client to style with: whose side of the
        -- thread a message sits on. 'fromLabel' is what it says.
        'from', case when m.sender_role = p_as then 'you' else 'them' end,
        'fromLabel', case
          when m.sender_role = p_as then 'You'
          when p_as = 'giver'
            then (select name from invitees where id = v_thread.receiver_id)
          else 'Your Giver'
        end,
        'body', m.body,
        'at', m.created_at
      ) order by m.created_at)
      from messages m
      where m.exchange_id = v_thread.exchange_id
        and m.giver_id = v_thread.giver_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function my_thread(text, text) from public;
grant execute on function my_thread(text, text) to anon;
