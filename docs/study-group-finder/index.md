---
name: Study Group Finder
description: The Flutter app for finding study groups.
order: 40
os: [macos, linux, wsl, windows]
---

# Study Group Finder

`apps/study-group-finder` — branded "Dog Pack" — is DevDogs' Flutter app for
finding and forming study groups, targeting **Android and iOS** (no web
build). It is the only app in the monorepo that is not Next.js, which is most
of what makes it different to work on.

> [!TIP]
> Just getting started? Head to
> [Getting started](/docs/study-group-finder/getting-started/prerequisites). Working on
> the team's competition? Read the brief on the
> [competition issues board](https://github.com/DevDogsUGA/DevDogsUGA/issues?q=is%3Aissue+label%3Acompetition)
> before you start.

## Architecture

```
Flutter client (Android/iOS)
  --dart-define (from the shared root .env, via with-env)
  --> supabase_flutter --> Supabase over HTTP
        - PostgREST: study_group_finder schema
        - Auth: "Sign in with DevDogs" provider
  <-- generated Dart models (supadart)
```

The client talks to the shared DevDogs Supabase project the same way every
other app does — over HTTP, never a direct database connection — and owns the
**`study_group_finder`** Postgres schema. `supabase/migrations/20260829000000_00_schemas_and_grants.sql`
reserves the schema and its PostgREST grants; it declares no tables yet, so
isolation is by RLS, not by the schema boundary. Sign-in goes through the
platform's own OAuth server (see
[Sign-in](/docs/study-group-finder/getting-started/running#sign-in)) rather than the
app holding its own user store. Dart models are generated from the live
schema by [supadart](/docs/study-group-finder/guides/typed-models), not
hand-written.

## Glossary

- **Dog Pack** — this app's brand name.
- **`study_group_finder`** — this app's Postgres schema. Reserved, not yet
  populated; see [Schema change loop](/docs/study-group-finder/guides/schema-change-loop).
- **supadart** — the community Dart codegen tool that reads Supabase's
  default PostgREST schema; see [Typed models](/docs/study-group-finder/guides/typed-models).
- **`--dart-define`** — how Supabase config (URL, publishable key, auth mode)
  reaches the compiled app; see [Prerequisites](/docs/study-group-finder/getting-started/prerequisites).
