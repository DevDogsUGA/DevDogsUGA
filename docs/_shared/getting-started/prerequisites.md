---
name: Prerequisites
description: Everything to install before you start — OS setup, Git and GitHub, an editor, the Node toolchain, Docker, and Flutter.
order: 1
section: getting-started
mount: [platform, schedule-builder, study-group-finder, workshops]
---

# Prerequisites

:::only{project="platform schedule-builder study-group-finder"}
Everything here happens before you clone the repo. [Running the project](./running)
picks up from the clone.
:::

:::only{project="workshops"}
Install these before your first workshop. Everyone needs the first section;
after that, you only need the section for your track.

- [For everyone](#for-everyone): OS setup, Git and GitHub, and VS Code
- [For the Next.js track](#for-the-nextjs-track): Node and pnpm
- [For the Flutter track](#for-the-flutter-track): the Flutter SDK and an emulator

> [!NOTE]
> This is the workshop subset. Contributing to the monorepo's projects (DogDays,
> DogPack, the platform) also needs Docker for the local database, Git
> line-ending settings, and a few other things: follow the full
> [Prerequisites](/docs/schedule-builder/getting-started/prerequisites) in that
> project's docs instead.

## For everyone

:::

:::only{project="workshops"}

### OS setup

:::

:::only{project="platform schedule-builder study-group-finder"}

## OS setup

:::

:::tabs{group="os"}
::tab{value="macos"}
Install the Xcode command line tools — several native modules in the
dependency tree compile on install and need them:

```bash
xcode-select --install
```

If they're already installed, this prints a message saying so instead of a
progress bar. That's success, not an error.

Then install Homebrew:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

The installer prints one or two `export PATH` lines at the end. Run those, or
open a new terminal, before continuing. The steps below install fnm and
(optionally) Docker Desktop through it.

::tab{value="linux"}
Install build tools through your distro's package manager. On Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl git
```

Several native modules in the dependency tree compile on install and need a
C toolchain.

::tab{value="wsl"}
Install WSL2 first, from an elevated PowerShell:

```powershell
wsl --install
```

This installs Ubuntu by default, which is what we test against — don't swap
in a different distro. Restart when it asks you to, then open "Ubuntu" from
the Start menu to finish the first-run account setup.

A WSL2 Ubuntu distro is a real Linux machine from here on: build tools,
Docker, and everything else below follow the Linux steps.

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl git
```

::tab{value="windows"}
Allow local scripts to run. PowerShell blocks them by default, including the
ones fnm and pnpm need. From a PowerShell window (not elevated — this is a
per-user setting):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

`RemoteSigned` allows scripts you wrote or downloaded and ran locally, and
still requires a signature for anything downloaded from the internet directly
(like an email attachment). It's the setting Microsoft recommends for
development machines, not a security opt-out. Skipping this makes fnm and
pnpm fail with an "execution policy" or "cannot be loaded" error the first
time they try to run a script.

Install Git for Windows, which brings Git Bash along — several repo scripts
assume `bash` is available even on Windows:

```powershell
winget install --id Git.Git -e --source winget
```

:::

:::only{project="workshops"}

### Git and a GitHub account

:::

:::only{project="platform schedule-builder study-group-finder"}

## Git and a GitHub account

:::

You need Git (installed above) and a [GitHub account](https://github.com/join).
Fork the repository if you don't have push access, and set up how you
authenticate to GitHub over the command line — SSH keys or
[`gh auth login`](https://cli.github.com/) both work; pick whichever you
already use.

Tell Git who you are, once per machine. Every commit records it, and
`git commit` refuses to run without it:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Use the email on your GitHub account, so GitHub links your commits to you.

<details>
<summary>Why?</summary>

Cloning, pushing branches, and opening pull requests all go through Git and
GitHub — nothing about this repo's workflow is unusual there.

</details>

:::only{project="workshops"}

### Editor

:::

:::only{project="platform schedule-builder study-group-finder"}

## Editor

:::

:::only{project="workshops"}
Install [VS Code](https://code.visualstudio.com/). The workshops use it
throughout: the Flutter track installs its SDK through VS Code's Flutter
extension, and each step's **Review in VS Code** button opens that step's
changes in it.
:::

:::only{project="platform schedule-builder study-group-finder"}
Nothing here is required, but VS Code is what the docs assume.
:::

If you use VS Code on WSL2, install the
[WSL extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-wsl)
and open the repo with `code .` from inside the Ubuntu terminal, not from
Windows. This runs the editor's server inside WSL, next to your files, which
is what makes IntelliSense and the terminal agree with each other.

:::only{project="workshops"}

## For the Next.js track

Node runs Next.js, and pnpm installs its packages.
:::

:::only{project="workshops"}

### Node, through fnm

:::

:::only{project="platform schedule-builder study-group-finder"}

## Node, through fnm

:::

We use [fnm](https://github.com/Schniz/fnm) rather than nvm or a system
package: it reads `.nvmrc` and switches automatically when you `cd` into a
repo, and it's a single native binary with no shell-startup cost worth
noticing.

```bash os=macos
brew install fnm
```

```bash os="linux wsl"
curl -fsSL https://fnm.vercel.app/install | bash
```

```powershell os=windows
winget install Schniz.fnm
```

fnm has to run on every new shell, not just once. Add this to your shell
profile (`~/.bashrc`, `~/.zshrc`, or the PowerShell profile on native
Windows):

```bash os="macos linux wsl"
eval "$(fnm env --use-on-cd)"
```

```powershell os=windows
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
```

:::only{os="windows"}
The PowerShell profile is the file at `$PROFILE`. Create it if
`Test-Path $PROFILE` says it doesn't exist yet.
:::

**Open a new terminal after adding this line** — it does nothing
retroactively in the one you edited it from. Without it, a fresh terminal
falls back to whatever Node your system has (or none), and `pnpm` fails with
a confusing error instead of a clear "Node not found."
:::only{project="platform schedule-builder study-group-finder"}
See [fnm not found](./troubleshooting#fnm-not-found) if that still isn't
happening.
:::

:::only{project="platform schedule-builder study-group-finder"}
For now, install any recent Node so `npm` can install pnpm below:
:::

:::only{project="workshops"}
Install the current long-term-support Node:
:::

```bash
fnm install --lts
```

:::only{project="platform schedule-builder study-group-finder"}
After cloning, [Running the project](./running) switches you to the exact
version the repo pins; fnm reads it from `.nvmrc`, so there's nothing to pick.

`.nvmrc` pins **24**. The repo's actual floor is **22.12** — pnpm 11 needs
`node:sqlite`, stable there — so 24 is the version everyone should be on, not
the minimum that happens to work.
:::

:::only{project="workshops"}

### pnpm

:::

:::only{project="platform schedule-builder study-group-finder"}

## pnpm

:::

```bash
npm install -g pnpm
```

Don't run `corepack enable`. Each repo pins an exact version
(`packageManager` in its root `package.json`), and a globally-installed pnpm
reads that pin and re-execs itself as the pinned version the first time it
runs in the repo — no separate activation step, nothing to remember to re-run
after a pin bump.

::::only{project="platform schedule-builder study-group-finder"}

## Git line endings

Only matters if your editor or shell touches this repo from Windows,
including WSL2, if you edit the files from a Windows-side tool. Git's default
line-ending conversion silently rewrites files on checkout, and a `.sh` or
`.sql` file with CRLF endings can fail in ways that look unrelated to line
endings at all.

```bash os="macos linux wsl"
git config --global core.autocrlf input
```

```powershell os=windows
git config --global core.autocrlf true
```

Native Windows uses `true` instead of `input` — it's the setting Git for
Windows recommends and matches how most Windows tooling expects text files
to look on disk.

## Docker, for the local Supabase option

Hosted Supabase is the default database for local development and needs no
Docker at all — see [Running the project](./running). Docker only matters if
you want the local stack instead.

:::tabs{group="os"}
::tab{value="macos"}
Install Docker Desktop, then open it once so the daemon starts:

```bash
brew install --cask docker
```

Don't use Colima; the Supabase CLI doesn't work reliably against it.

::tab{value="linux wsl"}
Docker Engine, installed directly inside the distro — never Docker Desktop:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and back in (or run `newgrp docker`) for the group membership to
take effect.

::tab{value="windows"}
Not available. There's no local Docker path documented for native Windows —
use hosted Supabase.
:::
::::

::::only{project="study-group-finder workshops"}

:::only{project="workshops"}

## For the Flutter track

:::

:::only{project="study-group-finder"}

## Flutter and Android tooling

study-group-finder targets **Android and iOS only** — there is no `web/`
runner directory, and no `flutter build web` path is documented for it. You
need the Flutter SDK on `PATH` (`pubspec.yaml` pins the Dart SDK to
`^3.5.0`) plus an emulator to run against. Nothing else in the monorepo needs
Flutter, so a contributor without it is never blocked on the rest of the repo.
:::

:::only{project="workshops"}
The Flutter track needs the Flutter SDK on `PATH` and an emulator to run the
app on. You don't need Node or pnpm for it.
:::

:::tabs{group="os"}
::tab{value="windows macos"}

The VS Code Flutter extension downloads the SDK and puts it on `PATH` for you.

1. In VS Code, open the **Extensions** view, then search for and install
   **Flutter** (it installs the Dart extension too).
2. Open the Command Palette (**Ctrl+Shift+P** on Windows, **Cmd+Shift+P** on
   macOS), type `flutter`, and choose **Flutter: New Project**.
3. When it says it can't find a Flutter SDK, choose **Download SDK** and pick
   your user folder (`C:\Users\<you>` on Windows, your home folder on
   macOS). Avoid folders that need admin rights, like Program Files.
4. When it offers to **Add SDK to PATH**, accept. Once the download finishes
   you can cancel the new project (**Esc**): the SDK is what you wanted.
5. Open the Command Palette again and run **Developer: Reload Window**, so VS
   Code picks up the new `PATH`.
6. Install [Android Studio](https://developer.android.com/studio) and run its
   setup wizard, which installs the Android SDK. Then open **More Actions →
   Virtual Device Manager**, create a device (any recent Pixel works), and
   start it.
7. In a new terminal, run `flutter doctor` and resolve anything it flags.
   Missing Android licenses are the usual one: `flutter doctor --android-licenses`.

On macOS, to build for iOS as well, install Xcode from the App Store, then
`xcode-select --install` for the command-line tools. `open -a Simulator` boots
the iOS Simulator; `flutter devices` should list it once Xcode is set up.

<details>
<summary>Installing the SDK without VS Code</summary>

On macOS, `brew install --cask flutter`. On either system, Flutter's own
[install guide](https://docs.flutter.dev/get-started/install) walks through
the manual download and adding it to `PATH`. Android Studio and the emulator
are the same as step 6 above.

</details>

::tab{value="linux wsl"}
Flutter on Linux builds for Android only (no iOS toolchain). Follow
[Flutter's Linux install guide](https://docs.flutter.dev/get-started/install/linux),
install Android Studio for the SDK and an emulator, and run `flutter doctor`.
:::

### Running the SDK inside WSL2 against an emulator on Windows

<details>
<summary>Flutter under WSL2, instead of native Windows</summary>

The repo itself lives happily in WSL2. Flutter and the Dart SDK run inside
the distro; Android Studio and the emulator itself still run on Windows,
because WSL2 has no GPU-accelerated emulator of its own. That split needs
two things to line up, and they're the reason WSL2 and native Windows stay
distinct rather than sharing one setup:

1. **Windows 11 with mirrored networking.** Add to
   `%UserProfile%\.wslconfig` on the Windows side:

   ```ini
   [wsl2]
   networkingMode=mirrored
   ```

   Restart WSL (`wsl --shutdown` from PowerShell) after editing it. Without
   mirrored networking, the Linux-side `flutter run` cannot reach `adb` on
   Windows over `localhost`.

2. **Only one `adb` server.** Both Windows and WSL2 ship their own `adb`,
   and two servers fighting for the same emulator is the most common
   failure mode here. Before starting `flutter run` from WSL2, kill any
   Windows-side `adb` server first:

   ```powershell
   adb kill-server
   ```

   Then let WSL2's own `adb` (bundled with the Android SDK you install
   inside the distro, or the SDK you point `ANDROID_SDK_ROOT` at) start
   fresh and connect to the emulator Windows is running.

With hosted Supabase (the default), the emulator reaches `*.supabase.co`
over the network like any other HTTPS endpoint, whichever side runs the
emulator. Only the local Docker stack needs the Android emulator's special
host alias (`10.0.2.2` in place of `localhost`) to reach the machine's own
Supabase containers — and the local stack isn't documented for native
Windows at all, so this only comes up if you're also on WSL2 for the
database.

:::only{project="study-group-finder"}
See [adb no devices](./troubleshooting#adb-no-devices) if `flutter run`
reports no connected devices.
:::

</details>

:::only{project="study-group-finder"}

### Verify

```bash
flutter doctor
```

Resolve anything it reports before moving on. `pnpm devtools doctor` (see
[Running the project](./running)) checks the rest of the toolchain but does
not replace `flutter doctor` — Flutter's own prerequisites are Flutter's to
check.
:::

::::

:::only{project="workshops"}

## Next

Head back to the workshop you came from, or start at the beginning:
[Intro to Next.js](/docs/workshops/framework-intros/nextjs/setup) or
[Intro to Flutter](/docs/workshops/framework-intros/flutter/setup).
:::

:::only{project="platform schedule-builder study-group-finder"}

## Next

[Running the project](./running) — clone, install, database, sign-in, and
starting the app.
:::
