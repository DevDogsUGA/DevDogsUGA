---
name: Sentry
description: Where each Sentry setting lives — the per-app DSNs, the release and source-map upload, and devtools' DSN baked in at publish time.
order: 4
section: infrastructure
---

# Sentry

Each app reports to its own Sentry project, and devtools reports to a third. Every setting below is optional: with no DSN, `@devdogsuga/telemetry` skips `Sentry.init` entirely, and with no auth token, deploys skip the release step with a warning. That is the state of local development.

## Projects

The project slugs are not free to choose. The deploy workflow uploads each app's source maps to the project named after the app.

| Project            | Reports from                                                     |
| ------------------ | ---------------------------------------------------------------- |
| `platform`         | the platform Worker and its browser bundle                       |
| `schedule-builder` | the schedule-builder Worker, `ScrapeWorkflow` and browser bundle |
| `devtools`         | the `devtools` CLI, on contributors' machines and in CI          |

`staging` and `production` are the event's `environment` tag, not separate projects, so each DSN is the same value in both deploy targets.

## DSNs

A DSN only lets someone send events to a project, so none of these is a secret.

| Variable                                  | Declared in                            |
| ----------------------------------------- | -------------------------------------- |
| `PLATFORM_SENTRY_DSN`                     | `apps/platform/src/env.ts` (Backstage) |
| `NEXT_PUBLIC_PLATFORM_SENTRY_DSN`         | `apps/platform/src/env.ts` (Backstage) |
| `SCHEDULE_BUILDER_SENTRY_DSN`             | `apps/schedule-builder/src/env.ts`     |
| `NEXT_PUBLIC_SCHEDULE_BUILDER_SENTRY_DSN` | `apps/schedule-builder/src/env.ts`     |

Each name carries its app because a deploy environment holds one value per name: a shared `SENTRY_DSN` would send every app's events to one project. Each `NEXT_PUBLIC_` variable is derived from its server-side partner (`NEXT_PUBLIC_PLATFORM_SENTRY_DSN="$PLATFORM_SENTRY_DSN"`), so you never set it by hand. It is inlined into the browser bundle at build time.

They travel like any other per-environment variable. Fill in the two server-side DSNs in `.env.staging` and `.env.production`, then run `backstage env push --target <target>`, which stores them in Bitwarden and copies them to the GitHub environment's variables. The next deploy hands the server-side ones to the Worker, expands the two derived ones, and builds those into the bundle. [Secrets and environments](./secrets.md) covers the files.

## Releases and source maps

Backstage's deploy workflow (`.github/workflows/deploy.yaml`) tags every event with a commit SHA as the release (Backstage's for the platform, the pinned DevDogsUGA commit for schedule-builder) (`SENTRY_RELEASE` for the Worker, `NEXT_PUBLIC_SENTRY_RELEASE` for the browser), then creates that release in Sentry and uploads the app's source maps from `dist/`. `public/.assetsignore` keeps the browser maps out of the deployed assets.

The release step needs two values. The operator manifest that devtools and the Backstage CLI ship declares both, beside `CLOUDFLARE_API_TOKEN`, because no app reads them:

| Name                | Kind            | Value                                               |
| ------------------- | --------------- | --------------------------------------------------- |
| `SENTRY_ORG`        | committed       | `devdogsuga`, the same everywhere                   |
| `SENTRY_AUTH_TOKEN` | per-environment | an organization auth token that can create releases |

`SENTRY_ORG` needs no setting: the deploy reads it from `.env.example`. For the token, fill in `SENTRY_AUTH_TOKEN` in `.env.staging` and `.env.production` (one token serves both), then run `backstage env push --target <target>` for each. Create it under Sentry's **Settings → Developer Settings → Organization Tokens**.

Without `SENTRY_AUTH_TOKEN` the step logs a warning and the deploy continues. With it, a failed release or upload fails the deploy. The deploy smoke test also uses both to confirm the release exists. It doesn't check cron monitors: the organization token can't read them, and Sentry already opens an issue when a monitored job misses a check-in.

## devtools

devtools' DSN is not configured here. Backstage bakes it into the published package: Backstage's `publish.yaml` reads the `DEVTOOLS_SENTRY_DSN` Actions variable on the Backstage repository at build time. Only published builds report; set `DEVTOOLS_TELEMETRY=0` to opt out on your machine.
