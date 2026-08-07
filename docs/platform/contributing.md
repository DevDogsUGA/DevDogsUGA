# Contributing!!

Thanks for helping improve the DevDogs Website!

## Workflow

1. **Fork** the repository and create a feature branch from `main`.
2. **Make your changes** — keep commits focused and descriptive.
3. **Open a pull request** targeting `main`. Fill out the PR template.

## Getting set up

```bash
pnpm devtools
```

Opens a menu — start a database, reset it, apply migrations, or check that an
app's moderation integration works. Nothing here needs you to know a command
name, and `pnpm devtools <command>` still works if you do. `pnpm sb` is the same
tool under its older name.

Running the console itself is a separate step:

```bash
pnpm --filter platform dev:local
```

The Discord and GitHub variables in `.env.example` are validated at boot but
only _used_ by role sync and the leaderboard, so any non-empty placeholder is
enough unless you are working on those.

## Code style

- TypeScript everywhere — avoid `any`.
- Before pushing, run the same checks CI runs:

  ```bash
  pnpm lint         # ESLint (turbo, all packages)
  pnpm typecheck    # tsc --noEmit
  pnpm test         # Vitest (+ flutter test)
  pnpm format:check # Prettier
  ```

  `pnpm lint:fix` and `pnpm format:write` auto-fix most issues.

- Prefer editing existing files over creating new ones.

## Testing

Unit and component tests use **Vitest**. Shared Vitest/ESLint config lives in
`packages/config`.

```bash
pnpm test                              # all unit/component tests
pnpm --filter platform test:watch   # watch a single package
```

Add tests next to the code they cover (`*.test.ts`/`*.test.tsx`).

### The RLS persona suite

```bash
pnpm sb link && pnpm sb reset          # migrations + seeds
pnpm --filter @devdogsuga/supabase test:rls
```

**Run this if you touch a policy, a grant, or a `security definer` function.**
It is not covered by `pnpm test`, because it needs a live stack.

Row-level security is now the whole security boundary. Previously an API route
was where a check lived and where a reviewer would look for it; with apps writing
straight to Postgres, a missing predicate in a policy _is_ the vulnerability, and
one publishable key reaches every schema. These tests are what stands where route
review used to.

Every case asserts an **allow and a deny**. A test that only checks the allow
side passes just as happily when the policy is missing entirely — and two
denials in this suite were in fact wide open when first written, because
`revoke execute … from anon, authenticated` leaves the default `PUBLIC` grant
intact.

## Database changes

Database tooling is per-app plus the shared `@devdogsuga/supabase` package. See
[Getting Started](./getting-started.md) and the root README for the full
workflow; common commands:

```bash
pnpm --filter @devdogsuga/supabase new-migration <name>   # create a migration
pnpm sb reset                                       # replay everything locally
pnpm --filter platform db:pull:local    # refresh Drizzle from the DB
pnpm sb push --remote                               # apply to the linked project
```

SQL is the source of truth; the Drizzle schema under
`src/server/db/schema/generated/` is regenerated from the database and never
edited by hand. See [Database & Migrations](./database.md).

## Documentation

Add or update markdown files in `docs/` alongside your code changes. Use the local preview to check rendering:

```bash
pnpm docs:preview
```
