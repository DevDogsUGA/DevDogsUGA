---
name: Toolkit
description: The shared packages every app builds on — what each one is for, and which to reach for when.
order: 50
---

# Toolkit

`packages/*` holds the libraries and CLIs the apps share. None of them is a
product; you meet one because you hit an import or ran a command. These pages
are reference-shaped and short — what it is, the two or three calls you will
actually make, and a link to the generated API.

## I need to…

| …do this | …use this |
| --- | --- |
| Read a variable, or add a new one | **`@devdogsuga/env`** — the registry: one declaration per variable, carrying its schema and where it is allowed to live |
| Run anything against the database | **`@devdogsuga/devtools`** — the contributor CLI: database, moderation, OAuth, env sync, and the deploy steps CI runs |
| Talk to Postgres from an app | **`@devdogsuga/drizzle`** — the shared postgres-js + Drizzle client factory |
| Reach Supabase, or write an RLS test | **`@devdogsuga/supabase`** — config, migrations, generated types, client factories |
| Push or pull officer data | **`@devdogsuga/airtable`** — the field registry, sync engine, and base verifier |
| Send an email | **`@devdogsuga/email`** — react-email sources compiled to typed, React-free HTML |
| Change how docs are built | **`@devdogsuga/docs-build`** — compiles markdown, and generates the reference section |

## Reference

[API reference](./reference/api/env) is generated from each package's source on
every build, so it never drifts from what the code exports.
