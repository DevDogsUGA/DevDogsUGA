---
name: "Interactivity"
description: "Make a button work with state, and learn which components run in the browser."
order: 5
checkpoint: "01-nextjs-intro/05-interactivity"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-nextjs-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Interactivity

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=01-nextjs-intro%2F05-interactivity&from=01-nextjs-intro%2F04-components)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. `git commit` needs your name and email set once: see [Git and a GitHub account](../../../_shared/getting-started/prerequisites.md#git-and-a-github-account).

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Save your own changes first (fine if there's nothing to save)
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 01-nextjs-intro/04-components
```

Where you and the step changed the same lines, the merge stops with a conflict. Open each file git lists, keep the code you want between the `<<<<<<<` and `>>>>>>>` markers, delete the markers, then finish with `git add -A` and `git commit --no-edit`. To back out instead, run `git merge --abort`.

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes to the step's files are lost; new files you made stay. If you're in the middle of a merge, run `git merge --abort` first.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/01-nextjs-intro 01-nextjs-intro/04-components
```

</details>

</div>

Everything so far renders on the server: Next.js sends finished HTML, and no JavaScript for those components. A button that counts its clicks has to run in the browser. This step adds one.

## A Counter on the Home Page

Swap the home page's heading for a `Counter` component. You'll write it next.

```diff file=app/page.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/ba383ad4a5412efadb04a92691f253fbd5157259...a379b7772784062d9dc60af6ed1af41007893c16#diff-6efdf509a785a0658b2e31a8c33d298de14321d9672179370e99cc76241c1eb0 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=01-nextjs-intro%2F05-interactivity&from=01-nextjs-intro%2F04-components&file=app%2Fpage.tsx
--- a/app/page.tsx
+++ b/app/page.tsx
@@ -1,7 +1,9 @@
+import Counter from "../components/Counter";
+
 export default function HomePage() {
   return (
-    <div>
-      <h1 className="text-3xl font-semibold">DevDogs at UGA Workshops</h1>
+    <div className="home">
+      <Counter />
     </div>
   );
 }
```

[The whole `app/page.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/a379b7772784062d9dc60af6ed1af41007893c16/app/page.tsx)

## Why Doesn't My Button Work?

Here's a first try at `components/Counter.tsx`:

```tsx
import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>Add One to Count: {count}</button>
  );
}
```

`useState` keeps a value between renders, and `setCount` changes it and redraws the button. But instead of a page, Next.js shows an error:

```text
You're importing a module that depends on `useState` into a React Server
Component module. This API is only available in Client Components. To fix,
mark the file (or its parent) with the "use client" directive.
```

## Server and Client Components

**Server Component**, the default:

- Runs on the server only
- Ships zero JavaScript to the browser
- Can fetch data directly, with no API layer in between

**Client Component: you ask for it**

- Marked with `"use client"` at the top of the file
- Needed for state, effects, and event handlers like `onClick`
- For anything interactive: inputs, buttons, things that change

## Make It a Client Component

`"use client"` on the first line makes `Counter` a Client Component, and the button counts.

```tsx file=components/Counter.tsx lines=1-11 href=https://github.com/DevDogsUGA/Web-Workshops/blob/a379b7772784062d9dc60af6ed1af41007893c16/components/Counter.tsx vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=01-nextjs-intro%2F05-interactivity&file=components%2FCounter.tsx
"use client";

import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>Add One to Count: {count}</button>
  );
}
```

## Try It

> [!TIP]
> Keep the server the default: mark the smallest piece that needs to be interactive, like this button, not the page around it.

Open [localhost:3000](http://localhost:3000). The home page is just the button for now, under the navbar. Click it: the count goes up with each click. Refresh, and it starts from zero again.

<!-- prettier-ignore-end -->
