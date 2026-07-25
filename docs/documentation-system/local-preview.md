# Local Docs Preview

The local preview tool lets you see exactly how your documentation changes will look on the live site — before pushing to GitHub. It uses the same rendering pipeline as the live site, so what you see in preview is what gets deployed.

## Setup

Start the preview server alongside the Next.js dev server:

```bash
pnpm docs:preview
```

This starts a lightweight file server at `localhost:4987` that watches your local `docs/` folder and streams change events over a WebSocket.

In a second terminal (or the same, if you have `pnpm dev` already running):

```bash
pnpm dev
```

Then open [http://localhost:3000/tools/testing/docs](http://localhost:3000/tools/testing/docs) in your browser.

## Live reload

When you save a markdown file, the preview page refreshes automatically within a second. No manual reload is needed. The page calls `router.refresh()` on the Next.js side, which re-runs the server component and re-fetches the file from the preview server.

## Page routing

The preview routes mirror the live docs URL structure:

| Preview URL                                | Local file                |
| ------------------------------------------ | ------------------------- |
| `/tools/testing/docs`                      | `README.md`               |
| `/tools/testing/docs/docs/getting-started` | `docs/getting-started.md` |
| `/tools/testing/docs/CONTRIBUTING`         | `CONTRIBUTING.md`         |

> [!NOTE]
> The preview tool is only available when `pnpm docs:preview` is running locally. In production (Vercel), the tool returns a 404 for all paths, which is expected.

## Fallback behavior

If a file doesn't exist locally, the preview falls back to the org's `.github` repository on GitHub (for SCREAMING_SNAKE_CASE intro files like `CONTRIBUTING.md`). This means you'll see org-level defaults for files you haven't created locally yet.

## Rendering parity

The preview and live docs share the same `DocPageContent` component. Both render:

- Syntax-highlighted code blocks (Shiki)
- `> [!NOTE]` / `> [!WARNING]` / `> [!TIP]` admonitions
- Code tabs
- Table of contents (right-side on desktop, collapsible on mobile)
- Breadcrumb navigation

The only difference is that the live site shows breadcrumbs derived from the GitHub repo/branch, while the preview shows a simple "Preview" breadcrumb.
