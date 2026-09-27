---
name: Local setup
description: Getting the Flutter app running — why you run it through the workspace, the app tree, and how Supabase config reaches a compiled binary.
order: 1
section: guides
---

# Local setup

Study Group Finder ("Dog Pack") is the only app in the monorepo that is not
Next.js, and that is most of what makes setting it up different. It is a Flutter
app today running as a placeholder against the shared Supabase project.

## Prerequisites

This assumes you have already worked through
[Getting started](/docs/study-group-finder/getting-started) — the Flutter SDK
and an Android/iOS emulator ([Flutter setup](/docs/study-group-finder/getting-started/flutter)),
a Supabase project, and a configured root `.env`. Everything below is what is
specific to running `apps/study-group-finder` day to day.

## Run it through the workspace, not `flutter`

```bash
pnpm dev --filter study-group-finder
```

**Do not call `flutter run` directly.** The app reads its Supabase
configuration from compile-time `--dart-define` values
(`String.fromEnvironment` in `lib/main.dart`), and the package script is what
supplies them — it wraps `flutter run` in the repo's `with-env` helper and
passes:

```
--dart-define=SUPABASE_URL=$API_URL
--dart-define=SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
--dart-define=AUTH_MODE=${NEXT_PUBLIC_AUTH_MODE:-devdogs}
```

Run `flutter run` bare and those defines are empty, so `Supabase.initialize`
gets blank credentials. Sourcing from `with-env` is also what makes the app
follow the local stack when it is up and the remote project otherwise — the same
behaviour the web apps get.

`dev`, `build` and `generate-types` all wrap their command in `with-env -c`,
not plain `with-env`. `-c` is load-bearing: it defers expanding `$API_URL`,
`$PUBLISHABLE_KEY` and `$SECRET_KEY` until after `with-env` has loaded the
`.env` files, rather than expanding them from the (empty) ambient
environment before `with-env` ever runs. `lint`, `test` and `typecheck` need
none of that — they call `flutter analyze`, `flutter test` and
`tsc --noEmit` directly, with no env values to inject.

`lib/main.dart` pins the client to this app's schema at init
(`PostgrestClientOptions(schema: 'study_group_finder')`), so its REST calls
never stray into another app's data.

## What's in `lib/`

`lib/` holds one file today:

- `lib/main.dart` — Supabase init plus a placeholder `MaterialApp` (Material
  3, UGA-red seed) whose home is a centred label.

Everything else is scaffolding, not app code: `android/` and `ios/` are the
committed platform runner directories (this app targets Android and iOS
only — there is no `web/` directory and no web build path), `test/widget_test.dart`
is a smoke test that pumps the app and asserts the placeholder renders,
`tool/` is the docs-extraction helper, and `lib/generated/` (gitignored) is
where `generate-types` writes supadart's output. As the app grows, new
screens and logic land under `lib/`.

## Auth

`AUTH_MODE` selects the sign-in provider the app is built against —
`devdogs` (the platform's own OAuth server) by default. It is only the
`--dart-define` name; the value comes from `NEXT_PUBLIC_AUTH_MODE` in `.env`.
See [Sign in with DevDogs](/docs/platform/guides/identity/oauth) for how the
provider itself gets configured — building the actual sign-in flow in this
app is part of the competition brief, not something this page walks through.

## Env manifest

`apps/study-group-finder/env.ts` declares this app's variables for the shared
registry (`.env.example`, the secrets tooling), but **no Dart code imports it** —
Dart cannot read a TypeScript file. It exists purely so this app's keys show up
in the monorepo's env tooling alongside everyone else's. Editing it changes what
`.env.example` documents, not what the running app sees; the running app only
sees the `--dart-define` values above. (The `"type": "module"` in
`package.json` is load-bearing for `env.ts` — leave it.)

## Lint and test

```bash
pnpm --filter study-group-finder lint    # flutter analyze
pnpm --filter study-group-finder test    # flutter test
```

`analysis_options.yaml` layers `prefer_const_constructors` on top of
`flutter_lints`. The `analyzer` dependency is pinned to `^13.0.0` on purpose
(Flutter pins `meta 1.18.0`); bumping to 14.x will not resolve.
