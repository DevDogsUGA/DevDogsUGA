---
name: Where things live
description: A map of apps/study-group-finder — what's app code, what's generated, and what's config.
order: 4
section: guides
---

# Where things live

| Path                     | What it is                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/main.dart`          | The app: Supabase init, `AUTH_MODE`/URL/key read from `--dart-define`, `StudyGroupFinderApp`.                                                    |
| `lib/generated/`         | supadart's output — one Dart model per table. Gitignored; never hand-edit, regenerate instead.                                                   |
| `android/`, `ios/`       | The committed Android and iOS platform runner directories. No `web/` — this app doesn't target it.                                               |
| `test/widget_test.dart`  | The smoke test: pumps the app, asserts the placeholder renders.                                                                                  |
| `tool/`                  | `docs_extract.dart`, which reads this app's declarations for the generated docs reference.                                                       |
| `pubspec.yaml`           | Dart/Flutter dependencies and the Dart SDK constraint (`^3.5.0`).                                                                                |
| `supadart.yaml`          | Config for the Dart model generator — see [Typed models](/docs/study-group-finder/guides/typed-models).                                          |
| `analysis_options.yaml`  | Lint rules `flutter analyze` checks against (`flutter_lints` plus `prefer_const_constructors`).                                                  |
| `env.ts`, `package.json` | The pnpm task wrapper and this app's entry in the shared env registry — see [Getting started](/docs/study-group-finder/getting-started/running). |

## Where the schema lives

There's no app-side schema file to look for. `study_group_finder` is defined
entirely by `supabase/migrations/` at the repo root — one flat directory
shared by every app — starting with
`20260829000000_00_schemas_and_grants.sql`, which reserves the schema and its
PostgREST grants. See
[Schema change loop](/docs/study-group-finder/guides/schema-change-loop) for
adding to it.

## Where the pnpm scripts point

`package.json`'s `dev`/`build`/`generate-types` scripts all shell out to
Flutter or Dart through the root `with-env` helper; `lint`, `test` and
`typecheck` call `flutter analyze`, `flutter test` and `tsc --noEmit`
directly. None of them run JavaScript — the manifest exists so this app shows
up in the workspace task runner like any other. See
[Getting started: Running](/docs/study-group-finder/getting-started/running)
for `dev`/`build`, and [Testing](/docs/study-group-finder/guides/testing) for
`lint`/`test`.
