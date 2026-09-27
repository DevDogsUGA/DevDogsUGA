---
name: Supabase, hosted
description: The default database setup — your own free-tier Supabase project, wired up by the setup wizard or by hand.
order: 40
section: getting-started
mount: [schedule-builder, study-group-finder, platform]
---

# Supabase, hosted

**A hosted Supabase project — your own, free — is the default way to get a
database for local development.** A [local Docker stack](./supabase-local)
is fully supported too, and some contributors prefer it, but hosted is what
the workshop walks you through and what needs no Docker at all. If you're on
native Windows, this is your only option — there's no local Docker path
documented for it.

## Create a project

Go to [supabase.com](https://supabase.com), sign up, and create a new project
(Dashboard → New Project). Pick any region; note the database password it
asks you to set, in case you need it later — day to day you won't need it,
since the setup below uses API keys and a pooler connection string instead.

## The wizard

```bash
pnpm devtools setup
```

The wizard asks for four things from your new project's dashboard
(Settings → API, and Settings → Database):

- **API URL**
- **Publishable key**
- **Secret key**
- **DB_URL** — the **Session pooler** connection string (see the note below)

It validates the pooler string's shape, writes them into `.env`, runs the
migrations against your project, and chains straight into
[Sign-in](./sign-in) targeting the same
project — you shouldn't need to run that step separately afterward.

<details>
<summary>Why DB_URL has to be the Session pooler string</summary>

Postgres connections are expensive so Supabase fronts the database with a
pooler; free-tier direct connections are IPv6-only and most campus/home
networks are IPv4, the pooler works on both. Session mode (port 5432) acts
like plain Postgres, use it for tools (migrations, typegen); Transaction mode
(port 6543) is for serverless and breaks prepared statements (`drizzle-kit`
hangs). Our apps talk to Supabase over HTTP, so `DB_URL` is only for tools:
copy the Session pooler string, nothing else.

</details>

## By hand

If you'd rather not run the wizard, or it fails partway:

1. Copy the four values above into `.env` under the section for your app.
2. Run migrations against your project:
   ```bash
   pnpm devtools db migrate
   ```
3. Configure sign-in — see [Sign-in](./sign-in).
4. Add your local dev URL to the project's allow list: Dashboard →
   Authentication → URL Configuration → Redirect URLs, add
   `http://localhost:<port>/**` (schedule-builder is 3001, platform is 3000).
   Skipping this is the single most common first-run failure — see
   [Redirect URL missing](./troubleshooting#redirect-url-missing).

## Run it

```bash
pnpm dev
```

## Free tier limits

Free Supabase accounts get **2 active projects**, and a project **pauses
after about a week of inactivity** — opening the dashboard or hitting the API
resumes it, but the first request after a pause can be slow or fail. See
[Supabase paused](./troubleshooting#supabase-paused)
if your app suddenly can't reach the database.

> [!WARNING]
> `pnpm devtools db reset` is **local-only** — it erases and replays the
> database it targets. Never run it against a hosted project; there is no
> undo.
