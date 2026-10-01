---
name: Troubleshooting
description: The FAQ doctor and every setup page link into — organized by symptom, each with what's actually wrong and the fix.
order: 4
section: getting-started
mount: [schedule-builder, study-group-finder, platform]
---

# Troubleshooting

Organized by what you're actually seeing, not by which tool is at fault —
`pnpm devtools doctor` links its own failures straight to the matching
heading here. Each entry is symptom, cause, fix.

<details>
<summary>Why these headings matter</summary>

Every heading below is written so its auto-generated anchor ID is exactly the
ID `pnpm devtools doctor` and the other getting-started pages link to
(`#node-version`, `#supabase-paused`, and so on) — the renderer slugs heading
text the same way GitHub does, so changing a heading's wording can silently
change its anchor and break every link into it. If you edit a heading here,
check that its link still resolves.

</details>

## Node and pnpm

### Node version

**Symptom:** `pnpm install` fails immediately, or with an error mentioning
`node:sqlite`.

**Cause:** Node is older than 22.12 — pnpm 11 needs `node:sqlite`, stable only
from there.

**Fix:** Install through fnm and let `.nvmrc` pin the version — see
[Prerequisites](./prerequisites#node-through-fnm).
`node --version` should read 24.x.

### fnm not found

**Symptom:** A brand new terminal says `node: command not found`, though it
worked a minute ago in a different window.

**Cause:** The `fnm env --use-on-cd` profile line only affects terminals
opened _after_ you added it — nothing retroactive.

**Fix:** Confirm it's actually in your profile
(`~/.bashrc`/`~/.zshrc`, or PowerShell's `$PROFILE`), then open a genuinely
new terminal, not just a new tab in an app that reuses the old shell session.

### pnpm missing

**Symptom:** `pnpm: command not found` right after `npm install -g pnpm`.

**Cause:** npm's global bin directory usually isn't on `PATH` by default.

**Fix:** Run `npm config get prefix`, put `<that path>/bin` (or, on Windows,
that path itself) on your `PATH`, and restart your terminal.

### pnpm version

**Symptom:** `pnpm --version` reports something other than `11.8.0`.

**Cause:** Either the global pnpm is too old to read the repo's
`packageManager` pin, or you're running the command outside the repo, where
the pin doesn't apply.

**Fix:** Reinstall a current pnpm (`npm install -g pnpm`) and re-check from
the repo root. Never `corepack enable` here — it and the self-switching pin
can disagree about which pnpm wins.

## Windows

### PowerShell execution policy

**Symptom:** Running `fnm`, `pnpm`, or almost any script prints something
like "cannot be loaded because running scripts is disabled on this system."

**Cause:** PowerShell's default policy blocks local scripts entirely.

**Fix:**

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

See [Prerequisites](./prerequisites#os-setup).

### CRLF line endings

**Symptom:** A shell script or SQL file that works for everyone else fails
with a cryptic parse error, or `git diff` shows every line in an untouched
file as changed.

**Cause:** Git converted the file's line endings to Windows-style (`CRLF`) on
checkout, and a shell interpreter or `psql` chokes on the extra `\r`.

**Fix:** Set `core.autocrlf` correctly — `true` on native Windows, `input` on
WSL2/Linux/macOS — then re-checkout the affected files:

```bash
git config --global core.autocrlf true   # or input — see Prerequisites
git rm --cached -r . && git reset --hard
```

## WSL2 and Flutter

### Repo under mnt-c

**Symptom:** `pnpm install`, `next dev`, or your editor's file-watching feels
dramatically slower on WSL2 than for other contributors.

**Cause:** The repo is cloned under `/mnt/c/...` — Windows's C: drive, reached
through a filesystem translation layer much slower for many small files than
a real Linux filesystem.

**Fix:** Clone under your Linux home instead (`~/DevDogsUGA`, not
`/mnt/c/Users/you/DevDogsUGA`). This is about which filesystem the files live
on — there's no config fix.

### Docker not running

**Symptom:** `docker info` hangs or errors, or `pnpm devtools db start` can't
reach the daemon. On macOS, Docker Desktop may show "Docker Desktop failed to
initialize backend" instead of starting.

**Cause:** Docker isn't running, or (macOS) Docker Desktop's virtualization
backend failed — often after a macOS update or low disk space.

**Fix:** WSL2/Linux: `sudo systemctl start docker`, or `sudo systemctl status
docker` for why it won't. macOS: quit Docker Desktop, check disk space, and
restart it. Never Colima.

### Flutter missing

**Symptom:** `pnpm -F study-group-finder dev` fails immediately, or
`pnpm devtools setup` reports Flutter as not found.

**Cause:** The Flutter SDK isn't installed or isn't on `PATH`. Only matters
for study-group-finder — every other check treats a missing Flutter as
informational.

**Fix:** Install the [Flutter SDK](https://docs.flutter.dev/get-started/install)
and run `flutter doctor` — more thorough than anything here for
Flutter/Android specifics.

### adb no devices

**Symptom:** `flutter run` reports no connected devices, or the emulator
(running on Windows) never shows up from WSL2.

**Cause:** Most often, two `adb` servers — one started by Windows, one by
WSL2 — fighting over the same port.

**Fix:** From a Windows terminal, `adb kill-server`, then let WSL2 start its
own. Without Windows 11's mirrored networking mode
(`networkingMode=mirrored` in `.wslconfig`), the emulator and WSL2 can't
reach each other at all.

:::only{project="study-group-finder"}
See [Prerequisites](./prerequisites#running-the-sdk-inside-wsl2-against-an-emulator-on-windows)
for the full setup.
:::

## Environment and Supabase

### Env incomplete

**Symptom:** The app throws at startup naming a missing environment variable,
rather than a blank page or a later runtime crash.

**Cause:** `.env` is missing a value your app's schema (`src/env.ts`/`env.ts`)
declares as required — validated at import time on purpose, so a broken env
fails loudly and immediately.

**Fix:** Re-run `pnpm devtools env init` to append newly declared keys, or
revisit [Running the project](./running#the-database).
`pnpm devtools doctor` reports exactly which keys are missing.

### Supabase unreachable

**Symptom:** Every request to Supabase times out or refuses to connect, for
both the app and `pnpm devtools`.

**Cause:** Usually one of: the local stack isn't running
(`pnpm devtools db start`), the hosted project's URL in `.env` is wrong, or
the project is paused — see [Supabase paused](#supabase-paused).

**Fix:** `pnpm devtools doctor` checks reachability directly and names which
of these it is, rather than leaving you to guess from a generic error.

### Supabase keys invalid

**Symptom:** Requests reach Supabase but come back `401`/`403`, rather than
timing out.

**Cause:** The publishable or secret key in `.env` doesn't match the project
`API_URL` points at — often from copying keys from a different project, or a
rotated key `.env` never got updated with.

**Fix:** Re-copy API URL, publishable key, and secret key from the _same_
project's dashboard (Settings → API) in one pass, not one value at a time.

### Supabase paused

**Symptom:** A hosted project that worked yesterday can't be reached at all.

**Cause:** Free-tier Supabase projects pause after about a week of
inactivity.

**Fix:** Open the project in the [Supabase dashboard](https://supabase.com/dashboard) —
that's what resumes it. The first request or two afterward can still be slow
or fail once.

### DB URL: direct connection

**Symptom:** `pnpm devtools db migrate`/`db types` (or anything using
`DB_URL`) can't connect, and the connection string doesn't mention "pooler."

**Cause:** `DB_URL` is set to the project's **direct** connection string,
IPv6-only on the free tier — most campus/home networks are IPv4-only and
can't reach it.

**Fix:** Use the **Session pooler** string instead (Settings → Database →
Connection string → Session pooler, port 5432) — see
[Running the project](./running#the-database).

### DB URL: transaction pooler

**Symptom:** `drizzle-kit` (migrations, introspection) hangs indefinitely
rather than erroring.

**Cause:** `DB_URL` is set to the **Transaction** pooler (port 6543), which
doesn't support the prepared statements `drizzle-kit` relies on.

**Fix:** Use the **Session** pooler string instead (port 5432) — same fix as
[direct connection](#db-url-direct-connection), different wrong value.

### DB URL: connect failed

**Symptom:** `pnpm devtools db connect <project-ref>` fails outright.

**Cause:** Usually a wrong or missing project ref, or the Supabase CLI isn't
authenticated (`supabase login`) yet.

**Fix:** Confirm the ref from the dashboard's URL
(`app.supabase.com/project/<this part>`), and that `supabase projects list`
shows the project. This command is optional day to day — the wizard and
`db migrate`/`db types` don't need it.

## Sign-in

### OAuth provider missing

**Symptom:** Signing in redirects to an error page naming an unknown or
unconfigured provider, rather than reaching DevDogs's login screen.

**Cause:** `pnpm devtools oauth` was never run against this project, or was
run against a different one than the app currently points at.

**Fix:** Run [`pnpm devtools oauth`](./running#sign-in)
against the project your `.env` points at.

### Redirect URL missing

**Symptom:** Sign-in reaches the provider, then fails at the redirect back
to the app — often a generic "redirect_uri not allowed" error.

**Cause:** The project's Authentication → URL Configuration → Redirect URLs
list doesn't include your local dev URL.

**Fix:** Add `http://localhost:<port>/**` there (3001 for schedule-builder,
3000 for platform) — see
[Running the project](./running#redirect-url).

## Setup night

### Homebrew missing

**Symptom:** `brew: command not found` right after running the installer.

**Cause:** The installer prints `export PATH` lines you need to run
yourself — it doesn't always update your shell for you.

**Fix:** Run the `export` lines from the installer's own output, or open a
new terminal — most current macOS setups pick it up there.

### Install fails partway through

**Symptom:** `pnpm install` dies partway with an error from a native module
trying to compile.

**Cause:** macOS: almost always missing Xcode command line tools. Any OS:
occasionally a stale `node_modules` from a different Node version.

**Fix:** macOS: `xcode-select --install`, then retry. Anywhere: delete
`node_modules` at the repo root and retry a plain `pnpm install`.
