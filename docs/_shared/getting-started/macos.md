---
name: macOS
description: Homebrew and Xcode's command line tools first, then the same fnm/pnpm toolchain as everyone else.
order: 30
section: getting-started
mount: [schedule-builder, study-group-finder, platform]
---

# macOS

Two things macOS needs before the toolchain, then the same steps as everyone
else.

## Xcode command line tools

Several native modules in the dependency tree compile on install and need
these:

```bash
xcode-select --install
```

If they're already installed, this prints a message saying so instead of a
progress bar — that's success, not an error.

## Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

The installer prints one or two `export PATH` lines at the end — **run
those**, or open a new terminal, before continuing. Homebrew is how you'll
install Docker Desktop or OrbStack for the local Supabase stack (see
[Supabase, local](./supabase-local));
nothing in the toolchain step below needs it directly, but git config, curl,
and most of what comes after assumes it's there. If `brew` isn't found after
installing, see
[Homebrew missing](./troubleshooting#homebrew-missing).

## Toolchain

Now follow [Toolchain](./toolchain) for
fnm, Node, and pnpm. Nothing there is macOS-specific.

## Docker

If you're setting up the local Supabase stack rather than a hosted project,
macOS's options are Docker Desktop or [OrbStack](https://orbstack.dev) — never
Colima. OrbStack needs one extra environment variable for the Supabase CLI to
find its socket:

```bash
export DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock
```

Add that to your shell profile too, the same way as the fnm line above. See
[Supabase, local](./supabase-local) for
the rest of the Docker setup, and
[Docker not running](./troubleshooting#docker-not-running)
if the stack won't start.

## Next

[Supabase, hosted](./supabase-hosted) if
this is your first setup, or
[Supabase, local](./supabase-local) if
you already know you want the Docker stack.
