---
name: Contributing
description: How a change gets from your branch into main — the review flow, the checks to run locally, and what CI enforces.
order: 2
---

# Contributing

How a change reaches `main`: the branch and review flow, the commands that reproduce CI on your laptop, and the jobs that run whether or not you remember to. It assumes you can already run an app — [Quickstart](/docs/monorepo/guides/quickstart) gets you there.

## The flow

1. Branch from `main`. Fork the repository if you do not have push access.
2. Keep commits focused. The history is Conventional Commits — `type(scope): subject`, as in `fix(platform): the docs sidebar takes the site's select`. Nothing enforces it, so match what is there.
3. Open a pull request targeting `main`.
4. Get a review. `.github/CODEOWNERS` assigns owners per file, and **only the last matching pattern counts** — GitHub's rule, and the file's own header says so in capitals. `*  @DevDogsUGA/reviewers` sits at the top, so it owns whatever no later rule claims; a path a later rule claims belongs to that rule alone. The later rules hand most paths to `@DevDogsUGA/devops` — `apps/platform/**`, `apps/sandbox/**`, `packages/**`, `.github/**`, `supabase/migrations/**`, each app's `wrangler.jsonc` and `src/env.ts`, `supabase/config.toml` — with the other two apps going to their own teams and `.github/CODEOWNERS` itself to `@DevDogsUGA/admins`.

Merging to `main` deploys staging. Production is a separate promotion pull request into the `production` branch.

## Before you push

```bash
pnpm lint         # ESLint, every package
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest, and flutter test — see below
pnpm format:check # Prettier
```

`pnpm lint:fix` and `pnpm format:write` fix most of what those find. Tests live beside the code they cover, as `*.test.ts` / `*.test.tsx`.

`apps/study-group-finder`'s `test` task is `flutter test`, and without the SDK on `PATH` it fails rather than skipping. Append `--filter='!study-group-finder'` to leave it out — the filter CI uses.

**Touching a policy, a grant, or a `security definer` function?** Run the RLS persona suite as well. It needs a live stack, so `pnpm test` does not reach it:

```bash
pnpm devtools link && pnpm devtools reset
pnpm --filter @devdogsuga/supabase test:rls
```

Every case there asserts an allow **and** a deny. A test that only checks the allow side passes just as happily when the policy is missing entirely.

### Which apps a root task runs against

Every root turbo script — `dev`, `build`, `test`, `lint`, `lint:fix`, `typecheck` — asks which apps you mean before it runs:

```
$ pnpm dev
◆  `dev` — which apps? (a selects all; --all runs every package)
│  ◼ platform            with-env next dev --experimental-https
│  ◻ schedule-builder    with-env next dev
│  ◻ study-group-finder  with-env -c 'flutter run …'
```

`pnpm dev` used to start all three at once — two dev servers and a Flutter run — when almost nobody is working on more than one. The picker is preselected with your last answer for that task, so the common case is Enter. `a` toggles every app in the list, `i` inverts the selection.

Three ways past it, each skipping the question entirely:

| Command                      | What it does                                   |
| ---------------------------- | ---------------------------------------------- |
| `pnpm dev --filter platform` | any turbo filter — you have already said which |
| `pnpm dev --all`             | every package, the old behaviour               |
| `CI=1 pnpm dev`              | what CI does                                   |

> [!IMPORTANT]
> `a` and `--all` are not the same thing, and the gap matters most for the tasks you are most likely to run before pushing. `a` selects every app in the list, which is `apps/*`. `--all` passes turbo no filter at all, which is every package in the workspace.
>
> For `build` the two nearly coincide, because filtering to an app pulls its dependencies in through `^build`. For `test`, `lint` and `typecheck` they do not: those tasks declare `dependsOn: ["^build"]`, not `^test`, so selecting all four apps runs **four** test suites while `pnpm test --all` runs **ten** — every suite in `packages/*` is skipped by the first. If you want the whole workspace checked, use `--all`.

**CI never sees a prompt**, and in fact never reaches the picker at all: every workflow calls `pnpm turbo run …` directly rather than going through a root alias. The guard is there regardless — `pnpm devtools run` passes straight through to turbo when `CI` is set, when stdin is not a TTY, or when a filter is already present, which covers workflows, piped output and editor task runners alike.

Each root task is a thin alias for the same thing: `pnpm build` is `pnpm devtools run build`. The picker lives in `packages/devtools/src/run/pick.ts` with every other prompt in the repo.

`pnpm dev:docs` is unchanged: it carries its own filter already.

## What CI actually runs

`.github/workflows/ci.yaml` runs on every pull request and holds no secrets at all — on `pull_request` GitHub runs the workflow definition _from the pull request_, so any credential in scope would be readable by whoever opened it. Four jobs:

- **validate** — `lint`, `typecheck` and `test` across the affected packages, plus two unconditional comparisons that need no credential: the Airtable registry against its committed schema snapshot (`pnpm devtools airtable snapshot --check`), and `.env.example` against the env manifests (`pnpm devtools env example --check`).
- **database** — starts the real local Supabase stack on an empty volume, which makes it the "every migration applies from scratch" check too. Then: the committed `database.types.ts` still matches the migrations, the RLS suite, the platform query and privilege-surface suite, and a production build of both Next apps with env validation **enforced**.
- **format** — `pnpm format:check` over the whole repo.
- **flutter** — `flutter analyze` and `flutter test`, only when `study-group-finder` is affected.

`build` is deliberately absent from **validate** and present in **database**: a Next production build reads the environment whether or not the schema is validated, and it needs a database.

## Database changes

SQL is the source of truth; the generated Drizzle schema is regenerated from the database and never hand-edited.

```bash
pnpm --filter @devdogsuga/supabase new-migration <name>
pnpm devtools reset                             # replay everything locally
pnpm --filter platform db:pull            # refresh Drizzle from the database
pnpm devtools push --remote                     # apply to the linked project
```

## Documentation

Docs live in `docs/`, one folder per project, and ship in the same pull request as the code they describe. See [writing docs](/docs/monorepo/guides/docs-system/writing).
