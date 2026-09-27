---
name: Supabase, local
description: The Docker-based Supabase stack — for macOS, WSL2, and Linux. Not available on native Windows.
order: 41
section: getting-started
mount: [schedule-builder, platform, study-group-finder]
---

# Supabase, local

A full Supabase stack in Docker on your own machine, no account or network
needed. [Hosted Supabase](./supabase-hosted)
is the default for a first setup, but this is fully supported, and some
contributors prefer it once they're set up.

**Not available on native Windows.** There's no local Docker path documented
for it — if you're on study-group-finder's native Windows setup, use
[hosted Supabase](./supabase-hosted)
instead. WSL2, Linux, and macOS all use the steps below.

## Docker

Docker needs to actually be running before any of this works:

- **WSL2 or Linux** — Docker Engine, installed directly inside the distro
  (see [Windows (WSL2)](./windows-wsl) or
  [Linux](./linux)). Never Docker
  Desktop here.
- **macOS** — Docker Desktop, or [OrbStack](https://orbstack.dev). Never
  Colima. OrbStack needs `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock`
  set for the Supabase CLI to find it — see
  [macOS](./macos).

```bash
docker info   # confirms the daemon is actually reachable
```

If that hangs or errors, see
[Docker not running](./troubleshooting#docker-not-running).

## Start the stack

```bash
pnpm devtools db start     # boots the Docker containers
pnpm devtools db reset     # migrations, then seeds, then generated types
```

`db reset` is what makes this different from a hosted project: it's
**local-only**, and it erases the database it targets before replaying
everything. Never run it against a hosted project — see
[Supabase, hosted](./supabase-hosted) for
that path instead.

Stop it with `pnpm devtools db stop`. `pnpm devtools db restart` is the
stop/start pair, which is how a changed `supabase/config.toml` actually takes
effect — `reset` alone replays migrations into containers still holding the
old config.

## Then sign in and run

```bash
pnpm devtools oauth     # see Sign-in
pnpm dev
```

Nothing switches between a local stack and a hosted project by flag: the app
probes for a running local stack on every start, and uses it when present,
falling back to whatever hosted project `.env` names otherwise.
