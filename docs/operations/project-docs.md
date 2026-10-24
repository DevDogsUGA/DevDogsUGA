---
name: Project documentation
description: How a project's docs reach the website - adding a project to the central map, what a candidate shows, how reviewers approve it, and what to do when it fails.
order: 9
section: infrastructure
---

# Project documentation

A project's own repository can hold its documentation. When a change to those docs merges there, the website does not publish it by itself: DevDogsUGA builds a **candidate** from that exact commit, a reviewer looks at it, and only an approval publishes it. The workflow is `.github/workflows/docs-candidate.yaml`.

## Add a project to the map

The map is `.github/docs-projects.json`. It is reviewed in a DevDogsUGA pull request (CODEOWNERS: `.github/**`), and a project repository cannot change it. Add one entry:

```json
{
  "slug": "example",
  "repository": "DevDogsUGA/example",
  "branch": "main",
  "directory": "docs",
  "destination": "/docs/example"
}
```

- `slug`: lowercase letters, digits and hyphens. The club's own docs slugs (`platform`, `toolkit`, `workshops`, `schedule-builder`, `operations`) are reserved.
- `directory`: a relative folder in the repository. It holds Markdown, images (png, jpg, gif, webp, avif, svg) and an optional `docs.manifest.json`. Nothing else is read.
- `destination`: always `/docs/<slug>`.

`node --test .github/scripts/docs-projects.test.mjs` checks the file; CI runs it. Before the first candidate, give the read-only source token access to the new repository (below).

## Ask for a candidate

On a merge in a mapped repository the platform sends a `repository_dispatch` of type `docs-candidate` with `{ "project": "<slug>", "sha": "<merge commit>" }` (the webhook is stage D1). By hand:

```bash
gh workflow run docs-candidate.yaml -f project=example -f sha=<40-character commit>
```

The workflow refuses a project that is not in the map and a commit that is not on the mapped branch. The dispatch only names the project and the commit; the repository, branch and directory always come from the map.

## What the candidate shows

Open the run. The summary lists:

- the source (repository, commit, branch, directory) and the candidate's digest;
- the **checks**: it compiled under the untrusted policy, every page has a title and text, and there is an overview page;
- the **changes against the live version**: pages and assets added, changed and removed. With no live version yet, every page is new.

The `docs-preview-…` artifact holds a static preview: unzip it and open `preview/index.html`. It has no script and a locked-down content policy. A project's docs are compiled with the untrusted rules: no scripts, styles, classes, forms or external images, ids prefixed per project, links only to its own pages and assets, and no frontmatter that steers the build. A refused build names the file and line; the last good version stays live.

## Approve

The `publish` job waits in the `docs-publishing` environment. Its required reviewers (DevOps and leadership; they need no secrets access) read the summary and the preview, then approve or reject.

- Approving uploads exactly the candidate artifact. The job re-checks every file against the manifest and the digest the build reported, and writes the new version's pointer last.
- Rejecting, or a failed upload, changes nothing: the pointer still names the previous version.
- Approve in order. Two candidates for one project queue (one run per project at a time); the later approval wins, so reject a stale one rather than approving it.

Publishing only works from a run of `main`. A candidate built from another branch (to try a map change) stops after the build.

## Credentials

| Where                          | Name                                                           | Needs                                                                                             |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Repository secret              | `DOCS_SOURCE_TOKEN`                                            | Read-only on the mapped repositories: Contents and Metadata. Used by two steps in the build job.  |
| Repository variable (optional) | `DOCS_LIVE_BASE_URL`                                           | Public base URL of the docs content bucket, for the change summary.                               |
| `docs-publishing` secrets      | `DOCS_PUBLISH_ACCESS_KEY_ID`, `DOCS_PUBLISH_SECRET_ACCESS_KEY` | An R2 token with Object Read and Write on the docs content bucket only. Not the app deploy token. |
| `docs-publishing` variables    | `DOCS_PUBLISH_BUCKET`, `DOCS_PUBLISH_ENDPOINT`                 | The bucket name and its S3 endpoint.                                                              |

The build job has no publishing credential. The publish job has no source token and installs nothing.
