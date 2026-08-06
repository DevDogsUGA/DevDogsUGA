---
name: Platform
description: The DevDogs web platform — the site, console, docs, and public APIs.
---

# DevDogs Website

Welcome to the documentation for the DevDogs Website — the open-source web platform for the DevDogs club at the University of Georgia.

## What's in here

**Working on it**

- [Getting started](./getting-started.md) — prerequisites, the two ways to run it, and what a local reset seeds
- [Contributing](./contributing.md) — the PR workflow and the checks CI runs
- [Database & migrations](./database.md) — SQL is the source of truth; Drizzle types are generated from it
- [Caching](./caching.md) and [Navigation](./navigation.md)

**Subsystems**

- [Reporting & feedback](./reporting-and-feedback.md) — the RPC contract every app calls, and how a table becomes moderatable
- [The sandbox app](./sandbox-app.md) — the moderation fixture schema, and the traps integration hides
- [Sandbox environments](./sandbox-environments.md) — one shared Supabase instance per competition team (unrelated to the above, despite the name)
- [Meetings & teams](./meetings-and-teams.md), [Elections](./elections.md), [Airtable setup](./airtable-setup.md)
- [OAuth setup](./oauth-setup.md) — how a sibling project gets **Sign in with DevDogs**
- [The documentation system](./documentation-system/architecture.md) — how this page is built

## Tech stack

| Layer     | Technology              |
| --------- | ----------------------- |
| Framework | Next.js 15 (App Router) |
| Database  | Supabase (Postgres)     |
| ORM       | Drizzle ORM             |
| Styling   | Tailwind CSS v4         |
| Auth      | Supabase Auth           |
