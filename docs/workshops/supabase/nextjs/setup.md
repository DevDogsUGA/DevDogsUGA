---
name: "Get Set Up"
description: "Clone the workshop repo, create a Supabase project, and point the app at it."
order: 0
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Get Set Up

<!-- prettier-ignore-start -->

## Get the Workshop Code

```bash cwd=~
# Download the workshop repo
git clone https://github.com/DevDogsUGA/Web-Workshops
cd Web-Workshops
# Your own branch, starting from the Framework Intros code
git switch -c <github-username>/02-supabase origin/01-nextjs-intro
# Install dependencies
pnpm install
```

## Project Setup

- Create a Supabase project at **supabase.com/dashboard** (it takes about a minute)
- Copy the **Project URL** and the **publishable key** from Project Settings → API
- Copy `.env.example` to `.env.local` and paste them in

```dotenv file=.env.example lines=1-4 href=https://github.com/DevDogsUGA/Web-Workshops/blob/8f26e3ad3d31168d85c4e4b402f59da66376522f/.env.example vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F05-delete&file=.env.example
# Copy this file to .env.local and fill in your own Supabase project's values.
# Find both on your project's dashboard under Project Settings > API.
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

<!-- prettier-ignore-end -->
