---
name: Secrets and environments
description: One env file per target — which file is which, how yours gets filled, and where the full reference lives.
order: 3
---

# Secrets and environments

There is one env file per **target**, not one file with modes. This page is the map: which file is which, how your own gets filled, and what to run when one is missing. If you are a contributor working on a feature, the first two sections are all you need — the rest matters to whoever holds the deploy credentials.

## Your file

`.env` at the repo root **is** the development target. Every script that needs it goes through `with-env`, the wrapper from `@devdogsuga/env`, which loads the file and prints on every run which files it actually loaded.

Creating it is the one thing `with-env` cannot do, so `pnpm setup` deliberately runs outside the wrapper — it is the one command that works with no `.env` present. [Quickstart](/docs/monorepo/guides/quickstart) has the full order.

When the local Docker stack is up, `with-env` layers `.env.generated` — the stack's own connection block, written by `pnpm sb link` — on top of `.env`, first file wins. There is no flag for this: `with-env` probes port 54321 every run, so starting the stack switches you onto it and stopping it switches you back.

## The four targets

| `--target` | File | Bitwarden project | Can boot an app |
| --- | --- | --- | --- |
| `development` | `.env` | none — it is your own file | yes |
| `preflight` | `.env.preflight` | `preflight` | no |
| `staging` | `.env.staging` | `staging` | yes |
| `production` | `.env.production` | `production` | yes |

These are standalone files, not layers over a shared base. A variable present in `.env` and forgotten in `.env.production` would otherwise fall through to the development value while `DEPLOY_ENV` says production; separate files turn that into a validation error instead of a wrong answer.

`preflight` is the odd row. It is a staging area for pushing credentials, and `DEPLOY_ENV=preflight` is refused outright, because nothing is meant to boot from it.

`production` carries one extra guard, about writing rather than booting: `env pull` and `env push` warn first, their confirmation defaults to no, and `env push --target production --yes` is refused rather than run unattended.

The order above — least dangerous to most — is the order the interactive picker lists, so a reflexive Enter never lands on production.

## When a file is missing

`with-env` refuses and names the command that materialises it:

- `.env` → `pnpm setup`
- any other target → `pnpm devtools env pull --target <target>`

## Where the detail lives

`pnpm devtools env --help` lists the six subcommands (`pull`, `push`, `audit`, `init`, `example`, `reset`) and the options each takes; `pnpm devtools` with no arguments walks you through them interactively. Bitwarden Secrets Manager is the source of truth and GitHub environment secrets are a derived copy — [Env](/docs/platform/env) is the reference for how the two are kept in step and what `audit` compares.

Two things worth knowing before you touch any of it:

- `.env.example` is **generated** from the env manifests, and CI byte-compares it. A new variable is declared in its app's manifest; it is never typed into the example by hand.
- A variable is filed under whoever *reads* it, not whoever it sounds like it belongs to. An app's manifest is what the deploy uploads to that app's Worker, so filing an operator credential under an app would put it on an internet-facing Worker that never asked for it.
