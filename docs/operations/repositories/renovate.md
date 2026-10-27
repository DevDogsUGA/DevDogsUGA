---
name: Renovate
description: What the shared Renovate preset updates, when, what merges by itself, what waits for an officer, and how to turn it on or hold it back.
order: 2
section: infrastructure
---

# Renovate

One shared preset, `renovate/default.json` in DevDogsUGA, configures Renovate for all three repositories. Each repository's own `renovate.json5` extends it: `github>DevDogsUGA/DevDogsUGA//renovate/default`. Renovate's vulnerability alerts replace Dependabot security updates, which are switched off.

## What it does

- **Covers** npm, pub.dev, GitHub Actions (pinned to digests) and the **Supabase CLI pin**.
- **One grouped pull request per repository, on weekends**, for patch and minor updates. They enter the merge queue by auto-merge once the required checks pass.
- **Majors** arrive one at a time, on any day, labelled `needs-officer`, and are never merged automatically.
- **`@devdogsuga/*` and `devdogsuga_sdk`** bump as soon as they publish and merge by themselves in the product repositories; there is no release-age wait for our own packages.
- **Vulnerability alerts** open at any time with the `security` label, and are never held back by the age gate. They do not auto-merge: read them.
- Commits are signed through GitHub's API, so they satisfy the [signed-commits rule](./rulesets.md).

## The Supabase CLI is special

The CLI version is pinned in three places that must agree: the pnpm catalog, the root `devDependencies`, and the `supabase_version` default in `deploy-database.yaml`. A new CLI can change the SQL the declarative diff writes and the schema hash the generated types are keyed by, so a bump is one grouped pull request, labelled `supabase-cli` and `needs-officer`, never auto-merged. Before merging it, run the pull request check and look at the diff the new CLI writes for the same tree: it should be empty.

## Turning it on

DevDogsUGA's `renovate.json5` ships with a rollout switch: the first package rule disables everything except our own packages, so merging the preset changes nothing until you are ready, with one exception: vulnerability alerts still open a security pull request for a vulnerable dependency (the first, for pnpm, opened minutes after the preset merged). Review and merge those like any other. To turn Renovate on for the repository, delete that rule (and its comment) in a pull request. For a product repository, extend the preset with no switch.

## Where it runs

Renovate runs on our own GitHub Actions runner, from `.github/workflows/renovate.yaml` in DevDogsUGA, every three hours and on demand (**Actions → Renovate → Run workflow**, with `debug` logging if you are chasing a problem). One run covers all three repositories, and its log is the place to look when the Dependency Dashboard stops updating.

It used to be Mend's hosted Renovate app. Mend's runners have a fixed memory limit, and regenerating DevDogsUGA's lockfile for the weekend group ran out of it ("Kernel out of memory"), so every run from Oct 14 stopped partway. A public repository's runner has 16 GB.

Renovate signs in as the `devdogs-renovate` GitHub App, owned by the organization. Using an App rather than the workflow's own token means:

- its pull requests trigger CI (pull requests opened with the workflow token do not);
- its commits are signed by GitHub, so they pass the signed-commits rule;
- the rulesets can name it: `main-reviews` lets it open pull requests without a review, never push.

The App needs these repository permissions: Administration (read), Checks, Commit statuses, Contents, Issues, Pull requests and Workflows (read and write), and Dependabot alerts (read); plus Members (read) for the organization. An organization owner installs it on DevDogsUGA, DogDays and DogPack ([Owner-only actions](./owner-actions.md)); a repository it cannot see is skipped, and `backstage github rulesets --apply` fails on it. The workflow reads the App's id from the `renovate` environment's `RENOVATE_APP_ID` variable and its private key from the `RENOVATE_APP_PRIVATE_KEY` secret. The environment has no reviewers, since a scheduled job cannot wait for one, and only `main` may use it.

A ticked checkbox on a Dependency Dashboard takes effect at the next run. Run the workflow by hand to act on it sooner.

## Holding it back

- One repository, briefly: comment on the Dependency Dashboard issue, or close the pull request (Renovate leaves it closed).
- One package: add a `packageRules` entry with `enabled: false` and a comment that says why and until when.
- Everything, in an incident: set `"enabled": false` at the top level of that repository's `renovate.json5`.

## Checking a change to the preset

```sh
npx --yes --package renovate renovate-config-validator --strict renovate/default.json
```

Validate before you merge: a preset that fails validation takes Renovate down in **every** repository at once.
