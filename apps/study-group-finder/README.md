# study-group-finder

DevDogs Study Group Finder — a Flutter app on the shared DevDogs Supabase
project, owning the **`study_group_finder`** Postgres schema.

Currently a placeholder (`lib/main.dart` → `StudyGroupFinderApp`). The schema is
reserved by a `supabase/migrations/<timestamp>_study_group_finder_<desc>.sql`
migration and exposed in `config.toml`; tables are added as the app is built.

Branded **Dog Pack**, with `dogpack.dev` reserved for its eventual web
deployment — `STUDY_GROUP_FINDER_URL` and `STUDY_GROUP_FINDER_URL_CALLBACK` are
already declared in `supabase/env.ts` and in `config.toml`'s auth redirect
allowlist, unset until the deploy exists. In-app branding is unchanged for now,
by decision.

## Prerequisites

- The [Flutter SDK](https://docs.flutter.dev/get-started/install) on `PATH`
  (`flutter --version`). The rest of the monorepo does not need it — CI scopes
  Flutter tasks separately.
- A configured root `.env` (see the repo README) for the shared Supabase creds.

## Develop

Run through the workspace so Supabase config comes from the shared root `.env`:

```bash
pnpm dev --filter study-group-finder   # local stack auto-detected, else remote
```

These pass `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `AUTH_MODE` to Flutter
via `--dart-define`. Auth mirrors the web apps: `devdogs` (platform OAuth
server) in dev, `google` in production — selected by `NEXT_PUBLIC_AUTH_MODE`
in `.env` (`AUTH_MODE` is only the `--dart-define` name it maps onto).

The app ID is `dev.dogpack` on both platforms. OAuth returns to
`dev.dogpack://login-callback`, registered as a URL scheme in
`AndroidManifest.xml` and `ios/Runner/Info.plist` and allowlisted in
`supabase/config.toml`'s `additional_redirect_urls`.

## Typed models

`supabase gen types` has no Dart target, so Dart models come from the community
[supadart](https://pub.dev/packages/supadart) generator (`supadart.yaml`):

```bash
pnpm --filter study-group-finder generate-types   # local stack auto-detected, else remote
```

supadart can only read PostgREST's **default** schema (it reads `/rest/v1/`
without an `Accept-Profile` header and has no schema option). To make that work,
`supabase/config.toml` lists `study_group_finder` **first** in
`[api] schemas`, so it _is_ the default REST profile and supadart reads exactly
this app's schema — no per-run config juggling. Nothing else depends on the
default (every Supabase client sets its `db.schema` explicitly).

`generate-types` maps the monorepo's `API_URL`/`SECRET_KEY` onto the
`SUPABASE_URL`/`SUPABASE_API_KEY` supadart expects (the **secret** key is
required — supadart 401s on the publishable key when fetching the spec). The
schema is currently empty, so this is a no-op until tables are added.

## pnpm workspace

`package.json` is a thin task wrapper (`build`/`dev`/`test`/`lint`/
`typecheck`/`generate-types`) so pnpm's workspace filters (`pnpm --filter
study-group-finder run <task>`) can orchestrate the Flutter toolchain. There is
no `web/` target in this app, so `build` produces a debug APK
(`flutter build apk --debug`) for fast validation that the app compiles.
Release Android/iOS artifacts are built in dedicated pipelines, not through
this wrapper. CI does not run this script — it analyzes and tests the app
directly (see `.github/workflows/ci.yaml`).
