---
name: Getting started
description: From a clean machine to a running platform, then the path to entering a feature competition.
order: 1
section: getting-started
---

# Getting started

Work through these in order. Each one assumes the ones before it are done.

1. **Pick your OS setup.** `apps/platform` runs on WSL2 on Windows, the same
   as schedule-builder — see
   [macOS](/docs/platform/getting-started/macos) ·
   [Windows (WSL2)](/docs/platform/getting-started/windows-wsl) ·
   [Linux](/docs/platform/getting-started/linux).
2. **Toolchain.** Node via fnm, then pnpm — see
   [Toolchain](/docs/platform/getting-started/toolchain).
3. **Database.** [Supabase, hosted](/docs/platform/getting-started/supabase-hosted)
   is the default for a first setup; a
   [local Docker stack](/docs/platform/getting-started/supabase-local) is
   fully supported too.
4. **Clone and install.**

   ```bash
   git clone https://github.com/DevDogsUGA/DevDogsUGA.git
   cd DevDogsUGA
   npm install -g pnpm
   pnpm install
   ```

   Every workspace dependency, including the shared `@devdogsuga/*` packages,
   resolves from this one install.

5. **Run it.** `pnpm dev --filter platform` serves on port 3000. Signing in
   locally uses your own Supabase project's Google provider — see
   [Identity](/docs/platform/guides/identity) if you are setting that up
   yourself rather than using a project seeded for you.
6. **Doctor.** `pnpm devtools doctor` checks your environment against all of
   the above and prints what's still missing. Add `--report` for a redacted
   diagnostic you can paste in Discord if you're still stuck.

Stuck partway through? Check
[Troubleshooting](/docs/platform/getting-started/troubleshooting) before
asking.

## Entering a feature competition

Building the platform itself is one path; entering a **feature competition**
against it as a member is a different, shorter one that does not need any of
the above unless the competition brief says so. The steps are: sign in at
[devdogsuga.org](https://devdogsuga.org), link your GitHub account, turn on
GitHub two-factor authentication, get on a team, then clone, push to your
team's branch, and open the entry pull request. That path — and the two
things worth getting right early, the 2FA gate and which branch you can push
to — is [Entering a competition](/docs/platform/getting-started/competition-entry).

Competition briefs themselves are GitHub issues, not docs pages — see the open
[competition issues](https://github.com/DevDogsUGA/DevDogsUGA/issues?q=is%3Aissue+label%3Acompetition).
