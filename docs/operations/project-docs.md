---
name: Project documentation
description: How a project's docs reach the website - adding a project to the central map, what a candidate shows, how reviewers approve it, how the platform reads a publication, and what to do when it fails.
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
- One run per project at a time. While a candidate waits for approval, it holds up the project's next merge: that one waits as the
  single pending run, and a newer merge replaces it (GitHub cancels the older pending run). So a pending approval blocks the next
  candidate; approve or reject it promptly. Nothing stale is published, because the newest waiting merge is the one that builds next.

Publishing only works from a run of `main`. A candidate built from another branch (to try a map change) stops after the build.

## How the platform reads a publication

Publishing writes to the R2 bucket `devdogs-project-docs`. The platform reads it through the `PROJECT_DOCS` binding declared in `apps/platform/wrangler.jsonc` (the top level and each environment: R2 bindings aren't inherited). One bucket serves development, staging and production, because the docs are public and the platform only ever reads it.

| Object                                            | Read as                                                                                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `projects/<slug>/current.json`                    | The pointer: `version`, `project`, `digest`, `sha`, `repository`, `destination`, `publishedAt`. It must name the slug it sits under and the destination `/docs/<slug>`; anything else is ignored and logged. |
| `projects/<slug>/versions/<digest>/content.json`  | The compiled pages (HTML already sanitised and id-prefixed), folders and asset list. Validated against a schema with size limits before use.                                                                 |
| `projects/<slug>/versions/<digest>/search.json`   | The search entries.                                                                                                                                                                                          |
| `projects/<slug>/versions/<digest>/assets/<path>` | Images, served at `/docs-assets/<slug>/<digest>/<path>`.                                                                                                                                                     |

What the platform does with it:

- **Pages.** `/docs/<slug>` redirects to the project's first page; `/docs/<slug>/<page>` renders the stored HTML inside the normal docs layout (sidebar, table of contents, step pager). The HTML is put into the page as stored. The only change is to `<img src>` and links to approved assets, which point at the version's asset route; a reference that doesn't resolve to an approved asset loses its URL. Nothing the compiler stripped is allowed back, and the site's Content-Security-Policy is unchanged (images only ever come from the site itself). An unknown slug, an unknown page, or a project that isn't published is a 404. The club's own bundled projects always win a slug, and the early-access preview never shows published projects.
- **Freshness.** The list of pointers is cached for 30 seconds, and a page that reads it is cached for no longer, so a new publication shows within about a minute with no deploy. A version's content is cached by its digest, for good. A missing or unreadable version is only cached for those 30 seconds.
- **Search.** Cmd-K folds in each published project's `search.json`, matched in memory and labelled with the project. Nothing is written to the database index; `populate:search` still rebuilds that on each deploy.
- **Terminal.** `curl devdogsuga.org/docs/<slug>` lists the pages; a page prints its title, description and the start of its text, with the browser URL.
- **No bucket, no problem.** When the binding is absent (local development, tests, a deployment before the bucket exists) or the bucket is empty, no project is published and every `/docs/<slug>` for one is a 404. Nothing else changes.

The bucket must exist before a deploy that declares it: `wrangler r2 bucket create devdogs-project-docs`.

## Onboard the first project

1. **Map entry.** Add the project to `.github/docs-projects.json` in a DevDogsUGA pull request (see above). Don't add a project whose docs directory doesn't exist yet.
2. **Source token.** Give `DOCS_SOURCE_TOKEN` read access (Contents and Metadata) to the project's repository. A fine-grained token lists repositories explicitly, so edit the token's repository selection.
3. **Bucket and publisher.** The bucket, the `docs-publishing` environment with its reviewers, and the publish credential and variables from the table below must exist. Set `DOCS_LIVE_BASE_URL` if the bucket is public, so the change summary can compare against the live version.
4. **First candidate, by hand.** `gh workflow run docs-candidate.yaml -f project=<slug> -f sha=<merge commit>`. Read the summary and the preview, then approve in the `docs-publishing` environment.
5. **Check it.** Open `/docs/<slug>` (allow up to a minute), try an image, search for a phrase from a page, and `curl devdogsuga.org/docs/<slug>`.
6. **Automatic candidates (stage D1).** The platform's GitHub webhook (`/github/webhook`, verified with `GH_WEBHOOK_SECRET`) sees a merge to a mapped repository's branch, looks the repository up in the same map, and sends the `repository_dispatch` of type `docs-candidate` with `{ "project": "<slug>", "sha": "<merge commit>" }` described above. Until D1 ships, ask for candidates by hand. The project repository needs its webhook pointed at the platform once; the dispatch itself only names the project and the commit, never a repository, branch or directory.

## Credentials

| Where                          | Name                                                           | Needs                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository secret              | `DOCS_SOURCE_TOKEN`                                            | Read-only on the mapped repositories: Contents and Metadata. Used by two steps in the build job. Because candidates can be built from any branch (to try a map change), anyone with write access to DevDogsUGA could read it through an edited workflow. That exposes read access to the mapped repositories only. |
| Repository variable (optional) | `DOCS_LIVE_BASE_URL`                                           | Public base URL of the docs content bucket, for the change summary.                                                                                                                                                                                                                                                |
| `docs-publishing` secrets      | `DOCS_PUBLISH_ACCESS_KEY_ID`, `DOCS_PUBLISH_SECRET_ACCESS_KEY` | An R2 token with Object Read and Write on the docs content bucket only. Not the app deploy token.                                                                                                                                                                                                                  |
| `docs-publishing` variables    | `DOCS_PUBLISH_BUCKET`, `DOCS_PUBLISH_ENDPOINT`                 | The bucket name and its S3 endpoint.                                                                                                                                                                                                                                                                               |

The build job has no publishing credential. The publish job has no source token and installs nothing.
