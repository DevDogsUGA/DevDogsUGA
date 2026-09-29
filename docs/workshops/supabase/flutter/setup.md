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
git clone https://github.com/DevDogsUGA/Mobile-Workshops
cd Mobile-Workshops
# Your own branch, starting from Setup Night's code
git switch -c <github-username>/02-supabase origin/01-flutter-intro
# Install dependencies
flutter pub get
```

## Project Setup

- Create a Supabase project at **supabase.com/dashboard** (it takes about a minute)
- Copy the **Project URL** and the **publishable key** from Project Settings → API
- Copy `.env.example` to `.env.local` and paste them in

```dotenv file=.env.example lines=1-7 href=https://github.com/DevDogsUGA/Mobile-Workshops/blob/0071976d48b00aa6f2786ac792f0273fae469f7d/.env.example
# Copy this file to .env.local and fill in your own Supabase project's values.
# Find both on your project's dashboard under Project Settings > API.
#
# .env.local is read by `--dart-define-from-file` (see the README), not by
# Flutter itself -- there's no dotenv package involved.
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

<!-- prettier-ignore-end -->
