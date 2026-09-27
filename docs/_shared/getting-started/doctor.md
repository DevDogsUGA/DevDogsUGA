---
name: Doctor
description: One command that checks your whole setup against your actual machine, and what to do with its output.
order: 60
section: getting-started
mount: [schedule-builder, study-group-finder, platform]
---

# Doctor

```bash
pnpm devtools doctor
```

Run this whenever something isn't working and you're not sure which step of
setup is the problem, or as the last step of setup itself, before you go
looking for help. It re-checks everything the earlier pages walked through —
Node and pnpm versions, Docker or Flutter if your app needs them, whether
`.env` has everything your app's schema declares, and whether the Supabase
project it points at is actually reachable — against your machine as it is
right now, not as the docs assume it is.

Each check that fails links straight to the matching entry in
[Troubleshooting](./troubleshooting), by
the same anchor IDs used throughout these pages, so you land on the cause and
the fix instead of a bare error.

## Asking for help

```bash
pnpm devtools doctor --report
```

`--report` prints the same checks as a block of text meant to be pasted
somewhere else — into `#help` on Discord, or into an issue. It redacts
anything that looks like a credential before printing, so it's safe to paste
without editing it yourself first. Run the plain form first; reach for
`--report` once you've read what it says and still need another person to
look at it.
