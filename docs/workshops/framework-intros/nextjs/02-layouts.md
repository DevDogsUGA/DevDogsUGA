---
name: "Layouts and Links"
description: "Link pages together, and wrap a section in a layout that stays put as you navigate."
order: 2
checkpoint: "01-nextjs-intro/02-layouts"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-nextjs-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Layouts and Links

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=01-nextjs-intro%2F02-layouts&from=01-nextjs-intro%2F01-routes)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. Where you changed the same lines, git asks you which to keep.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Save your own changes first
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 01-nextjs-intro/01-routes
```

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes are lost.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/01-nextjs-intro 01-nextjs-intro/01-routes
```

</details>

</div>

Your About page has room for more than one page. This step adds a second page beneath it, links the two, and wraps both in a layout.

## Link

- Import `Link` from `next/link`
- Use it like an `<a>`, with `href` set to the page's URL
- It moves between pages without reloading the whole site, so navigating feels instant

**A link**

```tsx
<Link href="/about">About Me</Link>
```

## Layout, Layout, Layout

- A `layout.tsx` wraps every page in its folder, and every folder beneath it
- Layouts nest: each layer wraps everything below it
- A layout doesn't re-render when you move between the pages it wraps

**What this means**

Whatever the layout holds, like a sidebar or a nav, doesn't flicker every time you click something.

## A Page Inside a Page

A folder inside `about` is a URL inside `/about`: this page is `/about/moreAbout`. Swap in a fun fact about yourself.

```tsx file=app/about/moreAbout/page.tsx lines=1-10 href=https://github.com/DevDogsUGA/Web-Workshops/blob/d561f793fa4ecdf54eda0dbef91d4b86b5ae08f6/app/about/moreAbout/page.tsx vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=01-nextjs-intro%2F02-layouts&file=app%2Fabout%2FmoreAbout%2Fpage.tsx
export default function MoreAboutPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">More About Me</h1>
      <p className="mt-4 text-gray-600">
        This is where you&apos;d put a fun fact about yourself.
      </p>
    </div>
  );
}
```

## Wrap the About Section

`layout.tsx` in `app/about` wraps both About pages. It gets the page being shown as `children`, and puts it in the `<section>`, beside a list of links. `Link` works for other sites too: put your own GitHub handle in the first one.

```tsx file=app/about/layout.tsx lines=1-13 href=https://github.com/DevDogsUGA/Web-Workshops/blob/d561f793fa4ecdf54eda0dbef91d4b86b5ae08f6/app/about/layout.tsx vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=01-nextjs-intro%2F02-layouts&file=app%2Fabout%2Flayout.tsx
import Link from "next/link";

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-8">
      <ul>
        <li><Link href="https://github.com/your-handle">GitHub</Link></li>
        <li><Link href="/about/moreAbout">Even More About Me</Link></li>
      </ul>
      <section className="flex-1">{children}</section>
    </div>
  );
}
```

## Try It

Open [localhost:3000/about](http://localhost:3000/about) and click **Even More About Me**. The page changes, but the links beside it stay where they are: they belong to the layout, not the page.

<!-- prettier-ignore-end -->
