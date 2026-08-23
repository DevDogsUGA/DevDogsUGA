---
name: Turborepo
description: The task graph over pnpm workspaces — strict env mode, why some tasks depend on ^build, and the two spellings of "run the dev server" that behave differently.
order: 5
---

# Turborepo

Turborepo 2.10.11 runs every task across the pnpm 11.8.0 workspace (`apps/*`, `packages/*`, and `docs`). Read this when a task's cache behaves strangely, when a build fails only through turbo, or when you add a task or an environment variable. It is not an introduction to Turborepo — [upstream](https://turborepo.com/docs) is — and it will not tell you which command to run day to day; [Contributing](/docs/monorepo/guides/contributing) does.

## Strict env mode deletes what you forget to list

Under turbo's default strict env mode, a variable absent from a task's `env` list is not merely left out of the hash — it is **removed from the task's environment**. `@t3-oss` then reports it as `undefined` and the build fails. `next build` run directly in an app inherits the real environment and succeeds, so the two disagree and only the turbo path is broken. That list has drifted behind the env schema three times; when you add a variable, add it to `turbo.json` in the same change.

`globalDependencies` covers the root files no package can reach through the task graph — `tsconfig.base.json` and the shared eslint, tsconfig and vitest presets in `packages/config`. There is no remote cache configured; every hash is local.

## Why so many tasks depend on `^build`

`lint`, `typecheck`, `test` and `dev` all declare `dependsOn: ["^build"]`, for two different reasons. For `dev`, workspace dependencies that emit — notably `@devdogsuga/docs`, whose build parses `docs/**/*.md` into the module the docs routes import — have to exist before Next starts. For `lint`, the shared ESLint config is type-aware, so without those dependencies' `dist/*.d.ts` on disk the types collapse to `any` and the `no-unsafe-*` rules fire in the hundreds.

That has a consequence worth memorising:

```bash
pnpm dev --filter platform   # turbo — builds workspace deps first
pnpm --filter platform dev   # pnpm — bypasses turbo, builds nothing
```

Both appear in the repo. The second is fine once your dependencies are built and confusing when they are not.

<details>
<summary>Two output rules that fail silently when broken</summary>

**`*.tsbuildinfo` is cached as a build output beside `dist`.** `tsconfig.base.json` sets `incremental` and the build-info file lives at the package root rather than inside `dist`. If it survives a cache restore while `dist` does not, tsc considers the output current and emits nothing — the build "succeeds" with no `dist`, and consumers fail to resolve the package's types.

**`docs:gen` prefixes every input and output with `$TURBO_ROOT$`.** That task runs in the `@devdogsuga/docs` package, and turbo resolves paths relative to the _package_ directory, so a bare `apps/*/src/**` would mean `docs/apps/*/src` and match nothing. Both halves fail quietly: a task whose inputs match nothing is a permanent cache hit, and one whose outputs match nothing caches an empty artifact, so a fresh clone restoring that cache gets no reference pages at all.

`docs:gen` is split out from `@devdogsuga/docs#build` because it is a full type-checking pass over the whole monorepo; folded in, fixing a typo in a guide would pay to re-check every source file.

</details>

## One pnpm setting worth knowing

`shellEmulator: true` runs every package script through pnpm's built-in JS shell rather than the platform's, so `$VAR`, `${VAR:-default}`, `&&`, `>` and `KEY=VALUE` prefixes behave identically on Windows and POSIX. It also globs unquoted `[...]`, so keep such arguments quoted. A `$VAR` in a script is expanded by that shell _before_ `with-env` loads any env file; `with-env -c '…'` defers expansion until after.
