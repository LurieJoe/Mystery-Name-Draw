-- Restrictions were closing about nine hours before the draw they
-- apply to, which contradicted what both registration screens tell
-- people.
--
-- The old rule was `exchange_today < draw_date`, so restrictions shut
-- at midnight entering the draw date. The draw itself does not run
-- until nine in the morning, local to the exchange. In between,
-- somebody who opened their page on the morning of the draw was told
-- restrictions were closed while the matching had not happened yet.
--
-- Both screens say "right up until the draw", so that is what this
-- now means: open through the draw date, and shut the moment the draw
-- actually runs. drawn_at is what closes them, which is also what
-- makes this correct rather than merely later: a draw that runs early
-- closes them early, and one that is delayed does not shut people out
-- while they are still waiting.

create or replace function restrictions_are_open(p_exchange_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exchange_today(p_exchange_id) > e.registration_deadline
     and exchange_today(p_exchange_id) <= e.draw_date
     and e.drawn_at is null
  from exchanges e
  where e.id = p_exchange_id;
$$;
