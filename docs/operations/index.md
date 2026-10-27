---
name: Operations
description: Runbooks for running the club's platform and products - deploys, rollback, credentials, incidents, releases - written so a new DevOps officer can act without asking.
order: 60
---

# Operations

These are the runbooks for the DevOps/Platform officer and the other `devops` members who approve deploys. They hold no secrets: a runbook says where a credential lives and how to replace it, never what it is. The reference for how things are built is in [Shared packages & tooling](../toolkit/index.md); this project is for the moments when you have to act.

## Who can do what

| Role                                            | What they can do                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| DevOps/Platform officer                         | Owns deploys, accounts, credentials, pipelines, Sentry, Renovate and CODEOWNER review of platform code.    |
| `devops` team (at least two others)             | Approve production deploys and the destructive gate. Cannot approve a change they wrote or queued.         |
| `focus-leads`, `reviewers`                      | Review and merge pull requests through the merge queue. Cannot approve a deploy.                           |
| Organization owners (President, Vice President) | The only people who can do [owner-only actions](./repositories/owner-actions.md). Break-glass for the lot. |

Everyone else works from a fork. Nobody but the people above, and the `team-*` teams on the repositories that grant them `push`, can push branches; `main` accepts changes only through a pull request.

## The runbooks

**Deploys**

- [How a deploy works](./deploys/how-a-deploy-works.md): staging, approvals, the two shared workflows.
- [Rolling back](./deploys/rollback.md): a Worker, and what cannot be rolled back.
- [A failed migration](./deploys/failed-migration.md)
- [Destructive changes](./deploys/destructive-changes.md): the gate, the label, the bypass.
- [Dropping tables](./deploys/table-drops.md): the order of operations.
- [The vanity-subdomain switch](./deploys/vanity-subdomain-switch.md): `api.devdogsuga.org` and Supabase.
- [Smoke checks](./deploys/smoke-checks.md): what runs on a timer and what to do when it fails.

**Repositories**

- [Rulesets and signed commits](./repositories/rulesets.md)
- [Renovate](./repositories/renovate.md)
- [Product repository CI](./repositories/product-ci.md): the caller job names the product rulesets require.
- [Owner-only actions](./repositories/owner-actions.md)

**Project documentation**

- [Project documentation](./project-docs.md): the central map, candidates, and approval.

**Credentials** (one page per service, with owner, admins and recovery): [overview](./credentials/index.md).

**Incidents and triage**

- [Sign-in is down during registration](./incidents/sign-in-down.md)
- [Triaging Sentry](./incidents/sentry-triage.md)

**Releases and data**

- [npm and pub.dev releases](./releases/publishing.md)
- [Catalog term rollover](./releases/catalog-term-rollover.md)
- [Backfilling badges](./releases/badge-backfill.md): `import badges` for evidence that predates the triggers.
