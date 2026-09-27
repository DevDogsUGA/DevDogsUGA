---
name: Flutter setup
description: Installing the Flutter SDK and an Android/iOS emulator per OS, and the WSL2 + Windows-emulator alternative.
order: 20
section: getting-started
---

# Flutter setup

This app targets **Android and iOS only** — there is no `web/` runner
directory, and no `flutter build web` path is documented for it. You need the
[Flutter SDK](https://docs.flutter.dev/get-started/install) on `PATH`
(`pubspec.yaml` pins the Dart SDK to `^3.5.0`) plus an emulator to run
against. Nothing else in the monorepo needs Flutter, so a contributor without
it is never blocked on the rest of the repo.

## Native Windows

1. Install the [Flutter SDK for Windows](https://docs.flutter.dev/get-started/install/windows) and add it to `PATH` (the installer, or the VS Code Flutter extension, offers to do this for you).
2. Install [Android Studio](https://developer.android.com/studio), then open **More Actions → Virtual Device Manager** and create an Android emulator.
3. Run `flutter doctor` in a fresh terminal and resolve anything it flags (missing Android licenses are the usual one: `flutter doctor --android-licenses`).

## macOS

1. Install the SDK with Homebrew: `brew install --cask flutter` (or follow [Flutter's macOS install guide](https://docs.flutter.dev/get-started/install/macos)).
2. For Android, install Android Studio and create a virtual device the same way as above.
3. For iOS, install Xcode from the App Store, then `xcode-select --install` for the command-line tools. `open -a Simulator` boots the iOS Simulator; `flutter devices` should list it once Xcode is set up.
4. Run `flutter doctor` and resolve anything it flags.

## Linux

Flutter on Linux builds for Android only (no iOS toolchain). Follow
[Flutter's Linux install guide](https://docs.flutter.dev/get-started/install/linux), install Android Studio for the SDK and an emulator, and run `flutter doctor`.

## WSL2 + Windows emulator (alternative)

<details>
<summary>Running the Flutter SDK inside WSL2 against an emulator on Windows</summary>

The repo itself lives happily in WSL2 (clone into your Linux home directory,
never under `/mnt/c` — see the
[repo-under-mnt-c](/docs/study-group-finder/getting-started/troubleshooting#repo-under-mnt-c)
entry in Troubleshooting). Flutter and the Dart SDK run inside the distro;
Android Studio and the emulator itself still run on Windows, because WSL2 has
no GPU-accelerated emulator of its own. That split needs two things to line
up:

1. **Windows 11 with mirrored networking.** Add to `%UserProfile%\.wslconfig` on the Windows side:

   ```ini
   [wsl2]
   networkingMode=mirrored
   ```

   Restart WSL (`wsl --shutdown` from PowerShell) after editing it. Without
   mirrored networking, the Linux-side `flutter run` cannot reach `adb` on
   Windows over `localhost`.

2. **Only one `adb` server.** Both Windows and WSL2 ship their own `adb`, and
   two servers fighting for the same emulator is the most common failure
   mode here. Before starting `flutter run` from WSL2, kill any Windows-side
   `adb` server first:

   ```powershell
   adb kill-server
   ```

   Then let WSL2's own `adb` (bundled with the Android SDK you install
   inside the distro, or the SDK you point `ANDROID_SDK_ROOT` at) start
   fresh and connect to the emulator Windows is running.

With hosted Supabase (the default — see
[Supabase, hosted](/docs/study-group-finder/getting-started/supabase-hosted)), the
emulator reaches `*.supabase.co` over the network like any other HTTPS
endpoint, whichever side runs the emulator. Only the **local Docker stack**
path needs the Android emulator's special host alias (`10.0.2.2` in place of
`localhost`) to reach the machine's own Supabase containers — and the local
path is not documented for native Windows at all (see
[Supabase, local](/docs/study-group-finder/getting-started/supabase-local)).

</details>

## Verify

```bash
flutter doctor
```

Resolve anything it reports before moving on. `pnpm devtools doctor` (see
[Getting started](/docs/study-group-finder/getting-started)) checks the rest
of the toolchain but does not replace `flutter doctor` — Flutter's own
prerequisites are Flutter's to check.
