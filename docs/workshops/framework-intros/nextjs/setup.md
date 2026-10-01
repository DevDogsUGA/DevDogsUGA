---
name: "Get Set Up"
description: "Clone the workshop repo and run the starter app."
order: 0
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-nextjs-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Get Set Up

<!-- prettier-ignore-start -->

## What You'll Build

- A small personal site: a home page, an About section, and a Projects page
- A navigation bar shared by every page
- A guestbook visitors can sign

**Before you start**

Install Git, VS Code, Node and pnpm first: the [Prerequisites](/docs/workshops/getting-started/prerequisites#for-the-nextjs-track) cover all of them.

This course is adapted by Sloan Finger from Kyle Quach's Next.js workshop at Framework Intros, Sep 21, 2026.

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

The workshop started from `pnpm create next-app@latest my-app --yes`, which makes a fresh Next.js app. The repo's `main` branch is that same starter, trimmed down, so every step below has a checkpoint to catch up to if you fall behind.

## Run It

```bash cwd=~/Web-Workshops
# Start the dev server
pnpm dev
```

Open [localhost:3000](http://localhost:3000): a page with one heading. Leave the server running while you work; the page reloads every time you save a file.

<!-- prettier-ignore-end -->
