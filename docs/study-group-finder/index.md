---
name: Study Group Finder
description: The Flutter app for forming study groups at UGA — what exists today, and the codegen constraint that shapes the whole Supabase config.
order: 40
---

# Study Group Finder

`apps/study-group-finder` — branded "Dog Pack" — is DevDogs' Flutter app for
finding and forming study groups. It is the only app in the monorepo that is not
Next.js, which is most of what makes it different to work on.

Today it is a placeholder: `lib/main.dart` initialises Supabase against the
**`study_group_finder`** schema and runs `StudyGroupFinderApp`. The schema is
reserved by `supabase/migrations/20260721000000_study_group_finder_init.sql`,
which creates it and grants the PostgREST roles — Supabase pre-configures those
grants for `public` only — but declares no tables. Isolation is by RLS, not by
the schema boundary.

## Working on it

Flutter is not part of the repo-wide toolchain. You need the
[Flutter SDK](https://docs.flutter.dev/get-started/install) on `PATH`; nothing
else in the monorepo does, and CI scopes the Flutter jobs separately so a
contributor without it is never blocked.

```bash
pnpm dev --filter study-group-finder
```

Run it through the workspace rather than calling `flutter` directly. The
package script passes `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and
`AUTH_MODE` in as `--dart-define` values sourced from the shared root `.env`, so
the app picks up the local stack when it is running and the remote project
otherwise — the same behaviour the web apps get from `with-env`. See
[Secrets and environments](/docs/monorepo/guides/secrets) for where that `.env`
comes from.

Auth mirrors the web apps: `devdogs` — the platform's own OAuth server — in
development, `google` in production. `AUTH_MODE` is only the `--dart-define`
name; the value is selected by `NEXT_PUBLIC_AUTH_MODE` in `.env`.

## Typed models, and the constraint they impose

`supabase gen types` has no Dart target, so models come from the community
[supadart](https://pub.dev/packages/supadart) generator, configured by
`supadart.yaml`:

```bash
pnpm --filter study-group-finder generate-types
```

supadart can only read PostgREST's **default** schema — it requests `/rest/v1/`
without an `Accept-Profile` header and offers no way to name one. That single
limitation is why `supabase/config.toml` lists `study_group_finder` **first**
under `[api] schemas`: being first makes it the default REST profile, so
supadart reads exactly this app's schema with no per-run juggling.

Nothing else depends on that ordering, because every Supabase client in the
repo sets its `db.schema` explicitly. It is worth knowing anyway — the reason
this app's schema sits at the top of a shared config file is not alphabetical
and not arbitrary, and it should not be "tidied".

> [!NOTE]
> `generate-types` maps the monorepo's `API_URL` / `SECRET_KEY` onto the
> `SUPABASE_URL` / `SUPABASE_API_KEY` supadart expects. The **secret** key is
> required: supadart returns 401 against the publishable key when fetching the
> spec. The schema has no tables yet, so the command is currently a no-op.

## Deployment

There is none yet. `dogpack.dev` is reserved for an eventual web build, and
both `STUDY_GROUP_FINDER_URL` and `STUDY_GROUP_FINDER_URL_CALLBACK` are already
declared in `supabase/env.ts` and listed in `config.toml`'s auth redirect
allowlist — optional, and left unset until something is deployed. Release
Android and iOS artifacts are built by dedicated pipelines rather than by
`turbo`.
