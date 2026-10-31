---
name: Transfers and the pause
description: What happens to a project's docs when its repository changes owner, how an officer confirms the new owner, and which parts of project publishing are not built yet.
order: 10
section: infrastructure
---

# Transfers and the pause

If a repository changes owner, whether it moves to another account or the owner's login changes, its docs stop. Two checks enforce it, because a candidate can wait days for approval:

1. **At build time**, the candidate job looks the repository up by id and compares its current owner id and login with the map's confirmed `ownerId` and `ownerLogin`. A mismatch fails the run before anything is fetched.
2. **Just before publishing**, after the `docs-publishing` approval, the publish job reads the map from `main` again and repeats the comparison. A mismatch, or a project that has left the map, fails the job and the last good version stays live. This job has no source token; it reads the repository's public metadata with its own `GITHUB_TOKEN`, which is why only public repositories publish.

An officer ends the pause by confirming the new owner in the dashboard. That opens a pull request changing `ownerId` and `ownerLogin`; once it merges, the next candidate builds again. Confirming does not skip the environment approval.

## What is not built

- **Automatic candidates.** Nothing sends the `repository_dispatch` when a project's default branch moves. Run the workflow by hand.
- **The publish callback.** `docsFirstPublishedAt` is meant to be set by a call the publish job makes after a successful upload, authenticated by a scoped credential or by the run's GitHub OIDC identity. Neither exists, and a database key must never reach a workflow, so the field stays empty: publication does not freeze a project's slug, and the Contribute menu cannot yet tell the platform which projects have published. Until it is built, nobody should rename the slug of a project whose docs are enabled (the database already refuses a rename while a docs pull request is open).
