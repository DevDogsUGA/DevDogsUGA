---
name: Running the project
description: Clone through a running app — install, env, the database, sign-in, and the doctor check that ties it together.
order: 2
section: getting-started
mount: [platform, schedule-builder, study-group-finder]
---

# Running the project

This picks up right after [Prerequisites](./prerequisites) — toolchain, Git,
and (for study-group-finder) Flutter already installed.

## Clone and install

```bash
git clone https://github.com/DevDogsUGA/DevDogsUGA.git
cd DevDogsUGA
fnm install   # reads .nvmrc (pins Node 24)
fnm use
pnpm install
```

Every workspace dependency, including the shared `@devdogsuga/*` packages,
resolves from this one install.

## The database

**A hosted Supabase project — your own, free — is the default way to get a
database for local development.** A local Docker stack is fully supported
too, and some contributors prefer it once they're set up, but hosted needs no
Docker at all and is what these steps walk through first.

:::only{os="windows"}
Native Windows has no local Docker path documented — hosted Supabase is your
only option here.
:::

:::tabs{group="supabase"}
::tab{value="hosted"}
**Create a project.** Go to [supabase.com](https://supabase.com), sign up,
and create a new project (Dashboard → New Project). Pick any region; note
the database password it asks you to set, in case you need it later — day to
day you won't need it, since the setup below uses API keys and a pooler
connection string instead.

**The wizard.**

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
migrations against your project, and chains straight into the sign-in step
below targeting the same project — you shouldn't need to run that step
separately afterward.

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

By hand, if you'd rather not run the wizard or it fails partway:

1. Copy the four values above into `.env` under the section for your app.
2. Run migrations against your project: `pnpm devtools db migrate`.
3. Configure sign-in — see the sign-in section below.
4. Add your local dev URL to the project's allow list: Dashboard →
   Authentication → URL Configuration → Redirect URLs — see the sign-in
   section for the exact URL.

Free Supabase accounts get **2 active projects**, and a project **pauses
after about a week of inactivity** — opening the dashboard or hitting the API
resumes it, but the first request after a pause can be slow or fail. See
[Supabase paused](./troubleshooting#supabase-paused) if your app suddenly
can't reach the database.

> [!WARNING]
> `pnpm devtools db reset` erases and replays whichever database it
> targets, including a hosted project — it is not local-only. Point it at
> the right one before you run it; there is no undo.

::tab{value="local"}
A full Supabase stack in Docker on your own machine, no account or network
needed.

Docker needs to actually be running first:

```bash
docker info   # confirms the daemon is actually reachable
```

If that hangs or errors, see [Docker not running](./troubleshooting#docker-not-running).

```bash
pnpm devtools db start     # boots the Docker containers
pnpm devtools db reset     # migrations, then seeds, then generated types
```

`db reset` erases the database it targets before replaying everything —
that's safe here because it's your own local stack, but the same command
also works (and erases) against a hosted project, so double check which one
you're pointed at before running it elsewhere.

Stop the stack with `pnpm devtools db stop`. `pnpm devtools db restart` is
the stop/start pair, which is how a changed `supabase/config.toml` actually
takes effect — `reset` alone replays migrations into containers still
holding the old config.

Nothing switches between a local stack and a hosted project by flag: the app
probes for a running local stack on every start, and uses it when present,
falling back to whatever hosted project `.env` names otherwise.
:::

## Sign-in

Every DevDogs app authenticates through the same custom OAuth provider,
`custom:devdogsuga`, issued by the platform (production: `api.devdogsuga.org`).
Registering that provider against your Supabase project is one command,
whether your project is local or hosted:

```bash
pnpm devtools oauth
```

Running `pnpm devtools setup` against a hosted project chains into this
automatically. Run it directly when you're setting up a **local** stack
(setup's hosted chaining doesn't apply there), or if you need to redo it —
reconnecting a project, or switching which one a directory targets.

### What it does

The command asks which Supabase project to configure — the local stack
running in this directory, or a hosted one (by URL and service-role key) —
then either opens your browser for a one-click connect against the platform,
or asks for a device code if a browser isn't reachable from where you're
running it (SSH, a container, Codespaces). Either way it writes the resulting
client credentials to `.env.local` and configures the provider on your
project directly — nothing to paste into the Supabase dashboard yourself.

### Redirect URL

After configuring the provider, add your local dev URL to the project's own
allow list if you haven't already — Dashboard → Authentication → URL
Configuration → Redirect URLs, add `http://localhost:<port>/**` (3000 for
platform, 3001 for schedule-builder). Signing in without this configured
fails at the provider's redirect step — see
[Redirect URL missing](./troubleshooting#redirect-url-missing).

:::only{project="study-group-finder"}
study-group-finder is a mobile app, so it has no `localhost` URL to add. Its
return address is a URL scheme instead; see [Mobile sign-in](#mobile-sign-in)
below.
:::

:::only{project="study-group-finder"}

### Mobile sign-in

The app is still a placeholder screen, so nothing in it starts a sign-in
yet. The configuration for one is already in place, and it works like the
web apps' sign-in.

**`AUTH_MODE` picks the provider.** It has two values:

| `AUTH_MODE` | Provider ID         | Used for                                                              |
| ----------- | ------------------- | --------------------------------------------------------------------- |
| `devdogs`   | `custom:devdogsuga` | Development. The platform's own OAuth server, "Sign in with DevDogs". |
| `google`    | `google`            | Production. The shared Google provider.                               |

`devdogs` is the default whenever nothing sets it.

**Where it comes from.** You never pass `AUTH_MODE` yourself. Set
`NEXT_PUBLIC_AUTH_MODE` in the root `.env` (it's commented out in
`.env.example`, shared with the web apps) and `pnpm dev --filter
study-group-finder` hands it to Flutter as `--dart-define=AUTH_MODE=...`,
falling back to `devdogs` when it's unset. `AUTH_MODE` is just the name it
has on the Dart side, where `lib/main.dart` reads it with
`String.fromEnvironment`. It is fixed at compile time, so restart `pnpm dev`
after changing it.

<details>
<summary>Where sign-in returns to</summary>

After the provider, Supabase sends the user
back to `dev.dogpack://login-callback`. `dev.dogpack` is the app's ID on both
platforms, and the return address is registered in three places that have to
agree:

- `apps/study-group-finder/android/app/src/main/AndroidManifest.xml`, an
  intent filter for scheme `dev.dogpack`, host `login-callback`.
- `apps/study-group-finder/ios/Runner/Info.plist`, a `CFBundleURLTypes`
  entry for the scheme `dev.dogpack`.
- `supabase/config.toml`, in `additional_redirect_urls`. A local stack picks
  the change up on `pnpm devtools db restart`. Production receives it
  through the deploy workflow's `supabase config push`.

A hosted project of your own doesn't read `config.toml`, so add
`dev.dogpack://login-callback` to its Redirect URLs by hand (Dashboard →
Authentication → URL Configuration), next to the web URLs. Without it,
sign-in fails at the redirect step like
[Redirect URL missing](./troubleshooting#redirect-url-missing).

</details>

:::

<details>
<summary>Google sign-in</summary>

Production apps sign in through Google, restricted to `hd: uga.edu`, not
through `custom:devdogsuga` — that mode exists for members who aren't
contributors. Setting it up is officer/maintainer work; see the identity
guide under Infrastructure in the platform docs.

</details>

## Run it

:::only{project="platform"}

```bash
pnpm dev --filter platform
```

Serves on **port 3000**.
:::

:::only{project="schedule-builder"}

```bash
pnpm dev --filter schedule-builder
```

`dev` is `with-env next dev` — it reads the shared root `.env` (and
`.env.generated`, when a local Supabase stack is running) before Next.js
starts. Local dev runs on the standard Next.js dev server, not vinext —
builds and deploys still go through `vinext build` / `wrangler dev`. The app
serves on **port 3001** (platform takes 3000, so both can run together).

This app has no user store of its own — it authenticates against the
platform's OAuth server in development, restricted to `hd: uga.edu` Google in
production. Browsing signed out works fine without sign-in configured; a
visitor's drafts live in `localStorage` until they sign in.

A fresh database has no courses, so there is nothing for the generator to
plan against yet. Trigger the registrar scrape through devtools — it starts
a temporary local Wrangler session (the Workflow runtime `next dev` doesn't
provide on its own), runs the scrape against your database, and waits for it
to finish:

```bash
pnpm devtools workflows run --app schedule-builder --tier development
```

This can take a while on a first run — it pulls every available term.
:::

:::only{project="study-group-finder"}

```bash
pnpm dev --filter study-group-finder
```

Do not call `flutter run` directly. The app reads its Supabase configuration
from compile-time `--dart-define` values, and the package script is what
supplies them — running `flutter run` bare leaves those defines empty, so
`Supabase.initialize` gets blank credentials. Pick your emulator (or a
connected device) when Flutter asks.

This needs the Flutter SDK on your `PATH` (see [Prerequisites](./prerequisites)).
It uses your local Supabase stack if one is running, and the hosted project
`.env` names otherwise.
:::

Going through `pnpm dev --filter <app>` (the `devtools run` picker) rather
than `pnpm --filter <app> dev` directly also builds that app's workspace
dependencies first.

## Test logins

To see the app as an ordinary member or moderator instead of as yourself:

```bash
pnpm devtools persona member
pnpm devtools persona moderator
```

Each creates a login with a random password (printed once) against your
current development project, local or hosted; `moderator` also optionally
files a sample report so the moderation queue isn't empty. `pnpm devtools
persona --clean` removes them again.

The seeds give the officers' roles, President included, to the officers' own
accounts, not yours. `pnpm devtools grant-root` moves President to your
account, and after that you hold every permission on your instance, which is
why a persona is the only way to see what everyone else sees.

## Doctor

```bash
pnpm devtools doctor
```

Run this whenever something isn't working and you're not sure which step is
the problem, or as the last step of setup itself, before you go looking for
help. It re-checks everything above against your machine as it is right
now — Node and pnpm versions, Docker or Flutter if your app needs them,
whether `.env` has everything your app's schema declares, and whether the
Supabase project it points at is actually reachable — not as the docs assume
it is.

Each check that fails links straight to the matching entry in
[Troubleshooting](./troubleshooting), by the same anchor IDs used throughout
these pages, so you land on the cause and the fix instead of a bare error.

```bash
pnpm devtools doctor --report
```

`--report` prints the same checks as a block of text meant to be pasted
somewhere else — into `#help` on [Discord](https://devdogsuga.org/discord),
or into an issue. It redacts anything that looks like a credential before
printing, so it's safe to paste without editing it yourself first. Run the
plain form first; reach for `--report` once you've read what it says and
still need another person to look at it.
