---
name: Getting started
description: From a fresh machine to the app running on an emulator — toolchain, Flutter, Supabase, and sign-in.
order: 10
section: getting-started
---

# Getting started

The path is the same shape everywhere: get the toolchain and Flutter
installed, get a Supabase project, register the sign-in provider against it,
then run the app on an emulator.

## 1. Pick your platform

- **Windows:** [Windows (native)](./windows-native) is the default for this
  app. [WSL2](./windows-wsl) works too, as an alternative, if you already use
  it.
- **macOS:** [macOS](./macos).
- **Linux:** [Linux](./linux).

## 2. Toolchain: Node and pnpm

Follow [Toolchain](./toolchain): fnm installs Node from `.nvmrc`, then
`npm install -g pnpm`. pnpm switches itself to the version this repo pins.

## 3. Flutter and an emulator

See [Flutter setup](/docs/study-group-finder/getting-started/flutter) for the
SDK and an Android or iOS emulator, per OS.

## 4. A Supabase project

**Hosted Supabase is the default** — a free-tier project you create yourself.
Local Docker is fully supported too, except on native Windows (no local
Docker path is documented there — use hosted).

```bash
git clone https://github.com/DevDogsUGA/DevDogsUGA.git
cd DevDogsUGA
pnpm install
pnpm devtools setup
```

`setup` writes a root `.env`. For hosted Supabase, it walks you through
creating a project and asks for the API URL, publishable key, secret key, and
the database URL, then runs the migrations and chains straight into the
sign-in step below. See
[Supabase, hosted](/docs/study-group-finder/getting-started/supabase-hosted)
for that path in full, including doing it by hand, or
[Supabase, local](/docs/study-group-finder/getting-started/supabase-local) for
the Docker stack (macOS, Linux, or WSL2 — not native Windows).

## 5. Sign-in provider

`pnpm devtools setup`'s hosted flow chains into this automatically; running
it on its own looks like:

```bash
pnpm devtools oauth
```

This registers "Sign in with DevDogs" against your Supabase project — see
[Sign in with DevDogs](./sign-in) for what it asks and what to do
afterward.
Building the app's own sign-in screen is part of the competition brief, not
something devtools does for you.

## 6. Run it

```bash
pnpm dev --filter study-group-finder
```

Do not call `flutter run` directly — see
[Local setup](/docs/study-group-finder/guides/local-setup) for why. Pick your
emulator (or a connected device) when Flutter asks.

## 7. Check your environment

```bash
pnpm devtools doctor
```

Add `--report` for a redacted diagnostic you can paste in Discord if
something does not add up. If it flags something, or
`pnpm devtools doctor` isn't enough,
[Troubleshooting](/docs/study-group-finder/getting-started/troubleshooting) is
the FAQ for the errors people actually hit.

## 8. Make your first contribution

[First contribution](/docs/study-group-finder/getting-started/first-contribution)
walks through a small UI change, running it, and opening a pull request.
