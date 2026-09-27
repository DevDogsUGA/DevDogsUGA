---
name: Windows (native)
description: Running directly on Windows, with no WSL. The default for study-group-finder; schedule-builder and platform recommend WSL2 instead.
order: 32
section: getting-started
mount: [study-group-finder, schedule-builder, platform]
---

# Windows (native)

**study-group-finder runs directly on Windows.** Flutter and the Android
emulator work best natively. schedule-builder and platform recommend
[WSL2](./windows-wsl) instead, but these steps get the toolchain working
natively for them too.

On native Windows, use hosted Supabase ([Supabase, hosted](./supabase-hosted)).
No local Docker path is documented here.

## Allow scripts to run

PowerShell blocks running local scripts by default, including the ones fnm and
pnpm need. From a PowerShell window (not elevated — this is a per-user
setting):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

`RemoteSigned` allows scripts you wrote or downloaded and ran locally, and
still requires a signature for anything downloaded from the internet directly
(like an email attachment) — it's the setting Microsoft recommends for
development machines, not a security opt-out. If you skip this, fnm and pnpm
fail with an "execution policy" or "cannot be loaded" error the first time
they try to run a script — see
[PowerShell execution policy](./troubleshooting#powershell-execution-policy).

## Git for Windows

```powershell
winget install --id Git.Git -e --source winget
```

Installs Git along with Git Bash, which several repo scripts assume is
available as `bash` even on Windows.

## Node, through fnm

```powershell
winget install Schniz.fnm
fnm install
fnm use
```

Then add this line to your PowerShell profile (`$PROFILE` — create the file if
`Test-Path $PROFILE` says it doesn't exist yet):

```powershell
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
```

**Restart your terminal** after adding it — same reason as everywhere else
fnm needs a shell profile line: it does nothing retroactively in the terminal
you edited it from. See
[fnm not found](./troubleshooting#fnm-not-found)
if a new terminal still can't find `node`.

## pnpm

```powershell
npm install -g pnpm
pnpm --version   # 11.8.0
```

Same as every other OS — see the pnpm section of
[Toolchain](./toolchain) for why this
is `npm install -g pnpm` and not `corepack enable`.

## Git line endings

```powershell
git config --global core.autocrlf true
```

This is the Windows-recommended setting, and the one Git for Windows sets up
for you if you accept its installer default — check it wasn't changed rather
than setting it blind. See
[CRLF line endings](./troubleshooting#crlf-line-endings)
for what goes wrong with the other setting.

## Flutter and Android Studio

Install [Flutter](https://docs.flutter.dev/get-started/install/windows) and
[Android Studio](https://developer.android.com/studio) natively, following
Flutter's own Windows install guide, and create an emulator through Android
Studio's Device Manager. `flutter doctor` is Flutter's own environment
checker — run it after both are installed and follow what it flags before
moving on.

## Next

[Supabase, hosted](./supabase-hosted) —
native Windows has no local Docker path, so this is the only database setup
that applies to you.
