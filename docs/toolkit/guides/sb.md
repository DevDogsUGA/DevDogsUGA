---
name: sb
description: Four database commands over three targets — your local Docker stack, the linked Supabase project, or a team sandbox.
order: 4
---

# sb

`pnpm sb` and `pnpm devtools` are the same binary; `sb` is the shorter name for
the four database commands. Each takes one target:

```bash
pnpm sb link                 # --local is the default
pnpm sb reset --remote
pnpm sb status --team lantern
```

| Command  | `--local`                                     | `--remote`                                | `--team <slug>`                        |
| -------- | --------------------------------------------- | ----------------------------------------- | -------------------------------------- |
| `link`   | boots the Docker stack, writes `.env.generated` | `supabase link --project-ref $PROJECT_REF` | asks the platform for tokens, writes `.env.local` |
| `push`   | `supabase db push`, then regenerate the types | the same one script                       | asks the platform to apply them        |
| `reset`  | ⚠️ erases, replays migrations, then seeds      | ⚠️ same, against the linked project       | ⚠️ asks the platform to rebuild it     |
| `status` | tells you to run `supabase status`             | points at the Supabase dashboard          | reports state, and the wake-up ETA     |

The `--local` and `--remote` paths delegate to the scripts in
`@devdogsuga/supabase` **by name**, so those scripts stay the single definition
of what "reset" means and this CLI never reimplements one.

## link

`pnpm sb link` runs `supabase start`, writes the stack's own connection block to
`.env.generated`, and seeds the storage buckets. Nothing switches you between a
local stack and a hosted project by flag: `with-env` probes port 54321 on every
run, so a listening stack layers `.env.generated` over `.env` and a stopped one
falls back to the linked project. Stop it with
`pnpm --filter @devdogsuga/supabase stop-local-stack`, which removes
`.env.generated` too.

`--remote` links the CLI to the project named by `PROJECT_REF` and writes
nothing else; fill the Supabase values into `.env` first.

`--team <slug>` is the sandbox path. It calls the platform, which issues that
member's two tokens and writes them into `.env.local` as `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (plus the two
`NEXT_PUBLIC_` copies), preserving any other line already in the file. Set
`DEVDOGS_TOKEN` to your DevDogs session token first — the platform console has
it under Sandbox → CLI access. The URL is always the proxy hostname, never the
real Supabase one; [Access](/docs/sandbox/guides/access) is the credential
model.

## push and reset

`push` applies migrations that have not run yet and then regenerates
`packages/supabase/src/database.types.ts`. It erases nothing. `--local` and
`--remote` reach the same `push-migrations` script — this is the one command
where the target does not change what runs.

`reset` does. It drops the database, replays every migration from scratch, runs
the seeds, regenerates the types and re-seeds the storage buckets — so it always
asks first, and the confirmation defaults to no on anything but `--local`. It is
also the command that puts a new migration into your database:
[Database](/docs/platform/guides/database) is the change loop, including the
`db:pull` that `reset` deliberately does not do.

## status

Against `--local` and `--remote` this is a signpost rather than a probe: it
names `supabase status` or the dashboard, because both already answer the
question better than a wrapper could.

`--team` is the one that really reports. Sandbox instances pause to free a slot,
and a paused one wakes on demand — so the reply carries whether it is waking and
roughly how long that takes (measured at about four minutes), because a spinner
looks identical at second 5 and second 190.
