---
name: Local setup
description: Getting the Flutter app running — the SDK, why you run it through the workspace, the placeholder tree, and how Supabase config reaches a compiled binary.
order: 1
---

# Local setup

Study Group Finder ("Dog Pack") is the only app in the monorepo that is not
Next.js, and that is most of what makes setting it up different. It is a Flutter
app today running as a placeholder against the shared Supabase project.

## Prerequisites

You need the [Flutter SDK](https://docs.flutter.dev/get-started/install) on your
`PATH` — `pubspec.yaml` pins the Dart SDK to `^3.5.0`. Nothing else in the
monorepo needs Flutter, and CI scopes the Flutter jobs separately, so a
contributor without the SDK is never blocked on the rest of the repo. You also
need a configured root `.env` (see [Quickstart](/docs/monorepo/guides/quickstart)).

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

`lib/main.dart` pins the client to this app's schema at init
(`PostgrestClientOptions(schema: 'study_group_finder')`), so its REST calls
never stray into another app's data.

## The tree is deliberately thin

This is **not** a full `flutter create` checkout. What exists:

- `lib/main.dart` — the whole app: Supabase init plus a placeholder
  `MaterialApp` (Material 3, UGA-red seed) whose home is a centred label.
- `test/widget_test.dart` — a smoke test that pumps the app and asserts the
  placeholder renders.
- `tool/` — the docs-extraction helper.
- Config: `pubspec.yaml`, `supadart.yaml`, `analysis_options.yaml`, `env.ts`,
  `package.json`.

There are **no committed platform runner directories** (`android/`, `ios/`,
`web/`, …), and `lib/generated/` is gitignored. If you need to actually launch on
a device or the web, run `flutter create .` in the app directory to scaffold the
runners locally; `build` targets web (`flutter build web`).

## Auth

Auth mirrors the web apps: `devdogs` — the platform's OAuth server — in
development, `google` in production. `AUTH_MODE` is only the `--dart-define`
name; the value comes from `NEXT_PUBLIC_AUTH_MODE` in `.env`. The flow is not
implemented in the app yet — `AUTH_MODE` is read but currently unused beyond the
constant.

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
