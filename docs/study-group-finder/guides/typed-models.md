---
name: Typed models
description: How Dart models are generated with supadart, the default-schema constraint that dictates config.toml ordering, and why generation is a no-op until the schema has tables.
order: 2
---

# Typed models

`supabase gen types` has no Dart target, so this app gets its typed models from
the community [supadart](https://pub.dev/packages/supadart) generator rather
than from the same path the web apps use.

```bash
pnpm --filter study-group-finder generate-types
```

That reads `supadart.yaml` (`output: lib/generated/`, `separated: true`) and
writes one Dart model per table into the gitignored `lib/generated/` directory.

## It needs the secret key

The `generate-types` script maps the monorepo's `API_URL` and **`SECRET_KEY`**
onto the `SUPABASE_URL` and `SUPABASE_API_KEY` supadart expects. The **secret**
(service-role) key is required, not the publishable one: supadart fetches the
OpenAPI spec and gets a `401` against the publishable key. That is why the
service key is declared under the `study-group-finder:tooling` source in
`env.ts` — it is a codegen-only credential that never ships in the app binary.

> [!IMPORTANT]
> Every runtime `--dart-define` value must stay `secrecy: "public"`: values
> compiled into a Flutter binary are extractable from the shipped app, and a
> completeness test enforces this. The secret key is *tooling*, used at codegen
> time only, and never becomes a `--dart-define`.

## The default-schema constraint

supadart can only read PostgREST's **default** schema — it requests `/rest/v1/`
with no `Accept-Profile` header and offers no way to name a schema. That single
limitation dictates something in a shared config file:
`supabase/config.toml` lists `study_group_finder` **first** under
`[api] schemas`, and being first makes it the default REST profile, so supadart
reads exactly this app's schema with no per-run juggling.

Nothing else depends on that ordering — every Supabase client in the repo sets
its `db.schema` explicitly, this app included. But the reason
`study_group_finder` sits at the top of that list is neither alphabetical nor
arbitrary, and the `config.toml` comment says so: **do not "tidy" the ordering.**

## It is a no-op today

The `study_group_finder` schema has no tables yet
(`supabase/migrations/20260829000000_00_schemas_and_grants.sql` reserves the
schema and applies the PostgREST role grants, nothing more), so
`generate-types` currently produces nothing. Once the first tables land in a
migration, running it will populate `lib/generated/`, and the models regenerate
from the database the same way — the schema is always the source, the Dart is
always output.
