-- Then the sender, once the draw has queued its email. Give the draw
-- a few seconds first: net.http_post returns as soon as the request
-- is accepted, not when it has finished.

select net.http_post(
  url := 'https://xcayjyvmyjlccaphoyvw.supabase.co/functions/v1/send-notifications',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', (select decrypted_secret from vault.decrypted_secrets
               where name = 'draw_secret')
  ),
  body := '{}'::jsonb
) as send_request;
