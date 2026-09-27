---
name: Sentry
description: Where each Sentry setting lives — the per-app DSNs, the release and source-map upload, and devtools' DSN baked in at publish time.
order: 4
section: infrastructure
---

# Sentry

Each app reports to its own Sentry project, and devtools reports to a fourth. Every setting below is optional: with no DSN, `@devdogsuga/telemetry` skips `Sentry.init` entirely, and with no auth token, deploys skip the release step with a warning. That is the state of local development.

## Projects

The project slugs are not free to choose. The deploy workflow uploads each app's source maps to the project named after the app.

| Project            | Reports from                                                     |
| ------------------ | ---------------------------------------------------------------- |
| `platform`         | the platform Worker and its browser bundle                       |
| `schedule-builder` | the schedule-builder Worker, `ScrapeWorkflow` and browser bundle |
| `sandbox`          | the sandbox proxy Worker                                         |
| `devtools`         | the `devtools` CLI, on contributors' machines and in CI          |

`staging` and `production` are the event's `environment` tag, not separate projects, so each DSN is the same value in both deploy targets.

## DSNs

A DSN only lets someone send events to a project, so none of these is a secret.

| Variable                                  | Declared in                        |
| ----------------------------------------- | ---------------------------------- |
| `PLATFORM_SENTRY_DSN`                     | `apps/platform/src/env.ts`         |
| `NEXT_PUBLIC_PLATFORM_SENTRY_DSN`         | `apps/platform/src/env.ts`         |
| `SCHEDULE_BUILDER_SENTRY_DSN`             | `apps/schedule-builder/src/env.ts` |
| `NEXT_PUBLIC_SCHEDULE_BUILDER_SENTRY_DSN` | `apps/schedule-builder/src/env.ts` |
| `SANDBOX_SENTRY_DSN`                      | `apps/sandbox/env.ts`              |

Each name carries its app because a deploy environment holds one value per name: a shared `SENTRY_DSN` would send every app's events to one project. Each `NEXT_PUBLIC_` variable is derived from its server-side partner (`NEXT_PUBLIC_PLATFORM_SENTRY_DSN="$PLATFORM_SENTRY_DSN"`), so you never set it by hand. It is inlined into the browser bundle at build time.

They travel like any other per-environment variable. Fill in the three server-side DSNs in `.env.staging` and `.env.production`, then run `pnpm devtools env push --target <target>`, which stores them in Bitwarden and copies them to the GitHub environment's variables. The next deploy hands the server-side ones to the Worker, expands the two derived ones, and builds those into the bundle. [Secrets and environments](/docs/toolkit/infrastructure/secrets) covers the files.

Sandbox is not in the deploy pipeline. It deploys by hand with `wrangler deploy`, so its DSN only reaches the Worker if you set it there too, and its events carry no release.

## Releases and source maps

`deploy-app.yaml` tags every event with the deploy's commit SHA as the release (`SENTRY_RELEASE` for the Worker, `NEXT_PUBLIC_SENTRY_RELEASE` for the browser), then creates that release in Sentry and uploads the app's source maps from `dist/`. `public/.assetsignore` keeps the browser maps out of the deployed assets.

The release step needs two values that no env manifest declares, so `env push` and `env audit` don't manage them. Set both by hand on the `staging` and `production` GitHub environments:

| Name                | Kind     | Value                                               |
| ------------------- | -------- | --------------------------------------------------- |
| `SENTRY_ORG`        | variable | the Sentry organization slug                        |
| `SENTRY_AUTH_TOKEN` | secret   | an organization auth token that can create releases |

Without `SENTRY_AUTH_TOKEN` the step logs a warning and the deploy continues. With it, a failed release or upload fails the deploy. The deploy smoke test also uses both to confirm the release exists and each cron monitor has checked in.

## devtools

devtools' DSN is not configured here. Backstage bakes it into the published package: `publish.yaml` reads the `DEVTOOLS_SENTRY_DSN` Actions variable on the Backstage repository at build time. Only published builds report; set `DEVTOOLS_TELEMETRY=0` to opt out on your machine.
