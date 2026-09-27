# Contributing

Start with your project's contributing guide, not this file:

- [Schedule Builder](https://devdogsuga.org/docs/schedule-builder/guides/contributing)
- [Study Group Finder](https://devdogsuga.org/docs/study-group-finder/guides/contributing)
- [Platform](https://devdogsuga.org/docs/platform/guides/contributing)

Maintaining shared packages, CI, or deploys? See [Shared packages & tooling](https://devdogsuga.org/docs/toolkit).

Competitions are GitHub issues labeled `competition`:
https://github.com/DevDogsUGA/DevDogsUGA/issues?q=is%3Aissue+label%3Acompetition

Stuck, or something in the docs is wrong? Ask in [Discord](https://devdogsuga.org/discord) rather than guessing.

## Before you open a pull request

- Keep it small and focused on one change.
- Link the issue it closes.
- Update docs if you changed behavior.
- If you added or changed a migration, give it a fresh timestamp and regenerate types (`pnpm devtools db types`).
- Make sure `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass locally.
