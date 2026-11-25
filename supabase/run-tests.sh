#!/usr/bin/env bash
#
# Apply the migrations to a scratch database and run the checks.
#
#   ./supabase/run-tests.sh "postgres://localhost/mnd_test"
#
# Or against the local Supabase stack, once `supabase start` is running:
#
#   ./supabase/run-tests.sh "$(supabase status -o env | grep DB_URL | cut -d= -f2-)"
#
# Every check raises on failure, so a non-zero exit means a promise this
# app makes to the people using it is broken.

set -euo pipefail

DB_URL="${1:-${DATABASE_URL:-}}"

if [ -z "$DB_URL" ]; then
  echo "Usage: $0 <database-url>" >&2
  exit 64
fi

HERE="$(cd "$(dirname "$0")" && pwd)"

# Supabase has these roles already; a bare Postgres does not, and the
# grants at the end of each migration need them to exist.
psql "$DB_URL" -q -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end \$\$;"

# The migrations are written to run once, in order, the way they will
# run against the real project. Applying them to a database that
# already has them fails halfway through and leaves a mess, so refuse
# instead. Dropping the schema here would be the other option, and a
# bad one: this takes a connection string, and one day that string will
# be the wrong database.
if psql "$DB_URL" -tAc \
  "select to_regclass('public.exchanges') is not null" | grep -q '^t$'; then
  cat >&2 <<'MSG'
This database already has the schema. These migrations run once, in
order, so point this at an empty database instead:

  createdb mnd_test && ./supabase/run-tests.sh "postgres://localhost/mnd_test"

MSG
  exit 65
fi

for migration in "$HERE"/migrations/*.sql; do
  echo "applying $(basename "$migration")"
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$migration"
done

for suite in "$HERE"/tests/*.sql; do
  echo
  echo "== $(basename "$suite") =="
  # Passes are printed as notices; anything else is a failure and has
  # to survive. Piping through a filter that only kept NOTICE lines
  # meant a suite could abort on an error and look like it had simply
  # run fewer checks.
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$suite" 2>&1 \
    | sed -e 's/^psql:.*NOTICE:  //' -e '/^[A-Z]* *$/d'
done
