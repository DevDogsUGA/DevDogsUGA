# Contributing!!

Thanks for helping improve the DevDogs Website!

## Workflow

1. **Fork** the repository and create a feature branch from `main`.
2. **Make your changes** — keep commits focused and descriptive.
3. **Open a pull request** targeting `main`. Fill out the PR template.

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

Unit and component tests use **Vitest**; the two Next apps also have **Playwright**
E2E smoke tests. Shared Vitest/ESLint config lives in `packages/config`.

```bash
pnpm test                              # all unit/component tests
pnpm --filter @devdogsuga/platform test:watch   # watch a single package
```

E2E runs against the **local** Supabase stack (never remote — test accounts are
backed by real `auth.users`):

```bash
pnpm sb start-local-stack              # boots Supabase, writes .env.generated
pnpm --filter @devdogsuga/platform test:e2e
```

Add tests next to the code they cover (`*.test.ts`/`*.test.tsx`); E2E specs live
in each app's `e2e/` directory.

## Database changes

Database tooling is per-app plus the shared `@devdogsuga/sb` package. See
[Getting Started](./getting-started.md) and the root README for the full
workflow; common commands:

```bash
pnpm sb new-migration <name>           # create a migration
pnpm sb push-migrations                # apply + regenerate types (remote)
pnpm --filter @devdogsuga/platform db:pull   # refresh Drizzle schema from the DB
```

## Documentation

Add or update markdown files in `docs/` alongside your code changes. Use the local preview to check rendering:

```bash
pnpm docs:preview
```
