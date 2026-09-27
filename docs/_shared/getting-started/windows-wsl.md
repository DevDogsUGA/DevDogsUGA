---
name: Windows (WSL2)
description: The recommended path for schedule-builder and platform on Windows — WSL2, Ubuntu, and Linux-side Docker.
order: 31
section: getting-started
mount: [schedule-builder, platform, study-group-finder]
---

# Windows (WSL2)

**schedule-builder and platform on Windows means WSL2.** Everything from here
on treats you as a Linux machine — see
[Linux](./linux) once WSL2 itself is set
up. (study-group-finder's recommended Windows path is
[native Windows](./windows-native)
instead; WSL2 is a documented alternative for it too, with one extra step —
see the end of this page.)

## Install WSL2

Follow Microsoft's own instructions:
[Install WSL](https://learn.microsoft.com/en-us/windows/wsl/install). The short
version, from an elevated PowerShell:

```powershell
wsl --install
```

This installs Ubuntu by default, which is what we test against — don't swap in
a different distro. Restart when it asks you to, then open "Ubuntu" from the
Start menu to finish the first-run account setup.

## Clone into your Linux home, never /mnt/c

```bash
cd ~
git clone https://github.com/DevDogsUGA/DevDogsUGA.git
```

**Do not clone into `/mnt/c/...`.** That path is Windows's C: drive, mounted
through a filesystem translation layer that is dramatically slower for the
thousands of small files a JS monorepo has — `pnpm install`, `next dev`, and
your editor's file-watcher will all crawl. Clone under your Linux home
(`~`, i.e. `/home/<you>/...`) instead, which is a real Linux filesystem with
no penalty. See
[Repo under mnt-c](./troubleshooting#repo-under-mnt-c)
if you already have a `/mnt/c` checkout and want to know why it feels slow.

## Editor

Install the [VS Code WSL extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-wsl)
if you use VS Code, and open the repo with `code .` from inside the Ubuntu
terminal, not from Windows. This runs the editor's server inside WSL, next to
your files, which is what makes IntelliSense and the terminal agree with each
other.

## Docker: inside the distro, not Docker Desktop

Install Docker Engine directly inside your WSL2 Ubuntu distro — not Docker
Desktop. Docker Desktop's WSL integration works, but the direct install has
one less moving part and one less thing to keep updated on the Windows side:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and back in (or run `newgrp docker`) for the group change to take
effect, then continue with
[Linux](./linux) for the rest of the
toolchain, and
[Supabase, local](./supabase-local) when
you get to the database.

## The alternative: study-group-finder under WSL2

If you'd rather run study-group-finder from WSL2 than natively, it works, with
two things the native path doesn't need:

- **Windows 11 with mirrored networking.** Add `networkingMode=mirrored` to
  `.wslconfig` in your Windows user profile (`%UserProfile%\.wslconfig`)
  and restart WSL (`wsl --shutdown` from PowerShell). Without it, the Android
  emulator running on Windows and adb running inside WSL can't see each other.
- **Keep the repo on the Linux filesystem** — same reasoning as above.
- **Kill the Windows-side adb server first**: `adb kill-server` in a Windows
  terminal before starting anything in WSL. Windows and WSL each try to run
  their own adb server on the same port, and only one wins — see
  [adb no devices](./troubleshooting#adb-no-devices).

Flutter and Android Studio's emulator still run on the Windows side either
way; only the repo and the dev command move into WSL.
