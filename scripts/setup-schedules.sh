#!/usr/bin/env bash
#
# Sets up the two scheduled jobs: one that runs due draws, one that
# sends the email they queue.
#
#   ./scripts/setup-schedules.sh
#
# What it does for you:
#   - generates the token the scheduler authenticates with
#   - installs it as an Edge Function secret, through the CLI
#   - deploys both functions
#   - puts the SQL for Vault and the two cron jobs on your clipboard
#
# What it deliberately leaves to you: running that SQL. It creates
# scheduled jobs in your production database, and a script that did it
# silently would be the wrong kind of convenient.
#
# The token is not passed on a command line and not printed. npx
# echoes the command it runs, so an argument would land in terminal
# scrollback - and in `ps`, where any process on the machine can read
# it. It goes through a temporary file instead, readable only by you
# and deleted when this exits, however it exits.
#
# Safe to run twice. If DRAW_SECRET is already set it stops rather
# than minting a new one: a fresh token in Edge Function secrets while
# Vault still holds the old one means every scheduled call starts
# getting 401, and the failure looks like the draw quietly not
# happening. To replace the token deliberately:
#
#   ROTATE=1 ./scripts/setup-schedules.sh
#
# which mints a new one and gives you SQL that updates Vault to match.

set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_REF="xcayjyvmyjlccaphoyvw"
SITE_URL="https://mysterynamedraw.com"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

if ! command -v openssl >/dev/null; then
  echo "openssl is needed to generate the token." >&2
  exit 1
fi

# ---------------------------------------------------------------------
say "1. Checking what is already set up"
# ---------------------------------------------------------------------

EXISTING=$(npx --yes supabase secrets list --project-ref "$PROJECT_REF" 2>/dev/null \
  | grep -c '^ *DRAW_SECRET ' || true)

if [ "$EXISTING" != "0" ] && [ "${ROTATE:-}" != "1" ]; then
  cat <<'ALREADY'

   DRAW_SECRET is already set on this project, so this has been run
   before. Stopping here rather than minting a new token: a new one
   would not match what Vault holds, and every scheduled call would
   start failing with 401.

   To check the rest is in place, run this in the SQL editor:

     select name from vault.secrets order by name;
     select jobname, schedule, active from cron.job order by jobname;

   Expect project_url and draw_secret, and two active jobs.

   To deploy the functions without touching the token:

     npx supabase functions deploy run-draws --use-api
     npx supabase functions deploy send-notifications --use-api

   To replace the token on purpose:

     ROTATE=1 ./scripts/setup-schedules.sh

ALREADY
  exit 0
fi

if [ "$EXISTING" != "0" ]; then
  echo "   replacing the existing token, because ROTATE=1"
else
  echo "   nothing set yet"
fi

DRAW_SECRET="$(openssl rand -hex 32)"
echo "   token generated (64 hex characters, not shown)"

# ---------------------------------------------------------------------
say "2. Installing it as an Edge Function secret"
# ---------------------------------------------------------------------

ENV_FILE="$(mktemp -t mnd-secrets.XXXXXX)"
chmod 600 "$ENV_FILE"
trap 'rm -f "$ENV_FILE"' EXIT INT TERM HUP

cat >"$ENV_FILE" <<ENVEOF
DRAW_SECRET=${DRAW_SECRET}
SITE_URL=${SITE_URL}
ENVEOF

# --silent so npx does not echo the command. --project-ref is
# deprecated in favor of --remote, and still works; switching would
# break on a CLI older than whatever introduced it.
npx --yes --silent supabase secrets set \
  --env-file "$ENV_FILE" \
  --project-ref "$PROJECT_REF"

rm -f "$ENV_FILE"

# ---------------------------------------------------------------------
say "3. Deploying both functions"
# ---------------------------------------------------------------------

npx --yes supabase functions deploy run-draws \
  --use-api --project-ref "$PROJECT_REF"
npx --yes supabase functions deploy send-notifications \
  --use-api --project-ref "$PROJECT_REF"

# ---------------------------------------------------------------------
say "4. The SQL, on your clipboard"
# ---------------------------------------------------------------------

# A function rather than SQL=$(cat <<EOF ...), because macOS ships
# bash 3.2 and its parser mishandles a heredoc inside command
# substitution. The same script is fine under bash 5 and dies at the
# closing quote under 3.2, which is a confusing way to find out.
emit_sql() {
  cat <<SQLEOF
-- Mystery Name Draw: the two scheduled jobs.
--
-- Run this once, in the Supabase SQL editor, with the editor cleared
-- first. It contains the scheduler's token, so do not save it to a
-- file or paste it anywhere else.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Vault, so the token is not sitting in plain text in a job
-- definition that anybody with database access can read.
--
-- Updated if it already exists. create_secret on an existing name
-- fails, and a failure here after the token had already been changed
-- on the function side would leave the two disagreeing, which reads
-- as the draw silently not happening.
do \$\$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'project_url';
  if v_id is null then
    perform vault.create_secret('${SITE_URL%/}', 'project_url');
  else
    perform vault.update_secret(v_id, '${SITE_URL%/}', 'project_url');
  end if;

  select id into v_id from vault.secrets where name = 'draw_secret';
  if v_id is null then
    perform vault.create_secret('${DRAW_SECRET}', 'draw_secret');
  else
    perform vault.update_secret(v_id, '${DRAW_SECRET}', 'draw_secret');
  end if;
end
\$\$;

-- Draws first, at seven minutes past. Each run draws every exchange
-- whose own local clock has passed nine in the morning on its draw
-- date, so one hourly job covers every time zone.
select cron.schedule(
  'run-draws-hourly',
  '7 * * * *',
  \$\$
  select net.http_post(
    url := 'https://${PROJECT_REF}.supabase.co/functions/v1/run-draws',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets
                 where name = 'draw_secret')
    ),
    body := '{}'::jsonb
  );
  \$\$
);

-- Then the email, five minutes later, so a draw that just happened
-- has its messages queued before anything tries to send them.
select cron.schedule(
  'send-notifications-hourly',
  '12 * * * *',
  \$\$
  select net.http_post(
    url := 'https://${PROJECT_REF}.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets
                 where name = 'draw_secret')
    ),
    body := '{}'::jsonb
  );
  \$\$
);

-- What you should see afterwards: two rows, both active.
select jobname, schedule, active from cron.job order by jobname;
SQLEOF
}

if command -v pbcopy >/dev/null; then
  emit_sql | pbcopy
  echo "   copied. Paste it into the Supabase SQL editor (clear it first)."
else
  emit_sql
fi

say "Then:"
cat <<'NEXT'
   - Run the SQL. The last statement lists both jobs; expect two rows.
   - Open the run-draws URL in a browser. It must answer 401. If it
     answers anything else, say so before going further.
   - At the next :07 and :12, check Edge Functions > Logs. Both should
     report nothing to do, which is correct and proves the chain.

   The token is in your clipboard until you copy something else, and
   in Supabase. It was not printed, and the temporary file it passed
   through has been deleted.
NEXT
