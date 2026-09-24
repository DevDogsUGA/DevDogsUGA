---
name: Getting Started
description: What a member needs to enter a feature competition — signing in, linking GitHub, forming or joining a team, and opening the entry pull request.
order: 1
---

# Getting Started

This is the path from "I want to enter" to an open pull request, for a member entering a feature competition. Each step links to the guide that covers its mechanics in depth; this page is only the order they happen in.

## 1. Sign in

[devdogsuga.org](https://devdogsuga.org) signs you in with your UGA Google account — the "Sign In" button redirects to Google OAuth restricted to `@uga.edu`. There is no separate DevDogs password.

## 2. Link GitHub

Go to [`/account`](https://devdogsuga.org/account) → **Connected Accounts** → **GitHub**, and sign in with GitHub when prompted. Linking does two things at once: it adds you to the `DevDogsUGA` GitHub organization, and it is what every team action below checks for. Joining or creating a team without it fails with a pointer back to this same page.

> [!NOTE]
> GitHub organization membership requiring two-factor authentication is the intended state, not the current one — team creation, joining and invite acceptance do not check for it yet. Enable it anyway, under GitHub's own **Settings → Password and authentication**, before it becomes a hard gate.

See [Identity](/docs/platform/guides/identity) for how linking works and what it is not — it does not replace UGA sign-in, and it is a different credential from the DevDogs GitHub App that administers the organization.

## 3. Get on a team

A team is a persistent group, not something scoped to one competition — see [Teams](/docs/platform/guides/meetings-and-teams/teams) for the full model. From [`/teams`](https://devdogsuga.org/teams):

- **Start one.** Type a name and submit — you become its lead. This provisions the team's GitHub team, its `team/<slug>` branch off `main`, and the push grant narrowed to that branch, all before anything is shown to you.
- **Join with a code.** A lead gives out a six-character join code (no `O`, `I`, `0`, or `1` — it is meant to be read aloud). Enter it on `/teams` or on the team's own page.
- **Ask to join.** A team that is not handing out its code may still accept requests. Send one from the team's page, with an optional message; the lead answers it at [`/teams/requests`](https://devdogsuga.org/teams/requests).

A join code or a request are the two ways onto a team today. Inviting someone directly by email or GitHub username is planned — the server side (`inviteToTeam`) already exists — but there is no form wired up to it yet.

You can be active on up to four teams at once (a team caps out at four members), so joining a couple and going with whichever answers first is a reasonable way to look for one.

## 4. Clone the repo and install

```bash
git clone https://github.com/DevDogsUGA/DevDogsUGA.git
cd DevDogsUGA
corepack enable && pnpm install
```

Every workspace dependency, including the shared `@devdogsuga/*` packages, resolves from the install — there is no sibling repository to check out alongside this one. See [Quickstart](/docs/monorepo/guides/quickstart) if you also need a running dev server and a database; entering a competition does not require either unless the brief does.

## 5. Push to your team's branch

Your team's branch is `team/<slug>`, cut from `main` when the team was created. Being an active member is what grants push access to it — GitHub, not this repository's settings, is what enforces that:

```bash
git checkout team/<your-team-slug>
git pull
# make your changes, commit
git push
```

You cannot push anywhere but your own team's branch: the ruleset that comes with the team narrows its grant to that one ref.

## 6. Open the entry pull request

Open a pull request from `team/<slug>` into `main` that links the competition's issue — `Closes #123`, `owner/repo#123`, or GitHub's own "Development" issue-linking sidebar all work. The platform picks up the link within moments over a webhook and lists your team as an entrant; see [Competitions](/docs/platform/guides/meetings-and-teams/competitions) for what happens after that (scoring is off-platform, and the merge itself is the only "who won" the platform records).

CI runs lint, typecheck, tests and a build on every pull request with no credentials in scope, so a fork's worth of secrets is never something to worry about here — there simply are none in that job. Every pull request needs a review from `@DevDogsUGA/reviewers` before it can merge.

## Read next

- [Teams](/docs/platform/guides/meetings-and-teams/teams) — the two caps, invitations and requests as one table, and disbanding.
- [Competitions](/docs/platform/guides/meetings-and-teams/competitions) — kickoff, entries, and how a winner is recorded.
- [Identity](/docs/platform/guides/identity) — the difference between signing in and linking GitHub.
- [Quickstart](/docs/monorepo/guides/quickstart) — running the app and a database locally, if your entry needs either.
