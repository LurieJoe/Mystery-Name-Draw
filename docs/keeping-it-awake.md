# Keeping the database awake

A free Supabase project is paused after about a week without database
activity, and it stays paused until somebody resumes it from the
dashboard. A paused project is not slow, it is off: the pages still
load from GitHub Pages, but registration fails, invitation links error,
and no draw can run. The site looks live and does nothing.

Something therefore has to touch the database every few days. That is
all a pinger is.

`ping()` exists for them to call. It reads no table and returns nobody's
data, so the only thing it can report is whether the database answered,
which is the only thing being asked.

Two pingers, because one is a single point of failure:

| | Runs on | Fails if |
| --- | --- | --- |
| GitHub Actions | This repo, every 3 days | You stop committing for 60 days, and GitHub disables the schedule |
| An external cron | Somebody else's machine | That service lapses |

Neither can take the other down, which is the point of having both.

## About the key

Both pingers need the **anon** key. That key is meant to be public: it
is already in the JavaScript every visitor downloads, and on its own it
can reach nothing but the functions in `0002` and `0004`, every one of
which demands a token it does not have.

The **service role** key is the opposite, and must never be pasted into
a cron service, a repository secret, or anything a browser can see.

## 0. Push first

Not for any deep reason: step 2 has you press "Run workflow", and that
button runs whatever version of the workflow is on GitHub rather than
the one on your laptop. Testing the old one would pass without proving
anything, since it never calls ping() at all.

```
npm run build
git add -A
git commit -F .git/QUICK_DRAW_COMMIT_MSG
git push origin main
```

Safe to do before the project exists: the workflow runs only on a
schedule or when you press the button, and exits immediately while the
secrets are missing.

## 1. The project itself

1. Create a project at supabase.com. The free plan is the one being
   discussed here.
2. Open the SQL editor and run, in order:
   `supabase/migrations/0001_schema.sql`, `0002_functions.sql`,
   `0003_messages.sql`, `0004_ping.sql`.
3. From Project Settings → API, copy the **Project URL** and the
   **anon public** key.

Confirm it all arrived, substituting your two values:

```
curl -X POST "https://YOUR-REF.supabase.co/rest/v1/rpc/ping" \
  -H "apikey: YOUR-ANON-KEY" \
  -H "Authorization: Bearer YOUR-ANON-KEY" \
  -H "Content-Type: application/json" \
  --data '{}'
```

You want `{"awake": true, "at": "..."}`. Anything else means the
migrations did not all run, or the key is wrong.

## 2. The GitHub pinger

The workflow is already in the repo and does nothing until its secrets
exist, so there is nothing to write.

In the repository: **Settings → Secrets and variables → Actions → New
repository secret**. Add both, named exactly:

- `SUPABASE_URL` — `https://YOUR-REF.supabase.co`
- `SUPABASE_ANON_KEY` — the anon public key

Then **Actions → Keep Supabase awake → Run workflow** to try it now
rather than waiting three days. A green tick means it reached the
database. A red cross emails you, which is the whole point: a pinger
that fails silently is not a pinger.

## 3. The external pinger

This one exists so that a quiet repo cannot take the keep-alive down
with it. Any cron service will do; cron-job.org is free and needs no
card.

- **URL** `https://YOUR-REF.supabase.co/rest/v1/rpc/ping`
- **Method** POST
- **Headers**
  - `apikey: YOUR-ANON-KEY`
  - `Authorization: Bearer YOUR-ANON-KEY`
  - `Content-Type: application/json`
- **Body** `{}`
- **Schedule** every 3 days
- **Notify on failure** on, to whatever address you read

Set it to a different day from the GitHub one if the service lets you
choose, so a bad day for one is not a bad day for both.

## What failure looks like

An email from GitHub about a failed run, or from the cron service about
a non-200. Either means: open the Supabase dashboard, resume the
project if it is paused, and work out which pinger stopped.

## Before anything that matters

A few days before a real draw date, run the curl above, or just open
the site and register on a test exchange. One minute, and it is the
only routine worth keeping.

If that check ever feels like a chore you resent, that is the signal to
pay for the Pro plan, which is never paused. The cost of the free plan
is not the pingers, it is having to care at all.
