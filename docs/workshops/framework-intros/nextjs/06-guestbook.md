---
name: "Guestbook"
description: "Put routes, components and state together in a guestbook visitors can sign."
order: 6
checkpoint: "01-nextjs-intro/06-guestbook"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-nextjs-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Guestbook

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=01-nextjs-intro%2F06-guestbook&from=01-nextjs-intro%2F05-interactivity)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. Where you changed the same lines, git asks you which to keep.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Save your own changes first
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 01-nextjs-intro/05-interactivity
```

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes are lost.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/01-nextjs-intro 01-nextjs-intro/05-interactivity
```

</details>

</div>

A guestbook uses everything so far: a new route, a link in the navbar, and a Client Component that holds state. This time the state is a whole list.

## Link It From the Navbar

One more link in the navbar, to a page you'll make next.

```diff file=components/Navbar.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/a379b7772784062d9dc60af6ed1af41007893c16...062a77d02cc1fc92d4dde9f138aba594bada96ba#diff-e7b4dc7397284cbc0d49c6bc13d16309470409bda06a199aa6eb9d9d61b573b8 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=01-nextjs-intro%2F06-guestbook&from=01-nextjs-intro%2F05-interactivity&file=components%2FNavbar.tsx
--- a/components/Navbar.tsx
+++ b/components/Navbar.tsx
@@ -1,19 +1,20 @@
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
+          <li><Link href="/guestbook">Guestbook</Link></li>
         </ul>
       </div>
     </nav>
   );
 }
```

[The whole `components/Navbar.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/062a77d02cc1fc92d4dde9f138aba594bada96ba/components/Navbar.tsx)

## The Guestbook Page

The page itself is a Server Component, like every page so far. It renders `<Guestbook />`, the interactive part, which lives in `components`.

```tsx file=app/guestbook/page.tsx lines=1-13 href=https://github.com/DevDogsUGA/Web-Workshops/blob/062a77d02cc1fc92d4dde9f138aba594bada96ba/app/guestbook/page.tsx vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=01-nextjs-intro%2F06-guestbook&file=app%2Fguestbook%2Fpage.tsx
import Guestbook from "../../components/Guestbook";

export default function GuestbookPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Guestbook</h1>
      <p className="mt-4 text-gray-600">Sign in and leave a note for the next visitor.</p>
      <div className="mt-6">
        <Guestbook />
      </div>
    </div>
  );
}
```

## The Guestbook Component

`Guestbook` is a Client Component: it holds state, and its form reacts to typing. `Entry` describes one message. The component keeps three pieces of state: the list of entries, and what's typed in each field so far.

```tsx file=components/Guestbook.tsx lines=1-14 href=https://github.com/DevDogsUGA/Web-Workshops/blob/062a77d02cc1fc92d4dde9f138aba594bada96ba/components/Guestbook.tsx#L1-L14 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=01-nextjs-intro%2F06-guestbook&file=components%2FGuestbook.tsx&lines=1-14
"use client";

import { useState } from "react";

type Entry = {
  name: string;
  message: string;
  postedAt: Date;
};

export default function Guestbook() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
```

`handleSubmit` runs when the form is sent. `preventDefault` stops the browser's default for a form, which is to reload the page. An entry with nothing but spaces is turned away. A new entry goes at the front of a new array, so the newest shows first, and both fields clear.

```tsx file=components/Guestbook.tsx lines=16-34 href=https://github.com/DevDogsUGA/Web-Workshops/blob/062a77d02cc1fc92d4dde9f138aba594bada96ba/components/Guestbook.tsx#L16-L34 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=01-nextjs-intro%2F06-guestbook&file=components%2FGuestbook.tsx&lines=16-34
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Reject empty entries (after trimming whitespace).
    if (name.trim() === "" || message.trim() === "") {
      return;
    }

    const newEntry: Entry = {
      name: name.trim(),
      message: message.trim(),
      postedAt: new Date(),
    };

    // Newest entries show up first.
    setEntries([newEntry, ...entries]);
    setName("");
    setMessage("");
  }
```

Each field is controlled: its `value` comes from state, and `onChange` writes every keystroke back to it. That's how `handleSubmit` can read the fields and clear them.

```tsx file=components/Guestbook.tsx lines=36-58 href=https://github.com/DevDogsUGA/Web-Workshops/blob/062a77d02cc1fc92d4dde9f138aba594bada96ba/components/Guestbook.tsx#L36-L58 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=01-nextjs-intro%2F06-guestbook&file=components%2FGuestbook.tsx&lines=36-58
  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          className="rounded-lg border border-gray-300 px-3 py-2"
        />
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Leave a message"
          className="rounded-lg border border-gray-300 px-3 py-2"
        />
        <button
          type="submit"
          className="self-start rounded-lg bg-black px-4 py-2 text-white"
        >
          Sign the guestbook
        </button>
      </form>
```

The list renders with `.map`, like the projects did, with the time each entry was posted.

```tsx file=components/Guestbook.tsx lines=60-79 href=https://github.com/DevDogsUGA/Web-Workshops/blob/062a77d02cc1fc92d4dde9f138aba594bada96ba/components/Guestbook.tsx#L60-L79 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=01-nextjs-intro%2F06-guestbook&file=components%2FGuestbook.tsx&lines=60-79
      <p className="mt-2 text-sm text-gray-500">
        Entries live only in this browser tab. Refreshing the page clears them.
      </p>

      <ul className="mt-6 space-y-4">
        {entries.map((entry, index) => (
          <li key={index} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{entry.name}</h2>
              <span className="text-sm text-gray-500">
                {entry.postedAt.toLocaleTimeString()}
              </span>
            </div>
            <p className="mt-1 text-gray-600">{entry.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

[The whole `components/Guestbook.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/062a77d02cc1fc92d4dde9f138aba594bada96ba/components/Guestbook.tsx)

## Refresh It

Sign the guestbook a few times, then refresh the page. The entries are gone: they only ever lived in the component's state, in that one browser tab.

Giving them somewhere to live is what the [Supabase workshop](/docs/workshops/supabase/nextjs/setup) does next, starting from exactly this code.

## Keep Going

1. [nextjs.org/learn](https://nextjs.org/learn), a free course covering the whole framework
1. [The App Router docs](https://nextjs.org/docs/app)
1. [react.dev/learn](https://react.dev/learn), to learn React or brush up
1. Ready to contribute? Start with DogDays' [Your first contribution](/docs/schedule-builder/getting-started/first-contribution)

<!-- prettier-ignore-end -->
