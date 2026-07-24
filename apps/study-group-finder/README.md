# @devdogsuga/study-group-finder

DevDogs Study Group Finder — a Flutter app on the shared DevDogs Supabase
project, owning the **`study_group_finder`** Postgres schema.

Currently a placeholder (`lib/main.dart` → `StudyGroupFinderApp`). The schema is
reserved by `packages/sb/supabase/migrations/*_study_group_finder_init.sql` and
exposed in `config.toml`; tables are added as the app is built.

## Prerequisites

- The [Flutter SDK](https://docs.flutter.dev/get-started/install) on `PATH`
  (`flutter --version`). The rest of the monorepo does not need it — CI scopes
  Flutter tasks separately.
- A configured root `.env` (see the repo README) for the shared Supabase creds.

## Develop

Run through the workspace so Supabase config comes from the shared root `.env`:

```bash
pnpm --filter @devdogsuga/study-group-finder dev        # remote Supabase
pnpm --filter @devdogsuga/study-group-finder dev:local  # local stack
```

These pass `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `AUTH_MODE` to Flutter
via `--dart-define`. Auth mirrors the web apps: `devdogs` (platform OAuth
server) in dev, `google` in production — selected by `AUTH_MODE`.

## Typed models

`supabase gen types` has no Dart target, so Dart models come from the community
[supadart](https://pub.dev/packages/supadart) generator (`supadart.yaml`):

```bash
pnpm --filter @devdogsuga/study-group-finder generate-types
```

## Turborepo

`package.json` is a thin task wrapper (`build`/`dev`/`test`/`lint`/
`generate-types`) so `turbo` can orchestrate the Flutter toolchain; `build`
targets the web output for fast validation. Release Android/iOS artifacts are
built in dedicated pipelines, not by turbo.
