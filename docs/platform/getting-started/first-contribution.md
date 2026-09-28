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

Open `apps/platform/src/config/nav.ts`. `PUBLIC_LINKS` is a plain exported
array of `NavItem`s — label, href, icon, and an optional `description` — that
becomes the navbar's left-aligned links. Pick an entry that has no
`description` yet and add one, or tighten the wording on an existing one.
Nothing here reads from the database or gates on a permission, so there's
nothing to break.

## Run it

```bash
pnpm dev --filter platform
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

Branch from `main`, keep the commit focused
(`type(scope): subject`, e.g. `fix(platform): add a description to the
Community nav link`), and open a PR against `main`. `.github/CODEOWNERS`
routes `apps/platform/**` to `@DevDogsUGA/devops` for review. See the shared
[Contributing](/docs/platform/guides/contributing) guide for the full flow,
including what CI runs and the database migration rules once your work
touches a schema.
