---
name: Toolchain
description: Node through fnm, pnpm, and the git config that keeps Windows from rewriting line endings.
order: 20
section: getting-started
mount: [schedule-builder, study-group-finder, platform]
---

# Toolchain

Node and pnpm, the same way on every OS. If you're on Windows, do this from
inside WSL2 if you're on schedule-builder or platform, or natively if you're on
study-group-finder — see [Windows (WSL2)](./windows-wsl)
or [Windows (native)](./windows-native)
first, then come back here.

## Node, through fnm

We use [fnm](https://github.com/Schniz/fnm) rather than nvm or a system
package: it reads `.nvmrc` and switches automatically when you `cd` into the
repo, and it's a single native binary with no shell-startup cost worth
noticing.

```bash
curl -fsSL https://fnm.vm.dev/install | bash   # macOS/Linux/WSL
fnm install                                     # reads .nvmrc (pins Node 24)
fnm use
node --version
```

`.nvmrc` pins **24**. The repo's actual floor is **22.12** — pnpm 11 needs
`node:sqlite`, stable there — so 24 is the version everyone should be on, not
the minimum that happens to work.

fnm has to run on every new shell, not just once. Add this to your shell
profile (`~/.bashrc`, `~/.zshrc`, or the PowerShell profile on native Windows):

```bash
eval "$(fnm env --use-on-cd)"
```

Without it, a fresh terminal falls back to whatever Node your system has (or
none), and `pnpm` fails with a confusing error instead of a clear "Node not
found." **Open a new terminal after adding this line** — it does nothing
retroactively in the one you edited it from. See
[fnm not found](./troubleshooting#fnm-not-found)
if that still isn't happening.

## pnpm

```bash
npm install -g pnpm
```

Don't use `corepack enable`. The repo pins an exact version
(`packageManager: "pnpm@11.8.0"` in the root `package.json`), and a
globally-installed pnpm reads that pin and re-execs itself as the pinned
version the first time it runs in the repo — no separate activation step,
nothing to remember to re-run after a pin bump. Run any pnpm command from the
repo root once to confirm it happened:

```bash
pnpm --version   # 11.8.0
```

If this prints a different major version, see
[pnpm version](./troubleshooting#pnpm-version).

## Git line endings

Only matters if your editor or shell touches this repo from Windows —
including WSL2, if you edit the files from a Windows-side tool. Git's default
line-ending conversion silently rewrites files on checkout, and a `.sh` or
`.sql` file with CRLF endings can fail in ways that look unrelated to line
endings at all.

```bash
git config --global core.autocrlf input   # WSL2, Linux, macOS
```

On native Windows (study-group-finder's path), use `true` instead — it's the
setting Git for Windows recommends and matches how most Windows tooling
expects text files to look on disk.

```powershell
git config --global core.autocrlf true
```

See [CRLF line endings](./troubleshooting#crlf-line-endings)
if you're hitting this after the fact, on a repo already cloned with the wrong
setting.
