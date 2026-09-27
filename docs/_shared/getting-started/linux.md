---
name: Linux
description: Linux and WSL2 share the same setup from here — fnm, pnpm, and Docker Engine, no Docker Desktop.
order: 33
section: getting-started
mount: [schedule-builder, study-group-finder, platform]
---

# Linux

This page is also where [Windows (WSL2)](./windows-wsl)
sends you — a WSL2 Ubuntu distro is a real Linux machine, so everything below
applies there too.

## Toolchain

Follow [Toolchain](./toolchain) for fnm,
Node, and pnpm. Nothing on this page duplicates it.

## Docker, for the local Supabase stack

If you're setting up the local stack rather than a hosted project (see
[Supabase, local](./supabase-local)),
install Docker Engine through your distro's own instructions — Ubuntu/Debian:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and back in (or `newgrp docker`) for the group membership to take
effect. There's no Docker Desktop recommendation here — Engine alone is
everything the Supabase CLI needs, and it's one fewer background service.

## Next

[Supabase, hosted](./supabase-hosted) for
a first setup, or [Supabase, local](./supabase-local)
for the Docker stack directly.
