---
name: Testing
description: flutter analyze and flutter test — no database, and only when this app (or a shared dependency) actually changed.
order: 21
section: guides
---

# Testing

```bash
pnpm --filter study-group-finder lint    # flutter analyze
pnpm --filter study-group-finder test    # flutter test
```

Neither needs a database or a running Supabase stack — this app is a Flutter
placeholder today, and `test/widget_test.dart` is a smoke test: it pumps the
app and asserts the placeholder renders. `analysis_options.yaml` layers
`prefer_const_constructors` on top of `flutter_lints`. The `analyzer`
dependency is pinned to `^13.0.0` on purpose (Flutter pins `meta 1.18.0`);
bumping to 14.x will not resolve.

## What CI runs

`.github/workflows/ci.yaml` has a dedicated `flutter` job for this app, not
the `validate` job every TypeScript package goes through —
`validate`'s `lint`/`typecheck`/`test` steps all explicitly exclude
`study-group-finder` (`--filter '!study-group-finder'`), because
`flutter analyze` and `flutter test` aren't `pnpm -r`-shaped the way the
Node packages are. The `flutter` job:

1. **Checks whether it's affected** — this app, or `@devdogsuga/config`,
   `@devdogsuga/env`, or `@devdogsuga/supabase` (its actual resolved
   dependency graph). No relevant change, no run.
2. Installs Flutter (`subosito/flutter-action`, `stable` channel).
3. Runs `flutter pub get`, `flutter analyze`, `flutter test`, from
   `apps/study-group-finder`.

`typecheck` (`tsc --noEmit`, over `env.ts` and `tool/`) is not run in CI for
this app at all today — there is no step that calls it, in either job.
