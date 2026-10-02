---
name: "Components"
description: "Build a navigation bar once, and put it on every page."
order: 4
checkpoint: "01-nextjs-intro/04-components"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-nextjs-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Components

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=01-nextjs-intro%2F04-components&from=01-nextjs-intro%2F03-projects)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. `git commit` needs your name and email set once: see [Git and a GitHub account](/docs/workshops/getting-started/prerequisites#git-and-a-github-account).

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Save your own changes first (fine if there's nothing to save)
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 01-nextjs-intro/03-projects
```

Where you and the step changed the same lines, the merge stops with a conflict. Open each file git lists, keep the code you want between the `<<<<<<<` and `>>>>>>>` markers, delete the markers, then finish with `git add -A` and `git commit --no-edit`. To back out instead, run `git merge --abort`.

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes to the step's files are lost; new files you made stay. If you're in the middle of a merge, run `git merge --abort` first.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/01-nextjs-intro 01-nextjs-intro/03-projects
```

</details>

</div>

A component is a reusable building block of a user interface: you write it once and use it anywhere. Every page so far is one. This step makes one that isn't a page: a navigation bar.

## Where Components Live

> [!IMPORTANT]
> Make a `components` folder beside `app`, not inside it. Inside `app`, folders are routes. Outside it, a file is just code you import.

<details>
<summary>Which components come built in to Next.js?</summary>

- **`Link`** (`next/link`) moves between pages without a full reload
- **`Image`** (`next/image`) resizes images and serves smaller formats, so pages load faster
- **`Script`** (`next/script`) controls when a script loads, so it doesn't slow the page down

</details>

## A Navigation Bar

`Navbar` returns a `<nav>`: your name on the left, and a `Link` to each page on the right.

```tsx file=components/Navbar.tsx lines=1-19 href=https://github.com/DevDogsUGA/Web-Workshops/blob/ba383ad4a5412efadb04a92691f253fbd5157259/components/Navbar.tsx vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=01-nextjs-intro%2F04-components&file=components%2FNavbar.tsx
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="border-b border-gray-200">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold">
          Your Name
        </Link>

        <ul className="flex gap-6">
          <li><Link href="/">Home</Link></li>
          <li><Link href="/projects">Projects</Link></li>
          <li><Link href="/about">About Me</Link></li>
        </ul>
      </div>
    </nav>
  );
}
```

## Use It in the Root Layout

`app/layout.tsx` is the root layout: it wraps every page in the app. Import `Navbar` and put `<Navbar />` above the page, and every page gets it. `<main>` gives every page the same width and padding.

```diff file=app/layout.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/53190053c661482af5c9b494f87cc438b8b2b8b3...ba383ad4a5412efadb04a92691f253fbd5157259#diff-eca96d2c09f31517696a26e1d0be4070e1fbab02831481bed006e275741d030b vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=01-nextjs-intro%2F04-components&from=01-nextjs-intro%2F03-projects&file=app%2Flayout.tsx
--- a/app/layout.tsx
+++ b/app/layout.tsx
@@ -1,15 +1,19 @@
 import type { Metadata } from "next";
 import "./globals.css";
+import Navbar from "../components/Navbar";

 export const metadata: Metadata = {
   title: "DevDogs at UGA Workshops",
   description: "Starter code and finished workshops from DevDogs at UGA.",
 };

 export default function RootLayout({ children }: LayoutProps<"/">) {
   return (
     <html lang="en" className="h-full antialiased">
-      <body className="min-h-full flex flex-col">{children}</body>
+      <body className="min-h-full flex flex-col">
+        <Navbar />
+        <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
+      </body>
     </html>
   );
 }
```

[The whole `app/layout.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/ba383ad4a5412efadb04a92691f253fbd5157259/app/layout.tsx)

## Tidy the Home Page

The home page had its own `<main>`. The root layout provides one now, so the page's becomes a plain `<div>`.

```diff file=app/page.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/53190053c661482af5c9b494f87cc438b8b2b8b3...ba383ad4a5412efadb04a92691f253fbd5157259#diff-6efdf509a785a0658b2e31a8c33d298de14321d9672179370e99cc76241c1eb0 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=01-nextjs-intro%2F04-components&from=01-nextjs-intro%2F03-projects&file=app%2Fpage.tsx
--- a/app/page.tsx
+++ b/app/page.tsx
@@ -1,7 +1,7 @@
 export default function HomePage() {
   return (
-    <main className="flex flex-1 items-center justify-center p-16">
+    <div>
       <h1 className="text-3xl font-semibold">DevDogs at UGA Workshops</h1>
-    </main>
+    </div>
   );
 }
```

[The whole `app/page.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/ba383ad4a5412efadb04a92691f253fbd5157259/app/page.tsx)

## Try It

Every page now has the navbar. Click through Home, Projects and About: the navbar stays put, because the root layout holds it.

<!-- prettier-ignore-end -->
