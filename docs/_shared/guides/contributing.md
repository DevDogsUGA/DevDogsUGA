---
name: Contributing
description: Branch to merged PR — the review flow, the PR template's checklist, and migration rules.
order: 2
section: guides
mount: [schedule-builder, study-group-finder, platform]
---

# Contributing

How a change gets from your branch into `main`. This assumes you already have
the app running — see Getting started if not.

## The flow

1. **Branch from `main`.** Fork the repository first if you don't have push
   access.
2. **Make your change.** Keep commits focused; the history follows
   Conventional Commits (`type(scope): subject`), as in
   `fix(schedule-builder): hide sections with no open seats`. Nothing enforces
   the format, but match what's there.
3. **Run the checks** below before you push.
4. **Open a pull request** targeting `main`. The template's checklist has
   three boxes — tick "Updated docs if behavior changed" honestly: a page that
   never got written is much easier to notice at review time than months
   later.
5. **Get a review.** `.github/CODEOWNERS` assigns owners per file, and only
   the **last** matching pattern in the file counts — GitHub's own rule.

Merging goes through the merge queue, and nothing in this repository deploys.
After a green push to `main`, CI opens or updates a deploy pull request in the
officers' [Backstage](https://github.com/DevDogsUGA/Backstage) repository that
moves its `devdogsuga.lock` to your commit; staging and production deploy from
there, and production waits for a reviewer. That is the officers' job, not
something a contribution needs to think about.

## Before you push

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

`pnpm lint:fix` and `pnpm format:write` fix most of what those find. A
checkout, worktree, or CI runner that has never run `vinext dev`/`vinext build`
needs one extra step before `typecheck`/`lint` pass on `schedule-builder` —
`pnpm --filter schedule-builder exec vinext typegen` (not `next typegen`)
generates the framework's own route type stubs first. Tests live beside the
code they cover, as `*.test.ts`/`*.test.tsx`.

## Database changes

One flat `supabase/migrations/` directory across every app. Name a new file
yourself, or generate the name:

```bash
pnpm devtools new-migration --app schedule-builder
```

It asks for the app and a description if you don't pass them — the app decides the schema
prefix (`platform`, `schedule_builder`, or `study_group_finder`) in the
filename `<timestamp>_<schema>_<desc>.sql`.

**CI enforces a fresh timestamp.** If `main` has picked up a newer migration
than yours since you branched, regenerate your file with a new timestamp rather
than keeping the old one. CI fails outright on a migration timestamped older
than `main`'s latest — the ordering has to match the order they actually land
in.

## Generated types

`packages/supabase/src/database.types.ts` is generated and gitignored, so there
is nothing to commit and nothing to conflict on. After any schema change, with
the local stack running:

```bash
pnpm devtools supabase db reset
pnpm --filter @devdogsuga/supabase run codegen
```

The output is cached by a hash of `supabase/migrations`, so it only runs again
when a migration changes. Never hand-edit the file.

Platform migrations live in this directory too, even though the platform app
itself is in the officers' [Backstage](https://github.com/DevDogsUGA/Backstage)
repository. See [Platform migrations](../../platform/guides/migrations.md).
