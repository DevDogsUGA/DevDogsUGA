---
name: Your first contribution
description: A small, safe change to the top nav to prove your setup works end to end, then opening a pull request.
order: 3
section: getting-started
---

# Your first contribution

A first change that touches nothing risky: add a description to an existing
top-nav link. It exercises your whole setup — the dev server, lint,
typecheck, and the repo's checks — without touching auth, permissions, or the
database.

## Make the change

The platform's code is in [Backstage](https://github.com/DevDogsUGA/Backstage), not in this repository, so
this change is a pull request there. Clone it next to DevDogsUGA and install
both, DevDogsUGA first (Backstage links to its packages, `supabase/` and docs):

```bash
cd .. && git clone https://github.com/DevDogsUGA/Backstage.git
pnpm install          # in DevDogsUGA, if you haven't
cd ../Backstage && pnpm install
```

Backstage finds the clone at `../DevDogsUGA`; set `DEVDOGSUGA_DIR` if yours
lives elsewhere, and run `pnpm devdogsuga` to see where it points. Copy `.env` and
`.env.generated` from DevDogsUGA's root into Backstage's, and again after the
local Supabase stack restarts. The stack itself is still started from
DevDogsUGA.

Open `apps/platform/src/config/nav.ts` in Backstage. `PUBLIC_LINKS` is a plain exported
array of `NavItem`s — label, href, icon, and an optional `description` — that
becomes the navbar's left-aligned links. Pick an entry that has no
`description` yet and add one, or tighten the wording on an existing one.
Nothing here reads from the database or gates on a permission, so there's
nothing to break.

## Run it

```bash
pnpm -F platform dev
```

Confirm your change shows up in the top nav at `localhost:3000`. You don't
need to be signed in — `PUBLIC_LINKS` is, as the name says, public.

## Check it

```bash
pnpm --filter platform lint
pnpm --filter platform typecheck
pnpm --filter platform test
```

A checkout that has never run `vinext dev`/`vinext build` needs one extra
step before `typecheck`/`lint` pass: `pnpm --filter platform exec vinext
typegen` generates the framework's own route type stubs first.

## Open a pull request

Branch from `main` in Backstage, keep the commit focused
(`type(scope): subject`, e.g. `fix(platform): add a description to the
Community nav link`), and open a PR against `main`. Backstage's
`.github/CODEOWNERS` routes everything to `@DevDogsUGA/devops` for review. A
change that also needs a migration is a second PR in DevDogsUGA, which
owns `supabase/`. See the shared
[Contributing](../../_shared/guides/contributing.md) guide for the full flow,
including what CI runs in this repository and the database migration rules once your work
touches a schema.
