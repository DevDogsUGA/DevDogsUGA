---
name: Competitions
description: A competition is a GitHub issue mirror now — the private Competitions Project, draft-to-issue conversion as kickoff, and merging the winning pull request as the only persisted outcome.
order: 3
---

# Competitions

A competition is no longer a schedule item this platform owns — it is a
**mirror of a GitHub issue**, source-of-truth on GitHub the same way a team
is a mirror of a GitHub branch. Read this before changing
`server/github/competitions.ts` or `server/github/competitionEvents.ts`; for
the exported functions, see the generated
[`server/github`](/docs/platform/reference/server/github) reference.

## How an officer runs one

1. **Create a draft item** in the private "Competitions" GitHub Project (a
   Projects v2 board, org-level). Fill in its "Title" field and, optionally,
   "Judging/End Date" — display-only, never a deadline the platform enforces.
   Write the brief as the draft item's own body, in markdown.
2. **Convert the draft into a real issue** in `GITHUB_ORG/GITHUB_COMPETITION_REPO`
   (GitHub's own "Convert to issue" action on the item). This is **kickoff**.
   The platform mirrors the new issue into `platform.competitions` within
   moments, over a `projects_v2_item` webhook — a nightly reconcile is the
   backstop if a delivery is ever missed.
3. **Teams enter** by opening a pull request from their `team/<slug>` branch
   into `main` that links the competition's issue (`Closes #123` or GitHub's
   own "Development" issue-linking UI). Nothing here is enforced by the
   platform; every rule about what makes a valid entry lives in the repo's
   own PR conventions.
4. **Score off-platform** — a live demo night, officer scores, member voting,
   whatever the club runs that week. The platform holds no rubric, no ballot,
   no tally.
5. **Merge the winning pull request.** The merge itself is not read as a
   signal yet — recording who won is a manual step, `awardTeam`, an officer's
   own record of the outcome (unchanged from before this step; see
   [Stars & streaks](/docs/platform/guides/meetings-and-teams/stars-and-awards)).
6. **Close the issue.** Closing is what the mirror reads as "this competition
   is over" — `competitions."closedAt"`, set by the `issues` webhook the
   moment GitHub reports the close, or by the nightly reconcile.

## Two custom fields, read by name

The Project needs exactly two custom fields, **"Title"** (text) and
**"Judging/End Date"** (date) — the names matter, because
`server/github/competitions.ts` reads GraphQL fields by name, not by id.
Renaming either field, deleting it, or retyping it (a single-select "Title",
say) is **Project-shape drift**: the ingestion refuses to guess at a missing
or retyped field, reports the drift to Sentry (the same channel Airtable's
`verifyBase` used to alert through, before Airtable stopped being competitions'
CMS), and skips the item it was reading rather than applying a half-parsed
row. The next successful webhook delivery or nightly reconcile picks up right
where the drift left off, once the field is fixed.

## What the platform mirrors, and what it does not

`platform.competitions` carries the issue's node id (unique — the identity
every write keys on), number, repo, url, a **slug** derived from the title
and issue number for the platform's own URLs, the **title** (the Project's
"Title" field, falling back to the issue's own title when that field is
empty), the **brief** (the issue body, markdown), `plannedEndAt`
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

## The two triggers

`projects_v2_item` webhooks (`converted` = kickoff, `edited` = a field or the
item's content changed) and `issues` webhooks (`closed`, `reopened`, `edited`,
for an issue this table already mirrors) are the live half, wired from
`/github/webhook` after the signature is verified — see
`server/github/competitionEvents.ts`. The nightly `/cron/github-reconcile`
pass is the backstop: it pages through the whole Project and re-applies every
converted item it finds, the same "GitHub webhooks in near-real-time, a
nightly pass for what neither reached" shape
[Teams](/docs/platform/guides/meetings-and-teams/teams) uses for the branch
mirror.

`pull_request` is not handled yet. Recognizing an entry (a team-branch PR
linking the issue) and recording a winner off the merged one are a later
step — see [Stars & streaks](/docs/platform/guides/meetings-and-teams/stars-and-awards)
for `platform.competitionEntries`, whose shape already exists, and what
reads it once it is populated.

## Followups still open

Two things only Sloan can do:

- **Create the "Competitions" Project** with its two custom fields, note its
  GraphQL node id (`gh project view <number> --owner DevDogsUGA --format json
--jq .id`), and set `GH_COMPETITIONS_PROJECT_ID`. Unset, ingestion is a
  logged no-op — the platform boots without a Project configured, the same
  contract the Airtable integration used to have.
- **Enable the `projects_v2_item` and `issues` webhooks**, and grant the
  GitHub App org-level Projects **read** permission — without it, GraphQL
  reads against the Project fail even with the node id configured correctly.
