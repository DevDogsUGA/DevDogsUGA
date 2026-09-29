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
gh repo clone DevDogsUGA/Web-Workshops
cd Web-Workshops
# Start from Setup Night's code
git switch 01-nextjs-intro
# Install dependencies
pnpm install
```

## Project Setup

- Create a Supabase project at **supabase.com/dashboard** (it takes about a minute)
- Copy the **Project URL** and the **publishable key** from Project Settings → API
- Copy `.env.example` to `.env.local` and paste them in

```dotenv file=.env.example lines=1-4
# Copy this file to .env.local and fill in your own Supabase project's values.
# Find both on your project's dashboard under Project Settings > API.
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

<!-- prettier-ignore-end -->
