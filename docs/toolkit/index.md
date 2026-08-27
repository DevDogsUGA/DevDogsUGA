---
name: Toolkit
description: The shared packages every app builds on.
order: 50
---

# Toolkit

`packages/*` holds the libraries and CLIs the apps share. None of them is a
product; you meet one because you hit an import or ran a command. These pages
are reference-shaped and short — what it is, the two or three calls you will
actually make, and a link to the generated API.

## I need to…

| …do this                             | …use this                                                                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read a variable, or add a new one    | [**`@devdogsuga/env`**](/docs/toolkit/guides/env) — the registry: one declaration per variable, carrying its schema and where it is allowed to live                         |
| Find the command for a chore         | [**`@devdogsuga/devtools`**](/docs/toolkit/guides/devtools) — the contributor CLI: database, moderation, OAuth, env sync, and the deploy steps CI runs                      |
| Boot, migrate or reset a database    | [**Database commands**](/docs/toolkit/guides/database) — four over your local stack, the linked Supabase project, or a team sandbox, plus `stop` and `restart` for your own |
| Talk to Postgres from an app         | [**`@devdogsuga/drizzle`**](/docs/toolkit/guides/drizzle) — the shared postgres-js + Drizzle client factory                                                                 |
| Reach Supabase, or write an RLS test | [**`@devdogsuga/supabase`**](/docs/toolkit/guides/supabase) — the three client factories, the generated `Database` types, the app → schema map, and the RLS test harness    |
| Push or pull officer data            | [**`@devdogsuga/airtable`**](/docs/toolkit/guides/airtable) — the field registry, sync engine, and base verifier                                                            |
| Send an email                        | [**`@devdogsuga/email`**](/docs/toolkit/guides/email) — react-email sources compiled to typed, React-free HTML                                                              |
| Change how docs are built            | [**`@devdogsuga/docs-build`**](/docs/toolkit/guides/docs-build) — compiles markdown, and generates the reference section                                                    |

## Reference

[API reference](/docs/toolkit/reference/api/env) is generated from each
package's source on every build, so it never drifts from what the code exports.
