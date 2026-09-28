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

Merging to `main` deploys staging automatically. Production is a separate
promotion pull request, opened later, into the `production` branch — not
something a first contribution needs to think about.

## Before you push

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

`pnpm lint:fix` and `pnpm format:write` fix most of what those find. A
checkout, worktree, or CI runner that has never run `vinext dev`/`vinext build`
needs one extra step before `typecheck`/`lint` pass on `schedule-builder` or
`platform` — `pnpm --filter <app> exec vinext typegen` (not `next typegen`)
generates the framework's own route type stubs first. Tests live beside the
code they cover, as `*.test.ts`/`*.test.tsx`.

## Database changes

One flat `supabase/migrations/` directory across every app. Name a new file
yourself, or generate the name:

```bash
pnpm devtools db migration new --app schedule-builder
```

It asks for the app if you don't pass `--app` — the app decides the schema
prefix (`platform`, `schedule_builder`, or `study_group_finder`) in the
filename `<timestamp>_<schema>_<desc>.sql`.

**Two rules CI enforces:**

- **Fresh timestamp before merging.** If `main` has picked up a newer
  migration than yours since you branched, regenerate your file with a new
  timestamp rather than keeping the old one. CI fails outright on a migration
  timestamped older than `main`'s latest — the ordering has to match the
  order they actually land in.
- **Regenerate types, don't hand-edit them.** After any schema change:
  ```bash
  pnpm devtools db types
  ```
  Never hand-merge `packages/supabase/src/database.types.ts` — it's
  generated, and a hand merge is the kind of conflict that looks resolved and
  silently isn't.

## Typegen conflicts

`database.types.ts` is the file every schema-touching branch regenerates, so
two branches merged close together commonly conflict on it. Resolve by
re-running the generator on your own branch after rebasing, not by merging
the diff by hand:

```bash
git pull --rebase origin main
pnpm devtools db reset      # or: pnpm devtools db migrate, against your branch's migrations
pnpm devtools db types
```
