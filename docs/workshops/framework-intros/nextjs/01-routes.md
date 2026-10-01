---
name: "Routes"
description: "What Next.js adds to React, and how a folder becomes a page."
order: 1
checkpoint: "01-nextjs-intro/01-routes"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-nextjs-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Routes

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=01-nextjs-intro%2F01-routes&from=01-nextjs-intro%2F00-start)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. Where you changed the same lines, git asks you which to keep.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Save your own changes first
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 01-nextjs-intro/00-start
```

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes are lost.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/01-nextjs-intro 01-nextjs-intro/00-start
```

</details>

</div>

React is a library for building user interfaces out of components. Next.js is a framework around React that adds what a whole site needs: routing, server rendering, and data fetching. This step covers routing, how a URL finds its page.

## App Router, Not Pages Router

**App Router**, what we use:

- Lives in an `app/` directory
- The current default, and where the framework is heading
- Unlocks Server Components (step 5)

**Pages Router: the traditional way**

- Lives in a `pages/` directory
- Still supported, no longer the default
- Doesn't get the latest features

You'll see both in tutorials online. If a guide talks about `pages/`, it's the old router.

## Your Folder Is the URL

In the App Router, every folder inside `app` is a segment of the URL, and a `page.tsx` inside it is what that URL shows:

| Your folder                  | The URL         |
| ---------------------------- | --------------- |
| `app/page.tsx`               | `/`             |
| `app/create/page.tsx`        | `/create`       |
| `app/schedule/[id]/page.tsx` | `/schedule/123` |

A folder in square brackets, like `[id]`, matches any value in that spot, so one page serves every schedule.

## Special Files

A few file names mean something to Next.js wherever they appear in `app`:

| File            | What it is                                        |
| --------------- | ------------------------------------------------- |
| `page.tsx`      | The page itself.                                  |
| `layout.tsx`    | A shared wrapper around pages: a nav, a sidebar.  |
| `loading.tsx`   | Shown as a placeholder while the page loads.      |
| `error.tsx`     | Shown when something went wrong.                  |
| `not-found.tsx` | Shown when nothing matches the URL.               |

This workshop uses the first two.

## Add an About Page

Make a folder `app/about` with a `page.tsx` inside. The folder's name is the URL, so this page lives at `/about`. A page is a React component exported as the file's `default`, and whatever it returns is the page. Make it about you.

```tsx file=app/about/page.tsx lines=1-11 href=https://github.com/DevDogsUGA/Web-Workshops/blob/c4cd59ad401903217461952c21ae3c3e58ee4acd/app/about/page.tsx vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=01-nextjs-intro%2F01-routes&file=app%2Fabout%2Fpage.tsx
export default function AboutPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">About Me</h1>
      <p className="mt-4 text-gray-600">
        I study computer science at the University of Georgia and I&apos;m
        a focus lead for DevDogs.
      </p>
    </div>
  );
}
```

## Try It

Open [localhost:3000/about](http://localhost:3000/about). There's no link to it yet, so type the URL; the next step adds links.

<!-- prettier-ignore-end -->
