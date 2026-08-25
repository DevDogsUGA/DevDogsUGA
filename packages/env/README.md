# @devdogsuga/env

The environment-variable registry: one declaration per variable, carrying its
schema and where it is allowed to live.

A new variable is added to an app's `env.ts` — a `declare()` whose manifest maps
each name to `define(schema, meta)`. `.env.example` is generated from those
manifests and byte-compared in CI, so it is never hand-edited.

The package also ships `with-env`, the bin that roughly fifty workspace scripts
wrap their command in — every script that needs a value at run time, which is
not the same as every script (`build`, `lint`, `typecheck` and `test` are bare):

```jsonc
"dev": "with-env next dev",
"link-remote-project": "with-env -c 'supabase link --project-ref $PROJECT_REF'"
```

The `-c` form defers `$VAR` expansion until after the env files are loaded; use
the plain argv form otherwise.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/env) ·
[Secrets and environments](../../docs/monorepo/guides/secrets.md)
