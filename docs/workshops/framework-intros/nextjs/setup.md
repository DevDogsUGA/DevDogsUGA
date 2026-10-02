---
name: "Get Set Up"
description: "Clone the workshop repo and run the starter app."
order: 0
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-nextjs-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Get Set Up

<!-- prettier-ignore-start -->

> [!NOTE]
> Adapted by Sloan Finger from Kyle Quach's Next.js workshop, Sep 21, 2026.

## What You'll Build

- A small personal site: a home page, an About section, and a Projects page
- A navigation bar shared by every page
- A guestbook visitors can sign

> [!IMPORTANT]
> Install Git, VS Code, Node and pnpm first: the [Prerequisites](/docs/workshops/getting-started/prerequisites#for-the-nextjs-track) cover all of them.

## Get the Workshop Code

```bash cwd=~
# Download the workshop repo
git clone https://github.com/DevDogsUGA/Web-Workshops
cd Web-Workshops
# Your own branch, starting from the course's first step
git switch -c <github-username>/01-nextjs-intro 01-nextjs-intro/00-start
# Install dependencies
pnpm install
```

Open the `Web-Workshops` folder in VS Code (`code .` from that terminal works too). Every step below ends at a checkpoint, so you can catch up if you fall behind.

<details>
<summary>Where does the starter come from?</summary>

`01-nextjs-intro/00-start` is a fresh app from `pnpm create next-app@latest my-app --yes`, trimmed down to one page.

</details>

## Run It

```bash cwd=~/Web-Workshops
# Start the dev server
pnpm dev
```

Open [localhost:3000](http://localhost:3000): a page with one heading. Leave the server running while you work; the page reloads every time you save a file.

> [!TIP]
> If something else already uses port 3000, run `pnpm dev --port 3001` and use that port instead.

<!-- prettier-ignore-end -->
