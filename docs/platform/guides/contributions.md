---
name: Contributions
description: How merged pull requests reach member profiles - the GitHub App webhook, how an author is matched to a member, the backfill, and what turning it on takes.
order: 6
section: guides
---

# Contributions

A member's profile can list the pull requests they got merged into DevDogs
repositories. The platform learns about them from a read-only GitHub App
(`devdogs-platform`, with a staging twin) that sends a webhook when a pull
request is merged.

## What counts

Any pull request authored by a member and merged into a repository of the
organization. The date is the merge date. There is no allowlist of repositories
and no review step; bots (Renovate, Dependabot) are skipped. The same table
later feeds streaks and badges (`getMergedPrsPerWeek`), and any merged pull
request counts toward a streak.

## How an author becomes a member

The webhook records every merged pull request, matched or not. The match is by
the author's numeric GitHub user id against the GitHub identity a member linked
to their account (`auth.identities.provider_id`), never by login, which a person
can rename. An author with no linked GitHub account is stored with no member.
When that person later signs up with GitHub or links it under Settings,
Accounts, a database trigger (`platform.claim_contributions`) claims every row
already recorded for their GitHub id.

Two limits to know. Rows are keyed on the repository's full name and PR number,
so renaming or transferring a repository makes a backfill record its PRs again
under the new name. And unlinking GitHub does not release a member's rows;
someone who later links that GitHub id gets only pull requests merged after.
The Contributions switch on Settings, Profile hides the section on the public
profile.

## Where it shows

- A public profile (`/community/@handle`, behind `publicProfilesEnabled`) shows
  a Contributions section while the member's "show contributions" switch is on.
  It lists only public repositories, newest first, each linked to its pull
  request.
- `/attendance` shows the signed-in member their own list, private repositories
  included.
- `platform.contributions` is server-only: no browser role can read or write it.
  Public reads go through the profile loaders, which resolve the member through
  the public-profile view first.

## Account deletion

A member's contribution rows are personal data and are deleted with their
account (`userId` cascades from `auth.users`). Rows with no member belong to no
account and stay. If a deleted member's old pull requests are backfilled again,
they come back as unmatched rows carrying only the public GitHub id and login.

## Turning the webhook on

Per environment (staging uses the staging twin of the App):

1. In the GitHub App (organization settings, Developer settings): repository
   permissions Metadata and Pull requests read-only, subscribe to **Pull
   request** events only, install on all repositories of the organization.
2. Set the webhook URL to `https://<platform host>/github/webhook`, content
   type `application/json`, and a random secret of at least 16 characters.
3. Put the secret in Bitwarden as `GH_WEBHOOK_SECRET` for that environment and
   push it with the rest of the Worker's secrets. `GH_APP_ID` and
   `GH_APP_PRIVATE_KEY` are already stored; the webhook itself needs only the
   secret, the backfill needs the other two.
4. Deploy, then use GitHub's **Advanced** tab on the App to redeliver the ping
   (answers `{"ok":"pong"}`) and a recent `pull_request` delivery (answers
   `{"recorded":true}` the first time and `{"duplicate":true}` after).

Until `GH_WEBHOOK_SECRET` is set the route answers `503`, and an unsigned or
wrongly signed request is `401`; every other delivery that is not a merged pull
request is answered `200` with the reason, so GitHub never retries it.

## Backfill

Run once after the webhook is on, from a checkout with production credentials:
preview with `--dry-run`, then run it for real, optionally from a start day with
`--since 2026-09-01`. The command is Backstage's `import contributions`
(documented in the Backstage README, and available once the Backstage release
that adds it is published and pinned here). It is idempotent, so it is safe to
rerun after an outage.
