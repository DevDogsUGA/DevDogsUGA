---
name: Getting started
description: From a clean machine to a running schedule-builder, in order.
order: 1
section: getting-started
---

# Getting started

Work through these in order. Each one assumes the ones before it are done.

1. **Pick your OS setup.**
   [macOS](/docs/schedule-builder/getting-started/macos) ·
   [Windows (WSL2)](/docs/schedule-builder/getting-started/windows-wsl) ·
   [Linux](/docs/schedule-builder/getting-started/linux)
2. **Toolchain.** Node via fnm, then pnpm — see
   [Toolchain](/docs/schedule-builder/getting-started/toolchain).
3. **Database.** [Supabase, hosted](/docs/schedule-builder/getting-started/supabase-hosted)
   is the default for a first setup; a
   [local Docker stack](/docs/schedule-builder/getting-started/supabase-local)
   is fully supported too.
4. **Sign-in.** Register this app against the platform's OAuth server — see
   [Sign-in](/docs/schedule-builder/getting-started/sign-in).
5. **Run it.** See [Run the app](/docs/schedule-builder/getting-started/run).
6. **Doctor.** `pnpm devtools doctor --app schedule-builder` checks all of the
   above against your actual machine and prints what's still missing.
7. **First contribution.** Walk a real merged change end to end in
   [Your first feature](/docs/schedule-builder/getting-started/first-feature).

Stuck partway through? Check
[Troubleshooting](/docs/schedule-builder/getting-started/troubleshooting) before
asking — it's the same FAQ `doctor` links its own failures to.

> [!TIP]
> Building the **schedule-builder competition**? The brief lives on GitHub, not
> here — see the open
> [competition issues](https://github.com/DevDogsUGA/DevDogsUGA/issues?q=is%3Aissue+label%3Acompetition).
