-- Fire both scheduled jobs now, rather than waiting for the hour.
--
-- Reads the token from Vault, so you never need to know it. This is
-- exactly what cron does at :07 and :12; running it by hand only
-- changes the timing.

select net.http_post(
  url := 'https://xcayjyvmyjlccaphoyvw.supabase.co/functions/v1/run-draws',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', (select decrypted_secret from vault.decrypted_secrets
               where name = 'draw_secret')
  ),
  body := '{}'::jsonb
) as draw_request;
