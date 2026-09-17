# CONTEXT.md

Domain glossary for this repo. Terms only — architecture and rationale live
closer to the code they describe (module-header comments, `docs/`).

## Worker app

A workspace package deployed as a Cloudflare Worker. Enumerated by root
[`workers.json`](workers.json), the single source of truth every `devtools`
call site importing app lists (`cf`, CI deploy, secret audits, the cron
contract test, the wizard's `--app` choices) is derived from. Drift between
that list and the workspace's actual `wrangler.jsonc`-bearing packages, or
`.github/workflows/deploy.yaml`'s deploy matrices, is guarded by
[`packages/devtools/src/workers.test.ts`](packages/devtools/src/workers.test.ts).

As of this writing: `platform`, `sandbox`, `schedule-builder`.
