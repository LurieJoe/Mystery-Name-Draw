-- Brazilian real in the budget line.
--
-- The symbol has to be here as well as in src/exchange/format.ts,
-- because this is what the invitation email prints and that is what
-- the screen prints. Adding a currency means both, and this file
-- exists rather than an edit to 0016 because 0016 has already run.
--
-- Worth collapsing one day: if the sender were handed the amount and
-- the currency rather than a finished label, the symbols would live
-- in one place. That is a change to what send_invitations queues and
-- to the Edge Function, not a one-line fix, so it waits.

create or replace function gift_budget_label(p_exchange_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when e.no_gift_limit then 'No limit'
    when coalesce(trim(e.gift_budget), '') = '' then 'Not set'
    else case e.currency
           when 'GBP' then '£'
           when 'EUR' then '€'
           when 'BRL' then 'R$'
           when 'USD' then '$'
           when 'CAD' then '$'
           when 'AUD' then '$'
           else ''
         end || trim(e.gift_budget) || ' ' || e.currency
  end
  from exchanges e
  where e.id = p_exchange_id;
$$;

revoke all on function gift_budget_label(uuid) from public, anon;
