---
name: Competitions
description: A competition is a GitHub issue mirror now — the private Competitions Project, draft-to-issue conversion as kickoff, and merging the winning pull request as the only persisted outcome.
order: 3
section: guides
---

# Competitions

A competition is no longer a schedule item this platform owns — it is a
**mirror of a GitHub issue**, source-of-truth on GitHub the same way a team
is a mirror of a GitHub branch. Read this before changing
`server/github/competitions.ts`, `server/github/competitionEvents.ts`,
`server/github/pullRequest.ts` or `server/github/prEvent.ts`; for the
exported functions, see the generated
`server/github` source.

## How an officer runs one

1. **Create a draft item** in the private "Competitions" GitHub Project (a
   Projects v2 board, org-level). Its own title (every Project item has one —
   GitHub's built-in field, not a custom one) becomes the competition's title
   once it converts. Optionally fill in "Judging/End Date" — display-only,
   never a deadline the platform enforces. Write the brief as the draft
   item's own body, in markdown, starting from the
   [brief template](https://github.com/DevDogsUGA/Backstage/blob/main/competitions/TEMPLATE.md).
2. **Convert the draft into a real issue** in `GITHUB_ORG/GITHUB_COMPETITION_REPO`
   (GitHub's own "Convert to issue" action on the item). This is **kickoff**.
   The platform mirrors the new issue into `platform.competitions` within
   moments, over a `projects_v2_item` webhook — a nightly reconcile is the
   backstop if a delivery is ever missed.
3. **Teams enter** by opening a pull request from their `team/<slug>` branch
   into `main` that links the competition's issue (`Closes #123`,
   `owner/repo#123`, or a full issue URL — GitHub's own "Development"
   issue-linking UI writes one of these into the PR body). The platform
   recognizes the entry within moments, over a `pull_request` webhook — see
   [Stars & streaks](./stars-and-awards.md)
   for `platform.competitionEntries`, the mirror this writes.
4. **Score off-platform** — a live demo night, officer scores, member voting,
   whatever the club runs that week. The platform holds no rubric, no ballot,
   no tally.
5. **Merge the winning pull request.** The merge itself IS the signal: there
   is no separate step to record a winner. `competitionEntries."mergedAt"`,
   set from the same `pull_request` webhook, is the only "who won" this
   platform keeps.
6. **Close the issue.** Closing is what the mirror reads as "this competition
   is over" — `competitions."closedAt"`, set by the `issues` webhook the
   moment GitHub reports the close, or by the nightly reconcile.

## One custom field, read by name

The Project needs exactly one custom field, **"Judging/End Date"** (date) —
the name matters, because `server/github/competitions.ts` reads it by name,
not by id. There is deliberately no custom "Title" field: GitHub Projects v2
already has a BUILT-IN field of that name (`ProjectV2FieldType.TITLE`), a
custom field can only be DATE/ITERATION/MULTI_SELECT/NUMBER/SINGLE_SELECT/TEXT
— never TITLE — so a custom "Title" field cannot exist, and a competition's
title is simply the converted issue's own title. Renaming "Judging/End Date",
deleting it, or retyping it (a single-select, say) is **Project-shape
drift**: the ingestion refuses to guess at a missing or retyped field,
reports the drift to Sentry (the same channel Airtable's `verifyBase` used to
alert through, before Airtable stopped being competitions' CMS), and skips
the item it was reading rather than applying a half-parsed row. The next
successful webhook delivery or nightly reconcile picks up right where the
drift left off, once the field is fixed.

The Project also carries fields the platform never reads, kept for the
Roadmap view only: **"Project"** (single-select, which DevDogs project the
competition belongs to) and **"Start Date"** (date, planned kickoff) — the
Roadmap plots each item from Start Date to Judging/End Date. Likewise, a
converted issue gets the org-level issue type **"Competition"** for humans
browsing the repo's issue list; the platform never reads it. Board membership
— the item having gone through this Project at all — remains the only test
this platform runs.

## What the platform mirrors, and what it does not

`platform.competitions` carries the issue's node id (unique — the identity
every write keys on), number, repo, url, a **slug** derived from the title
and issue number for the platform's own URLs, the **title** (the converted
issue's own title), the **brief** (the issue body, markdown), `plannedEndAt`
(display-only), `kickedOffAt` (when the draft converted), `closedAt`, and
`githubSyncedAt` (freshness, mirroring `teams."githubSyncedAt"`'s role).

There is no `deletedAt`. A mirrored competition never soft-archives the way a
meeting or workshop can — see the next section for what a Project item
leaving the Project does instead.

**Membership in the Competitions Project is the whole test.** An issue in
`GITHUB_COMPETITION_REPO` that never went through this Project — filed
directly, or converted from a draft in some other Project — is simply never
named here; this platform never scans the repo's issues looking for
competitions.

## `deleted` / `archived` Project items

The simplest faithful behaviour: nothing. A competition that has already
kicked off keeps its mirror row exactly as it last synced when its Project
item is later deleted or archived — the issue itself is unaffected by an item
leaving the Project, so there is nothing to correct, and the ingestion module
simply stops being asked to refresh that row. A draft deleted or archived
before conversion never had a row to begin with, so there is nothing to
remove either way.

## The three triggers

`projects_v2_item` webhooks (`converted` = kickoff, `edited` = a field or the
item's content changed) and `issues` webhooks (`closed`, `reopened`, `edited`,
for an issue this table already mirrors) keep `platform.competitions`
current, wired from `/github/webhook` after the signature is verified — see
`server/github/competitionEvents.ts`. `pull_request` webhooks (`opened`,
`edited`, `reopened`, `closed`) keep `platform.competitionEntries` current
the same way — see `server/github/prEvent.ts` and
[Stars & streaks](./stars-and-awards.md)
for what that table is and who reads it.

The nightly `/cron/github-reconcile` pass is the backstop for all three: it
pages through the whole Project and re-applies every converted item it
finds, and re-derives every entry from the repo's own pull request list
(`reconcileEntries`). The same "GitHub webhooks in near-real-time, a nightly
pass for what neither reached" shape
[Teams](./teams.md) uses for the branch
mirror.

## Followups still open

Two things only Sloan can do:

- **Create the "Competitions" Project** with its "Judging/End Date" custom
  field, note its GraphQL node id (`gh project view <number> --owner
DevDogsUGA --format json --jq .id`), and set `GH_COMPETITIONS_PROJECT_ID`.
  Unset, ingestion is a logged no-op — the platform boots without a Project
  configured, the same contract the Airtable integration used to have.
- **Enable the `projects_v2_item`, `issues` and `pull_request` webhooks**,
  and grant the GitHub App org-level Projects **read** permission — without
  it, GraphQL reads against the Project fail even with the node id
  configured correctly.
