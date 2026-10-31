---
name: Previewing and checking project docs
description: How a project's owners read its docs/ folder from the default branch before it publishes, what "ready" means, and how to run the same check locally with devtools.
order: 11
section: infrastructure
---

# Previewing and checking project docs

A project's docs publish only after a reviewer approves a candidate (see [Project documentation](./project-docs.md)). Two tools let the project see what that candidate would be before anyone builds one: the **docs preview** and the **readiness check**. Both run the same compile and the same rules as the publishing build.

## The docs preview

Open the project in the dashboard and use **Open the docs preview** in its **Docs** panel, or go to `/dashboard/docs-preview/<slug>`. It renders the project's `docs/` folder as it is on the repository's default branch right now, in the docs layout, with a note on every page that code highlighting appears in the published copy.

- **Who.** A signed-in member who owns the project, has stored commits in one of its repositories, or holds the **Preview docs** permission. Everyone else gets a 404, as does a project with no approved, public repository to read, and the site's own bundled docs.
- **Which repository.** The project's chosen docs repository, or its only linked one. A project with several and no choice has nothing to preview yet.
- **What it reads.** The default branch's head, through the read-only GitHub App: the repository by id, the top of the tree to find `docs/`, then that folder and one request per file. The result is kept by commit, and the head itself is looked up again every 30 seconds, so a merge shows within about a minute.
- **Limits.** At most 90 files and 8 MB; a bigger folder is refused with the limit named. The publishing build allows more (300 files, 25 MB). Anything the build refuses outright (a symlink, a submodule, a bad file name) is refused before any file is read.
- **Highlighting.** A Worker cannot run Shiki's WebAssembly engine, so code blocks are framed, numbered and checked as they are in the build, but not coloured. Nothing else differs.
- **Never cached or indexed.** The pages are per-viewer, and images are served from `/dashboard/docs-preview-assets/<slug>/<commit>/…` under the same gate.

## Readiness

The same panel shows whether the folder is **ready to publish**, or lists each problem with its file. The rules are the publishing candidate's checks, because they are the same code (`packages/docs-kit/src/readiness.ts`):

- **Structure.** File names, types, sizes, counts and nesting are ones projects may use; there is an `index.md` overview page; every page has a title and some text.
- **Compile.** Every page and image passes the untrusted compiler: only the front matter keys `name`, `description`, `order`, `section`, `steps` and `os`, a valid `docs.manifest.json`, and nothing the HTML policy blocks (scripts, styles, classes, forms, external images, links out of the folder). Every failing file is listed, not only the first.
- **Links.** Every link to another page, and its heading anchor, resolves.

The publishing build runs the link rule too: a candidate with a broken internal link fails its checks.

## Check it locally

```bash
pnpm devtools docs check [<folder>]
```

Run it in a project repository and it checks `docs/` at the root; name a folder to check another. It prints one line when the folder is ready and one line per problem when it is not, and exits 1. The rules are not in devtools: it runs docs-kit's `readiness` from the DevDogsUGA checkout (`pnpm devdogsuga` links it), so a project is judged by the compiler its candidates are built with. In DevDogsUGA itself, whose `docs/` is the club's own, it needs a folder named.
