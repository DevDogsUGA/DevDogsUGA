---
name: Contributions
description: How commits reach member profiles, streaks and the First Commit badge - what the scheduled commit sync stores, how an author is matched to a member, and what a public profile may show.
order: 6
section: guides
---

# Contributions

A member's profile can list the commits they authored on the default branch of
a public repository DevDogs syncs. The platform reads them with a scheduled
commit sync, authenticated as the read-only GitHub App (`devdogs-platform`,
with a staging twin). There is no webhook: nothing is pushed to the platform,
and nothing about a pull request is stored.

## What counts

A commit counts when all three hold:

- it landed on the default branch of a repository in the sync's scope: every
  public repository in the `DevDogsUGA` organization, plus every public
  repository linked to a project;
- its GitHub author is a DevDogs member, matched by the author's numeric GitHub
  user id against the GitHub identity the member linked to their account
  (`auth.identities.provider_id`), never by login, committer, email or
  co-author trailer, all of which a person can change;
- the sync has recorded where it landed (`platform."repoCommits"` holds the
  repository and the default branch).

The date is the commit's `committedAt`. There is no allowlist and no review
step. Signing is not required, and nothing is shown as "verified".

The same table feeds three things: the weekly streak (any such commit lights its
week), the First Commit badge, and the commit citations of project reports.

## How an author becomes a member

The sync stores a commit only when its author already matches a linked member.
Nothing about anyone else is kept. When a member signs up with GitHub or links
it under Settings, Accounts, a database trigger queues a backfill
(`platform."commitBackfillRequests"`), and the next sync run lists that
member's commits on every in-scope repository and stores them. Linking GitHub
therefore brings the member's earlier commits with it; unlinking does not
remove commits already stored.

## Where it shows

- A public profile (`/community/@handle`, behind `publicProfilesEnabled`) shows
  a Contributions section while the member's "show contributions" switch is on
  (Settings, Profile). It lists commits newest first, each linked to its commit
  on GitHub, and **only commits in repositories that are still available**. A
  repository that turned private or went away is unavailable, and a public
  profile never names it. The streak is the same: a week lit by such a commit
  stays lit, and the profile shows only which weeks lit, never a repository.
- `/dashboard/attendance` shows the signed-in member their own list, including
  commits in repositories that have since become unavailable.
- `platform.commits` and `platform."repoCommits"` are server-only: no browser
  role can read or write them. Public reads go through the profile loaders,
  which resolve the member through the public-profile view first.

## First Commit

The First Commit badge goes to a member on their first stored commit. A
database trigger awards it in the same transaction that stores the commit,
once: if an officer withdrew it, it is never given again. `backstage import
badges` awards it for evidence that predates the trigger.

## Account deletion

A member's commits are deleted with their account (`userId` cascades from
`auth.users`), together with their `repoCommits` rows and the project-report
citations that pointed at them. Nothing about a non-member was ever stored, so
nothing is left behind, and a deleted member's commits do not come back: nothing
matches them any more.
