---
name: Meetings & Teams
description: How DevDogs meetings, workshops, week-long competitions, teams, attendance, and awards fit together — and why attendance is a ledger rather than a score.
---

# Meetings & Teams

> **Status: designed, not built.** Nothing here exists yet. The first half
> records the decisions and their reasoning; [Implementation](#implementation)
> turns them into migrations, server actions, policies, and tests so the whole
> thing can be reviewed before any of it is written.

DevDogs meets weekly. Each meeting runs one or more **workshops** — parallel
sessions, one per project, where members learn a feature area. A workshop
usually ends by announcing a feature to build, which opens a **competition**:
teams then have most of a week to implement it, working asynchronously, until
presentations and judging at the **following** meeting.

That last detail is the one the model has to get right. A competition is not a
room with a start time; it is a week-long window bracketed by two in-person
moments that belong to two different meetings. A meeting therefore straddles two
competitions — it judges the one that opened last week, and opens the next one.

**Not every workshop opens a competition.** A supplementary workshop is complete
on its own and is worth exactly one star. That is why the competition is a
separate row rather than a stage of the workshop, and why stars are derived from
participation rather than counted in pairs.

## The model

```
Meeting 1 (Sep 3)          Meeting 2 (Sep 10)         Meeting 3 (Sep 17)
├─ workshop: SGF           ├─ judging: SGF comp       ├─ judging: Sched comp
│   └─ opens competition ──┤                          │
│                          ├─ workshop: Scheduler     ├─ workshop: …
└──── teams work, async ───┘   └─ opens competition ──┘
```

```
meeting                    Sep 10 — time, place, check-in
 ├── workshop              (meeting, project)   ← attendance attaches here
 │    └── competition      optional; judged at a LATER meeting
 │         └── team
 │              └── teamMember
 └── workshop              parallel, different project
```

Four entities, each holding exactly what it can answer for:

| Entity          | Answers                                               |
| --------------- | ----------------------------------------------------- |
| **meeting**     | when and where the club gathered, and who showed up   |
| **project**     | which long-lived line of work — persists all semester |
| **workshop**    | the teaching slot for one project at one meeting      |
| **competition** | the week of async work a workshop opened, and who won |

```sql
platform.meetings (
  id                uuid primary key,
  slug              text not null unique,
  name              text not null,
  location          text,
  "startsAt"        timestamptz not null,
  "endsAt"          timestamptz not null,
  "attendanceFormUrl" text                  -- see Check-in below
);

platform.workshops (
  id           uuid primary key,
  "meetingId"  uuid not null references platform.meetings(id),
  "projectId"  uuid not null references platform.projects(id),
  unique ("meetingId", "projectId"),
  unique (id, "meetingId")   -- exists only to back attendance's composite FK
);

platform.competitions (
  id                 uuid primary key,
  slug               text not null unique,   -- names the integration branch
  "workshopId"       uuid not null unique references platform.workshops(id),
  "judgingMeetingId" uuid references platform.meetings(id),
  "judgingStartsAt"  timestamptz,            -- null = not yet scheduled
  "maxTeamSize"      smallint,               -- null → instance default
  "requirementCount" smallint,               -- null = not yet graded
  check ("requirementCount" is null or "requirementCount" >= 0)
);
```

Three consequences, all of them the point:

- **A supplementary workshop is a `workshops` row with no `competitions` row.**
  Not an inferred absence — a structural fact, which is what makes the one-star
  rule fall out rather than needing a special case.
- **Judging is scheduled, not assumed.** `judgingMeetingId` is normally the next
  meeting, but a fall break or a cancelled week moves it without any special
  handling. Both judging columns are nullable because a competition is created
  before its judging is on the calendar.
- **The coupling is explicit.** `competitions."workshopId"` is unique, so a
  workshop opens at most one competition, and the pair is a foreign key rather
  than an inference from two rows sharing a meeting.

#### Judging has its own time, not the meeting's

`judgingStartsAt` is an authored datetime, not `judgingMeetingId`'s `startsAt`.
Presentations and judging are **their own occasion** — they happen at a meeting,
but they are not the meeting, and the two start at different moments whenever
anything else is on the agenda first.

Three things follow, and the third is why this is worth a column rather than a
join:

- **Two competitions judged at the same meeting can be judged at different
  times.** Study group finder at 18:00, scheduler at 18:40. Deriving from the
  meeting would give both the same instant and lock both rosters at once.
- **Judging need not be at a workshop meeting at all.** A dedicated
  presentations night is just a `meetings` row with no `workshops` and a
  competition pointing at it — no special case, because the model never assumed
  the two coincided.
- **The lock predicate stops needing a join.** Reading it currently means
  `teams → competitions → meetings`; with the datetime on the competition it is
  a single row. That predicate is evaluated on every join attempt, every team
  page render, and inside the freeze query, so removing a join from it is worth
  more than the column costs.

**`judgingStartsAt` is the authority; `judgingMeetingId` is a label.** Every
predicate reads the datetime, and the meeting link exists so a competition can
say _where_ it was judged on a schedule page. They are deliberately not
constrained against each other: an officer fills Airtable fields one at a time,
and a sync landing between two keystrokes should not write a refusal into
`Sync status` for a row that will be complete thirty seconds later.

A null `judgingStartsAt` therefore means "not scheduled yet", and everything
downstream treats it as _not yet_ rather than _never_: the roster stays open, the
freeze skips the competition, and no star is awarded. Benign for a week, and a
problem after that — see below.

### Why the earlier `(event, track, stage)` shape was wrong

Worth recording, because the mistake is an easy one to make again. An earlier
draft had a single `sessions` table keyed `(event, track, stage)` with `stage`
being `workshop | hackathon`. It failed on three counts once the real timeline
was described:

- `startsAt` and `endsAt` are meaningless on a competition
  row. There is nothing to check into.
- The competition star was defined as attendance on the hackathon session, which
  could never fire — nobody attends a week of async work.
- `unique (eventId, trackId, stage)` assumed both stages lived inside one event.
  The workshop is at meeting _N_ and the judging is at meeting _N+1_.

The general shape of the error: **a table that mixes things you attend with
things that merely have a duration.** Splitting them is what lets attendance
key to something real.

### Projects are their own table

Projects are **not** a view over `platform.apps`. The registry holds four rows —
`platform`, `sandbox`, `schedule_builder`, `study_group_finder` — but the study
group finder carries _two_ projects, one for the feature work and one for its
UI/UX. The relationship is many-projects-to-one-app, so projects need their own
table with a nullable reference into the registry:

```sql
platform.projects (
  id            uuid primary key,
  slug          text not null unique,
  "displayName" text not null,
  "appId"       uuid references platform.apps(id),   -- nullable: projects ≠ apps
  "sortOrder"   double precision not null default 0
);
```

#### What `platform.apps` is, and why a project points at it

`platform.apps` is **not part of this design.** It already exists, from
`20260730000000_platform_app_registry.sql`, and it belongs to the moderation
system: it maps an app slug to a Postgres schema so `resolve_content`,
`conformance_check`, and the report dispatcher can find and quarantine content
that lives in another app's tables. Nothing about meetings or teams needs it.

This document touches it in exactly one place — `projects."appId"` — and only to
answer "which codebase does this project's work land in." The column is nullable
because the two concepts genuinely do not line up: the study group finder is one
app with two projects, and a project could exist for something not yet
registered as an app at all. Reading it the other way round is the mistake to
avoid: **`apps` does not describe club activity, it describes where content
lives for moderation purposes**, and the projects table is what club activity
hangs off.

### One team per member per competition

A member may be on several teams at once, as long as each belongs to a different
competition — different projects in the same week, or the same project in
different weeks. Carrying `competitionId` onto the membership row lets the
database enforce that directly:

```sql
platform.teams (
  id              uuid primary key,
  "competitionId" uuid not null references platform.competitions(id),
  slug            text not null,
  name            text not null,
  "joinCode"      text not null,
  "createdBy"     uuid not null,

  -- The entry. See "The entry state machine" below.
  "submissionUrl"   text,                            -- PR against the integration branch
  "submittedAt"     timestamptz,                     -- when it first opened
  "submissionState" platform."submissionState",      -- open | closed | merged
  "competedAt"      timestamptz,                     -- frozen at judging; never cleared

  "lockedManuallyAt" timestamptz, -- officer override; see the entry state machine
  "requirementsMet" smallint,     -- null = not yet graded; officers fill via Airtable
  "acceptingRequests" boolean not null default true,
  "clonedFromTeamId" uuid references platform.teams(id),
  unique (id, "competitionId"),   -- exists only to back the composite FKs below
  check ("requirementsMet" is null or "requirementsMet" >= 0),
  check (("submissionUrl" is null) = ("submissionState" is null)),
  check (("submissionUrl" is null) = ("submittedAt" is null)),
  -- A team cannot have competed without ever having had an entry.
  check ("competedAt" is null or "submissionUrl" is not null)
);

platform."teamMembers" (
  "teamId"        uuid not null,
  "competitionId" uuid not null,
  "userId"        uuid not null references auth.users(id) on delete cascade,
  role            platform."teamRole" not null default 'member',
  "joinedAt"      timestamptz not null default now(),
  primary key ("teamId", "userId"),
  foreign key ("teamId", "competitionId")
    references platform.teams(id, "competitionId"),
  unique ("userId", "competitionId"),
  unique ("teamId", "userId", role)   -- FK target for environment ownership
);

-- Exactly one lead per team.
create unique index on platform."teamMembers" ("teamId") where role = 'lead';
```

The redundant `competitionId` on `teamMembers` is load-bearing. It is what lets
a unique constraint express the rule, instead of application code that has to
remember to check.

`competedAt` is what the competition star reads — see
[Stars are derived](#stars-are-derived-never-stored) — and it is deliberately
**not** the same column the roster lock reads. The next section is why.

### Team size is configuration, not a constant

The cap starts at **4** and will change. It belongs in the singleton `instance`
table, with a per-competition override — a UI-heavy project may want 5 while a
narrower one stays at 3, in the same week.

```sql
alter table platform.instance
  add column "defaultMaxTeamSize" smallint not null default 4;
```

`competitions."maxTeamSize"` overrides it; null falls back to the instance
default. Enforce it in the join path **on insert only**. Lowering the cap must
never invalidate teams that already formed under the old value.

### The entry state machine

Every team's PR ends up closed. The winner's is merged; the rest are closed
unmerged once the competition is over. **That is the case that decides the
design**, because a naive "closing the PR clears the submission" rule would wipe
every losing team's star the moment somebody tidied up the repository.

So the entry answers **two different questions that agree during the week and
diverge afterwards**:

| Question                     | Column            | Lifetime                       |
| ---------------------------- | ----------------- | ------------------------------ |
| Is there a live entry _now_? | `submissionState` | Follows the PR, forever        |
| Did this team compete?       | `competedAt`      | Written once at judging, final |

Conflating them into one `submittedAt` was the bug. The roster lock is a question
about the present; the star is a question about a moment that has passed.

#### What the webhook does

`submissionState` mirrors GitHub and nothing else. **The handler contains no
time logic at all** — that is what keeps it simple enough to be obviously right:

| GitHub event                    | `submissionState` |
| ------------------------------- | ----------------- |
| `opened` against the right base | `open`            |
| `reopened`                      | `open`            |
| `closed`, `merged: false`       | `closed`          |
| `closed`, `merged: true`        | `merged`          |

Two conditions on "the right base", both silent when wrong: the head branch must
match `team/**` for that team, **and** the base must be that competition's own
integration branch. A PR opened against `main` by mistake, or against another
week's branch, is not an entry.

#### What the two predicates do

Everything time-dependent lives here instead:

```
locked      =  "submissionState" in ('open', 'merged')   -- a live or merged entry
            or now() >= c."judgingStartsAt"              -- judging has begun
            or "lockedManuallyAt" is not null            -- officer override

competed    =  "competedAt" is not null
```

`competedAt` is frozen exactly once, by the pass that runs when a competition's
judging begins:

```sql
update platform.teams t
   set "competedAt" = now()
  from platform.competitions c
 where c.id = t."competitionId"
   and t."submissionState" = 'open'
   and t."competedAt" is null
   and c."judgingStartsAt" <= now();
```

Idempotent by the `is null` guard, so re-running the pass is a no-op. **"Competed"
therefore means "had a live entry when judging started"** — which is the honest
definition, and the only one that survives the cleanup afterwards.

#### The whole lifecycle, once

| When      | Event                | `submissionState` | Locked?     | Star       |
| --------- | -------------------- | ----------------- | ----------- | ---------- |
| Tue       | PR opened            | `open`            | yes — entry | pending    |
| Wed       | PR closed            | `closed`          | **no**      | pending    |
| Wed       | PR reopened          | `open`            | yes — entry | pending    |
| Mon 18:00 | judging begins       | `open`            | yes — time  | **earned** |
| Mon 19:30 | winner merged        | `merged`          | yes — time  | kept       |
| Tue       | losing PRs closed    | `closed`          | yes — time  | **kept**   |
| —         | gave up, never fixed | `closed`          | yes — time  | none       |

The last two rows are the ones worth checking against: a losing team keeps its
star because `competedAt` was frozen while its PR was open, and a team that
abandoned its entry before judging never gets one because the freeze skipped it.

#### Unlocking is deliberate, and bounded

Row two is a feature rather than a leak. "We need one more person" has an obvious
affordance — close the PR, add them, reopen — and making it explicit beats a team
quietly asking an officer to unlock them. The `judgingStartsAt` term bounds it:
once judging begins, closing the PR no longer reopens the roster, so there is no
path to adding a ringer at the table.

Because the star is frozen rather than derived from the live state, **closing a
PR mid-week no longer silently drops four people's star**. It only defers it, and
only until judging. That resolves the open question the previous draft carried.

Nothing is provisioned at the lock in either direction: a team gets its GitHub
team, branch, and environment access the moment it is created, and members get
theirs the moment they join. See
[Contributing starts at join, not at lock](#contributing-starts-at-join-not-at-lock).

### Invitations and join requests are one table

A join code lets anyone holding it walk in. Beyond that, membership can be
initiated from either side — a lead invites a specific person, or a person asks
to join a team they found on the meetings page.

These are the same row with the arrow pointing the other way. Both are a proposed
`(team, user)` membership awaiting approval from the other party, both expire,
both are subject to identical validation, and both are answered by the same
action. Modelling them as two tables would duplicate all of that and let the two
copies drift, so they are one table with a direction:

```sql
platform."teamMembershipRequests" (
  id              uuid primary key,
  "teamId"        uuid not null,
  "competitionId" uuid not null,
  "userId"        uuid not null references auth.users(id) on delete cascade,
  direction       platform."membershipDirection" not null,  -- 'invite' | 'request'
  "createdBy"     uuid not null,
  message         text,                                     -- requests only
  status          platform."membershipRequestStatus" not null default 'pending',
  "createdAt"     timestamptz not null default now(),
  "notifiedAt"    timestamptz,                              -- see Email below
  "respondedAt"   timestamptz,
  "respondedBy"   uuid,
  "expiresAt"     timestamptz,
  foreign key ("teamId", "competitionId")
    references platform.teams(id, "competitionId")
);

create unique index on platform."teamMembershipRequests" ("teamId", "userId")
  where status = 'pending';
```

`direction` decides only **who may answer**: an `invite` is answered by the named
user, a `request` by the team's lead. Everything else is shared.

The partial unique index also means an invite and a request between the same pair
cannot both be pending — whichever arrives second finds the first and should
simply accept it. Two people reaching for each other at once is agreement, not a
conflict.

**Acceptance is validated at accept time, never at creation time.** Between a
request being made and answered, the team can fill up, the roster can lock, or
the user can join a different team for the same competition. So accepting routes
through the same join path as a join code and is subject to the same six checks.
A pending row is permission to attempt joining, not a reserved seat.

A user may have several pending requests across different teams in one
competition, which is the point — apply to a few, join whichever answers first.
**Accepting one automatically withdraws the rest for that competition**, since
the one-team-per-competition constraint would reject them anyway and leaving them
pending would strand leads waiting on someone who is no longer available.

That also means an invitation can become permanently unacceptable. Show it as
such with the reason, rather than failing with a generic error when the invitee
finally clicks.

#### Email notification

Team formation happens between meetings, when nobody is looking at the site.
An invitation that only exists as a badge in the UI will be missed, and a week
is short enough that missing it by three days means missing the competition.
**Invitations and join requests both send email.**

**Send it with the Cloudflare Workers `send_email` binding, not Supabase.**

Supabase's email is auth transactional only: it fires on signup confirmation,
magic link, and password recovery, and there is no general-purpose send API to
call. Its built-in sender is additionally rate-limited to a handful of messages
per hour and documented as testing-only, so any real use requires wiring custom
SMTP — which still only sends the auth templates. Reaching for
`inviteUserByEmail` to get around that is worse than it looks: it provisions an
`auth.users` row, so a team invitation would create an account for someone who
already has one, or for a teammate who never accepts.

The platform already runs on Workers via OpenNext, so the binding costs one line
of config and no new vendor, no API key, and no secret to rotate:

```jsonc
// apps/platform/wrangler.jsonc
{
  "send_email": [
    {
      "name": "EMAIL",
      "allowed_sender_addresses": ["noreply@mail.devdogsuga.org"],
    },
  ],
}
```

```typescript
const { env } = getCloudflareContext();
const { subject, html, text } = render("TeamInvite", {
  inviteeName: invitee.preferredName,
  teamName: team.name,
  acceptUrl,
});

await env.EMAIL.send({
  to: invitee.email,
  from: { email: "noreply@mail.devdogsuga.org", name: "DevDogs" },
  subject,
  html,
  text, // never omit — some clients show only text, and it helps spam scoring
});
```

#### Setup, once

Neither step is implied by owning the zone, and both fail loudly rather than
silently, which is the good case:

1. **Onboard the sending domain.** `wrangler email sending enable
mail.devdogsuga.org`, which provisions the DKIM, SPF, and DMARC records. Until
   it completes, every send returns `E_SENDER_NOT_VERIFIED`.
2. **Add the binding** to `apps/platform/wrangler.jsonc` as above, then
   `wrangler types` to regenerate `Env` with the real `SendEmail` types rather
   than hand-written ones.

For local development add `"remote": true` to the binding so sends proxy to the
real service; without it there is nothing to observe. Point it at a real address
you control — bounces from invented addresses land on the domain's reputation,
and the free-tier suppression list is not something to fill up while testing.

Four things to get right, each of which is a real failure mode rather than a
style preference:

- **`allowed_sender_addresses` on the binding** restricts what the Worker can
  claim as `from`. Without it, any code path with the binding in scope can send
  as any address on the domain.
- **Reaching the binding from a server action needs
  `getCloudflareContext()`** from `@opennextjs/cloudflare`. Nothing in the repo
  imports it yet, so this is the first place that pattern appears.
- **Never send inside the transaction.** The invite row is the source of truth;
  the email is a side effect that may fail. Commit, then send, then stamp
  `notifiedAt`. A null `notifiedAt` on a pending row is what the cron retries —
  which is also why the column exists rather than a bare boolean.
- **Sends are capped at 50 recipients** per call and are rate-limited. Re-forming
  a team fans out one invite per member, which at a cap of 4 is never close — but
  fan-out is the shape that eventually hits it, so batch and back off rather than
  looping unbounded.

`E_RECIPIENT_SUPPRESSED` deserves surfacing rather than swallowing: it means the
address previously bounced or reported spam, and the lead should be told their
invitee cannot be reached by email rather than left waiting.

Teams may close themselves to unsolicited requests via
`teams."acceptingRequests"`.

#### Templating, and staying consistent with marketing email

Cloudflare sends the message; it has no opinion about what the message looks
like, and there are no templates in the dashboard. Something has to author the
HTML.

The constraint that shapes this decision is one Cloudflare imposes rather than
one we choose: **Email Sending is for transactional mail only.** Newsletters and
campaigns have to go through an ESP regardless. So there will be two _senders_ no
matter what, and the only real question is whether there are also two _designs_.

> **One authoring system, two senders.** Define the templates in code with
> [react-email](https://react.email), and give the marketing ESP a rendered
> export of the same layout rather than its own design.

Two authoring systems cannot be kept visually consistent by discipline. A
drag-and-drop builder and a codebase will diverge on the first campaign somebody
builds in a hurry, and nobody will notice until the two land in the same inbox an
hour apart.

Why not the reverse — design in a service and export the HTML? Because ESP
builders emit deeply nested table soup that is unreadable, undiffable, and
unmaintainable the moment it lands in the repo, and re-exporting after every
tweak makes the service the source of truth for something the codebase also
needs. The export direction that works is code → service, not service → code.

react-email specifically, over MJML or Maizzle: it is components rather than a
separate templating language, `@react-email/tailwind` inlines a subset of
Tailwind so `theme.ts` can be shared with the site, and `email dev` gives a live
preview without deploying anything. Cost is not the deciding factor — it is free,
and every ESP worth using has a free tier well above a club's volume.

#### React never reaches the Worker

**Templates compile to HTML at build time.** React, the renderer, and Tailwind
are build-time dependencies; what ships is a string with holes in it and a
function that fills them.

```
packages/email/
  src/
    theme.ts            shared tokens — imported from the site's Tailwind config
    components/         Button, Layout, Heading, Footer
    templates/          TeamInvite.tsx, JoinRequest.tsx, …
    marketing/          Campaign.tsx — the shell, with editable regions
  scripts/compile.ts    render → tokenize → emit
  dist/                 generated; gitignored, built by turbo
    templates.js        chunk arrays + slot names, per template
    templates.d.ts      the generated prop types
  __snapshots__/        tracked: rendered HTML, so design diffs show in review
```

Each template declares its props and its subject line as ordinary exports:

```tsx
export type Props = {
  inviteeName: string;
  teamName: string;
  acceptUrl: string;
};

export const subject = (p: Props) => `${p.teamName} invited you to compete`;

export default function TeamInvite({
  inviteeName,
  teamName,
  acceptUrl,
}: Props) {
  /* … */
}
```

`compile.ts` renders each template once with a `Proxy` standing in for props, so
every prop access emits a `⟦key⟧` sentinel instead of a value. It then splits the
rendered HTML on those sentinels and writes the pieces out:

```ts
// dist/templates.js
export const TeamInvite = {
  html: {
    chunks: ["<!doctype html>…Hi ", ", ", " invited you…", "…"],
    slots: ["inviteeName", "teamName", "acceptUrl"],
  },
  text: {
    /* … */
  },
};
```

Runtime substitution is then a `for` loop over two arrays — no parsing, no regex
over the document, no template engine:

```ts
export function render<K extends keyof Templates>(
  name: K,
  props: Templates[K],
): { subject: string; html: string; text: string };
```

`Templates` is generated from each template's exported `Props`, so
`render("TeamInvite", { … })` is checked against the real component: a renamed
prop, a missing one, or a typo is a build error rather than a `⟦teamName⟧`
appearing in somebody's inbox. That is the whole reason to generate the types
rather than hand-maintain a registry — the compiled artifact and the source
cannot drift when one is derived from the other.

Three rules the compile step imposes, each worth knowing before writing a
template:

- **Substitution only — no branching on props.** The `Proxy` returns a string for
  every access, so `{p.isLead ? … : …}` always takes the truthy path and silently
  bakes one branch into the artifact. A variant is a separate template, not a
  conditional. `compile.ts` should reject a template whose render output changes
  between two different sentinel sets, which catches this mechanically.
- **Values are HTML-escaped on substitution.** Team names and display names are
  user-authored, so a team called `<script>` must not become one. Escaping at
  fill time rather than compile time is what makes this safe, and URL-valued
  slots need `encodeURI` instead — mark them in the template so the compiler
  emits the right filler.
- **Loops need a repeatable block**, not a prop. A digest listing five pending
  invitations cannot be one flat substitution, so the compiler emits a repeated
  chunk group for an array-typed slot. Worth building only when a template
  actually needs it; the transactional set here does not.

A fourth rule emerged from building it, and it is the one nobody would predict:
**the renderer itself breaks the substitution-only rule in three places, by
default.** Each was caught by the branching check rather than by review, which
is the argument for having the check at all:

| Default                            | What it does to a prop value                      | Fix                             |
| ---------------------------------- | ------------------------------------------------- | ------------------------------- |
| `<Preview>` pads to a fixed length | Output depends on the value's **length**          | Preview must be a literal       |
| html-to-text wraps at a column     | Line breaks baked from the sentinel's length      | `wordwrap: false`               |
| html-to-text uppercases headings   | A name in an `<h1>` arrives SHOUTING in text only | `uppercase: false` on `h1`–`h3` |

The first costs something real: the preview line is generic while the subject is
personalised. That is the right way round — the subject is what the reader scans,
and it is a plain header with no padding behaviour — but it is a constraint, not
a preference, and a template author will otherwise reach for a prop there first.

The payoff is the caveat this replaces. The previous draft flagged Worker bundle
size against the 3 MB compressed limit as something to watch — with compiled
templates it stops being a consideration at all, because the runtime dependency
is a few kilobytes of strings.

The marketing export runs through the same pipeline with a different filler:
instead of slots it emits editable regions — Mailchimp marks these with `mc:edit`
attributes, most ESPs have an equivalent — producing a file an officer uploads
**once** and then writes copy into, inside a constrained editor rather than on a
blank canvas. Same components, same theme, two output modes.

Three things left to plan for:

- **Separate subdomains, separate reputation.** Transactional from
  `mail.devdogsuga.org`, marketing from something like `news.devdogsuga.org`,
  each with its own DKIM. A campaign that collects spam complaints must not be
  able to stop a team invitation from arriving.
- **Marketing needs `List-Unsubscribe` and one-click unsubscribe.** Gmail and
  Yahoo require it of bulk senders, and the ESP handles it — which is another
  reason not to try routing campaigns through the Workers binding.
- **Dark mode in email is not solved.** Client support for
  `prefers-color-scheme` is partial and Outlook inverts colors on its own.
  Commit to one palette that reads correctly on both, rather than shipping a
  dark variant that only some clients honour.

### Team lead

`teamMembers.role` distinguishes `lead` from `member`. A team has exactly one
lead, who may invite, answer join requests, remove members, transfer the role,
and manage the team's sandbox environment.

The lead is also the **owner of the team's Supabase project**, and the database
enforces that they are the same person — see
[Sandbox Environments](./sandbox-environments.md#the-owner-is-the-lead-and-the-database-enforces-it).
Sole authority over the environment inside the platform matches the authority
they already have over that project from the Supabase dashboard.

One consequence is worth knowing before it surprises somebody:

> **Transferring lead requires detaching the environment first.**

A Supabase project cannot move between accounts through any API, so the role and
the project are bound together while attached. The referencing foreign key is
`on update restrict`, meaning the demotion is rejected outright rather than
quietly leaving a team led by someone who cannot administer its backend. A new
lead provisions a new environment; the outgoing lead keeps their project.

### Re-forming a team for the next competition

Teams that worked well want to stay together, and retyping a roster every week
is friction with no upside. A lead can **re-form** a past team into a new
competition via `teams."clonedFromTeamId"`.

Re-forming creates a new team in the target competition, adds the lead, and
issues a **pending `invite` to every member of the source team**. It does not add
them directly — the one-team-per-competition rule may already place someone
elsewhere, and joining a team is a choice rather than something a former teammate
can do to you.

Two cases need surfacing rather than silent handling:

- **Members already on a team in the target competition** are skipped. Name them,
  so the lead knows who to expect not to return.
- **A source roster larger than the target cap** — the cap can differ per
  competition — means not everyone can be invited. Warn before creating, not
  after.

`clonedFromTeamId` also gives the feature-lineage display a real chain: the same
team across four competitions is visibly the same team.

### Contributing starts at join, not at lock

A member who joins a team on Tuesday should be pushing commits on Tuesday. The
competition is a week of async work, so any delay between joining and being able
to contribute comes straight out of the time they have to build — which makes
gating access on a roster lock the worst possible choice.

So **nothing waits for the lock.** Access is event-driven at both ends:

| Moment           | What happens immediately                                         |
| ---------------- | ---------------------------------------------------------------- |
| Team created     | GitHub team created, `push` granted, `team/**` branch cut        |
| Member joins     | Added to the GitHub team; sandbox credential issued or enabled   |
| Member leaves    | Removed from the GitHub team; credential disabled if unreachable |
| Lead transferred | Environment ownership follows, subject to the detach rule        |

The sandbox side already works this way and needs no change — a member may hold
a credential for an environment when they are an active member of **any** team
attached to it, evaluated live, with `disabled` as a reversible state rather
than a revocation. See
[Access is a reachability question](./sandbox-environments.md#access-is-a-reachability-question-not-a-lookup).
The subtlety documented there is load-bearing here: removing someone from one
team must not disable a credential they still reach through another.

#### What the lock still does

Exactly one thing: **it stops new members joining.** It is the second of the six
join checks and nothing more.

That is a deliberate narrowing. An earlier draft had downstream systems read "the
roster as of the lock," which would have meant a snapshot — and a snapshot is
both unnecessary and wrong here:

- **Unnecessary**, because one-team-per-competition plus a join cutoff already
  makes mid-week team-switching impossible. While locked a roster can only
  shrink, so there is no scenario where "who was on this team" becomes
  ambiguous.
- **Wrong**, because a snapshot would keep granting GitHub and environment access
  to somebody who left, and would withhold it from somebody an officer added
  later. Both are the opposite of what should happen.

Credit therefore follows the **live** roster, not a frozen one: `memberStars`
reads `teamMembers` directly. A member who leaves a team stops being on it for
every purpose at once, which is the only behaviour that cannot surprise anyone.

**The lock is computed, never stored.** There is no `lockedAt` column to keep in
sync, which matters specifically because the lock can be _released_ — a stored
timestamp would have to be nulled out on PR close, and a nulled timestamp is
indistinguishable from one that was never set. Deriving it means the unlock path
needs no code at all: `submissionState` becomes `closed` and the predicate
follows.

Contrast `competedAt`, which _is_ stored, for the mirror-image reason: it is a
fact about a past instant that no present state can reconstruct, because the PR
it depended on will be closed by then. **Derive what is a question about now;
store what is a question about a moment that has passed.** Getting these two the
wrong way round is the whole of the bug this section exists to prevent.

The one other stored piece is `lockedManuallyAt`, for an officer freezing a
roster out of band. It is a separate column rather than a writable `lockedAt`
precisely so it cannot be confused with the derived state, and so clearing it
cannot accidentally unlock a team whose judging has already begun.

Roster changes while locked remain possible as an officer action and land in the
audit log. Members who never find a group get a team of one, created by the same
judging-start pass that freezes `competedAt` — an unmatched member is not a
special case in the schema, they are a team with one row in `teamMembers`.

## Where meetings come from

**Airtable is the CMS. Postgres is the source of truth.** Officers create and
edit meetings in Airtable; a sync projects them into `meetings`, `workshops`, and
`competitions`, and everything the platform derives hangs off the Postgres rows.

The split matters because `attendance."meetingId"` needs something that provably
exists and does not change identity when somebody re-sorts a view or renames a
record. Airtable gives non-technical editors typed fields, linked records, and
forms — none of which it can give referential integrity, which is why it is the
editing surface rather than the store.

> **This design does not use Airtable's "Sync" feature**, which is the
> Business-plan capability for pulling external sources (Salesforce, Jira,
> another base) into a synced table. It uses the plain **Web API**, which is
> available on every plan including Team, authenticated with a personal access
> token.
>
> The relevant limit is the **API call allowance, which is per workspace, not per
> base**: 1,000/month on Free, 100,000/month on Team, unlimited on Business. Free
> is unworkable — a 15-minute poll alone is ~2,880 calls/month before counting
> anything else. Team has ample headroom; see the budget below.

### Base structure

| Airtable table   | Fields                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Meetings**     | Name, Slug, Starts, Ends, Location, Attendance form, Sync status _(read-only)_                                            |
| **Workshops**    | Meeting _(link)_, Project _(link)_, Sync status                                                                           |
| **Competitions** | Workshop _(link)_, Judging meeting _(link)_, **Judging starts**, Requirement count, Max team size, Sync status            |
| **Projects**     | Name, Slug, App — **platform-managed, read-only to officers**                                                             |
| **Members**      | ⚙️ Platform ID, UGA email, Legal name, ⚙️ Meetings attended, Dues paid — see [Setup](./airtable-setup.md#the-member-push) |
| **Attendance**   | MyID, Workshop _(link)_, Source, ⚙️ Platform ID, ⚙️ Sync status — **the one table Airtable creates rows in**              |

**Projects are pushed the other way.** They are one of the tables the platform
owns and mirrors _into_ Airtable, because a project carries an optional `appId`
into the app registry and an officer inventing "Study Group Findr" would produce
a workshop linked to nothing. Making Projects a linked record that officers
select rather than type is what keeps the link total.

**A competition is created by linking a workshop, not by typing dates.** That is
the whole reason `workshopId` is a foreign key: an officer picks the workshop the
competition came out of, and the opening moment follows from the meeting the
workshop belongs to.

Judging is the exception, and it is authored: a linked meeting **and** a
`Judging starts` datetime, because presentations are their own slot within that
meeting rather than the whole of it. Officers fill both when the schedule firms
up, which is usually after the competition already exists — hence both columns
nullable, and the paired check making "one without the other" unrepresentable.

### Identity survives editing

Every synced row carries its Airtable record ID:

```sql
alter table platform.meetings     add column "airtableRecordId" text unique;
alter table platform.workshops    add column "airtableRecordId" text unique;
alter table platform.competitions add column "airtableRecordId" text unique;
```

This is the single most important detail in the integration. Airtable record IDs
are stable across renames, field edits, view re-sorts, and moves between views —
so an officer retitling "Sprint 2" to "Fall Sprint 2" updates a row rather than
orphaning every attendance record pointing at it. Matching on name or slug
instead would break the first time somebody fixes a typo.

### Sync mechanics

**Poll on the existing Cloudflare cron**, every 15 minutes. Airtable does offer
webhooks, but they expire on a 7-day refresh cycle and deliver cursor-based
payloads that have to be replayed in order — real complexity for a club whose
calendar changes a few times a week. Polling a base this small is cheap and has
no failure mode more exotic than "runs again in 15 minutes."

The personal access token is scoped to the one base and stored in Vault, using
the same `storeVaultSecret` / `readVaultSecret` helpers as everything else.

Each pass upserts on `airtableRecordId`, then reconciles deletions.

**Call budget on the Team plan** (100,000/month, per workspace):

| Cadence              | Calls/month | % of allowance |
| -------------------- | ----------- | -------------- |
| 15 min (recommended) | ~13,000     | ~13%           |
| 5 min                | ~39,000     | ~39%           |

Four or five requests per pass — Meetings, Workshops, Competitions, and
pagination headroom — with pushes firing only on change. The 15-minute cadence
leaves roughly 87% of the allowance free.

Two things to watch, both consequences of the allowance being **per workspace**:

- **Other Airtable use shares the budget.** Dues tracking and project management
  in the same workspace draw from the same 100,000. Putting the club base in its
  own workspace isolates the sync from that.
- **The 5 requests/second per-base rate limit is universal** and does not lift
  with the plan, so the client needs backoff regardless of tier.

### Triggering a sync by hand

A 15-minute poll is fine for a calendar edit and maddening for everything else.
An officer who fixes a requirement count ten minutes before judging should not
have to wait, and neither should anyone debugging why a refusal fired. So the
pass is exposed directly:

```ts
requestAirtableSync(): Promise<SyncReport>;
```

Gated on the same permission as the console and callable from two places: a
button in the platform's officer console, and an Airtable **button field** on the
Meetings table whose URL points at `/api/airtable/sync`. The second is what
matters in practice — it puts the control in the surface where the edit was just
made, which is the same reasoning that puts refusals in `Sync status` rather than
in a log nobody reads.

The route handler and the server action share one implementation; the route
exists because an Airtable button can only open a URL.

Three rules keep a manual trigger from being a new failure mode:

- **Take a Postgres advisory lock for the duration**, keyed to the sync. A
  manual run overlapping the cron would double-apply pushes and could interleave
  two `lastSyncedAt` advances. The second caller returns "already running"
  rather than queueing.
- **Rate-limit to one run per minute per caller.** The button is the kind of
  thing that gets clicked four times when it appears not to work, and each click
  is a handful of Airtable calls against a shared allowance.
- **Return the summary, don't just fire and forget** — rows upserted, rows
  refused, rows archived. A manual sync is almost always somebody checking
  whether a specific edit landed, and "done" does not answer that.

### The rules that protect attendance

Three, and they are why this is a sync rather than a mirror:

1. **A workshop with attendance rows rejects destructive edits.** Changing its
   meeting or its project would silently re-attribute credit that people have
   already earned. The sync refuses and leaves the Postgres row as-is.
2. **Deletion in Airtable is a soft archive in Postgres**, never a hard delete.
   `deletedAt` is set; attendance survives; the row stops appearing on the site.
3. **Rejections are written back to the `Sync status` field**, so the officer
   sees the problem in the row they just edited rather than nowhere.

Without the write-back, a refused edit looks to the officer exactly like a sync
that has not run yet, and the next move is to edit it again.

A fourth rule protects results rather than attendance: **a competition that has
been finalized rejects edits to `requirementCount`.** Changing the denominator
after a winner is announced would rewrite arithmetic that has already been
published; see [Elections](./elections.md#points).

A fifth protects the entry state machine: **`judgingStartsAt` must fall after the
opening workshop's meeting, and cannot move once participation has frozen.** The
first half stops a typo scheduling judging before the feature was announced,
which would lock every roster the moment the competition was created. The second
matters more — moving it later after the freeze would reopen rosters on a
competition whose stars are already awarded, and moving it earlier would silently
extend a lock backwards over a week people spent joining. Refuse and write the
reason to `Sync status`; a competition whose judging has happened is history, not
schedule.

### What flows back to Airtable

The Web API is full CRUD, so pushing is available — the token needs
`data.records:read` and `data.records:write`, plus `schema.bases:read` for field
discovery. "Airtable is the CMS" describes **authorship**, not capability: the
platform never authors a meeting, but it does write derived values back.

The rule that keeps this safe:

> Push only fields the platform **owns exclusively**. Never create a field that
> both sides write.

A field with two writers has no conflict-resolution story, and last-writer-wins
destroys someone's work silently. Every push below is a projection of Postgres
state that Airtable has no business authoring.

| Field                 | Table        | Why                                         |
| --------------------- | ------------ | ------------------------------------------- |
| Sync status           | all synced   | Surfaces refusals where the edit was made   |
| ⚙️ Platform ID        | Members      | The match key; locked                       |
| UGA email, Legal name | Members      | Durable identity dues are keyed to          |
| Projects mirror       | Projects     | Keeps the linked-record list authoritative  |
| ⚙️ Attendance count   | Workshops    | Officers plan against real numbers          |
| ⚙️ Team count         | Competitions | Shows a competition filling up              |
| ⚙️ Teams mirror       | Teams        | Keeps the linked-record list authoritative  |
| ⚙️ Competition points | Teams        | The computed 1000-point total and its split |
| ⚙️ Meetings attended  | Members      | Per-member count; see below                 |
| ⚙️ Attendance rows    | Attendance   | One per `(member, meeting)`; see below      |

Prefix platform-owned fields (⚙️ here) so it is visually obvious in the grid
which columns are not yours to edit.

The Teams table is the one place both directions meet: `⚙️ Competition points`
is pushed and `Requirements met` is pulled. That is legal — **direction is per
field** — but it is also the row most likely to tempt someone into an Airtable
formula that computes points from the grade. Do not. The grade is an input the
platform reads; the points are an output the platform writes, and a formula
between them would put the scoring rule in two places that will drift.

**Use field editing permissions on every pushed field.** They are available on
paid plans, so Team qualifies — restrict each to owner/creator and officers
cannot clobber a value the next sync will overwrite anyway.

Pushes are cheap: Airtable accepts up to **10 records per write request**. Push
on change rather than every pass — a sync that rewrites identical values burns
budget and makes every record look freshly modified.

### Attendance and the Members table

The earlier draft argued attendance could not live in Airtable partly because
doing so would require mirroring the club roster into the base. **That premise
no longer holds**: dues tracking puts a Members table there regardless, so the
roster is going into Airtable either way and the marginal privacy cost of
attendance is much smaller than it was.

The conclusion survives anyway, for the reasons that were never about the
roster:

- Check-ins arrive continuously during a meeting; a 15-minute poll means officers
  would be editing a stale view.
- A deleted Airtable row is ambiguous — a correction, or a stale view discarding
  a check-in that happened 30 seconds ago? There is no way to tell them apart,
  and one reading loses somebody their credit.
- Attendance would gain a second writer, breaking the rule that keeps every other
  pushed field safe.

So: **attendance is pushed, never pulled.** Officers get what they actually
wanted from the request — the ability to see attendance next to dues — without
attendance acquiring a second author:

- A `⚙️ Meetings attended` count on each Members row, refreshed on change.
- A read-only `⚙️ Attendance` table, one row per `(member, meeting)`, with
  **field editing permissions locking every column**. Officers can filter,
  group, and cross-reference against dues; they cannot edit, and a row they
  delete comes straight back on the next pass.

The Attendance table is **not optional**, because it is what replaces the
per-meeting CSV endpoint. Airtable exports any grid view natively, so once these
rows are in the base an officer handing somebody a roster clicks export rather
than waiting on a platform route built to serialize the same data. See
[CSV export](#csv-export) for what that decision costs.

Corrections stay in-platform, on the meeting page that already exists. That is
one permission and one component against a second writer on the one table where
a lost row costs somebody credit they earned — and it is the path that survives
whatever captures attendance, since somebody's phone dies, somebody arrives
late, and somebody's MyID gets refused regardless of how the room signs in.

Pushing a row per `(member, meeting)` is the largest write in the sync — a
semester of 25 meetings and 60 members is 1,500 rows. Batched at 10 per request
that is 150 calls **on first population only**; steady state is a handful per
pass, because rows are pushed on change and attendance for a past meeting does
not change. Backfilling mid-semester is the case to watch against the per-workspace
allowance, so do it once and deliberately rather than letting a reconcile
rediscover it every pass.

Linking the Members table to `auth.users` needs a stable key. Push the platform
`userId` into a locked `⚙️ Platform ID` field and **match on that**, never on a
display name — two people will eventually share one.

The Members table also carries the member's **UGA email and legal name**, which
are the durable, institution-assigned facts dues tracking is keyed to. Both are
push-only, both come from the Involvement Network roster, and **neither exists as
its own column in Postgres yet** — the legal name is currently stored in fields
that are deliberately cleared on every import, which would blank an Airtable dues
record. See
[Airtable Base Setup](./airtable-setup.md#two-columns-have-to-exist-first) for
the two columns that have to land first, and for the field registry that makes
adding the next pushed field one line.

Note that `ugaEmail` being a unique key does not contradict the warning above:
that one is about _account_ email, which a member can change to anything. A UGA
address is institutionally assigned and unique by construction — a different kind
of value that happens to share a shape.

### The officer surface

Only officers have Airtable access, so **the base is the officer console** for
anything it can hold. Every admin screen not built is a screen not maintained,
and that is the right default.

The line is not "officer-only work" though — it is **what Airtable can key a row
to**:

| Task                        | Where        | Why                                              |
| --------------------------- | ------------ | ------------------------------------------------ |
| Create/edit meetings        | Airtable     | Officer-authored, no member identity involved    |
| Create/edit workshops       | Airtable     | Same                                             |
| Open a competition          | Airtable     | Link a workshop; the opening follows from it     |
| Schedule judging            | Airtable     | A linked meeting plus an authored start time     |
| Set the requirement count   | Airtable     | Officer-authored; keyed to a competition         |
| Grade requirements per team | Airtable     | Officer-authored; keyed to a team, not a member  |
| Configure elections         | Airtable     | Officer-authored config, no member identity      |
| Record dues                 | Airtable     | Officer-authored; keyed to a member              |
| Correct an attendance row   | **Platform** | Needs member identity and must not go stale      |
| Mark a team as submitted    | **Platform** | Usually automatic from the PR; override is rare  |
| Freeze a roster early       | **Platform** | The `lockedManuallyAt` override; normally unused |

**The competition winner is computed, not chosen.** It is the team with the most
of 1000 points — 600 for requirements met, 400 from scaled election results — so
the `teamAwards` row with `category = 'winner'` is written by the tally rather
than authored by anyone. See [Elections](./elections.md#points).

What officers _do_ author in Airtable is the input to that sum, plus anything
outside it:

- **`judgingStartsAt`** on the Competitions mirror — when presentations begin.
  Nothing derives it, and a competition without it never freezes participation,
  so **no team in it can earn a competition star**. Surface a competition whose
  opening workshop is more than two weeks past and whose `judgingStartsAt` is
  still null, in the same spirit as the tally blocking on a null
  `requirementCount`: an unscheduled competition is indistinguishable from a
  forgotten one, and only the calendar can tell them apart.
- **`requirementCount`** on the Competitions mirror — how many hard requirements
  the competition had.
- **`requirementsMet`** on the Teams mirror — the grade, per team. This is the
  600-point block, and the tally **will not finalize a competition while either
  is null**.
- **Election configuration** — categories, open and close times. No points
  schedule: every category is weighted equally by construction.
- **Named side awards**, which are judgement calls rather than arithmetic.

Note the direction: Teams is platform → Airtable for names and computed points,
Airtable → platform for `requirementsMet` and side awards. Direction is per
field, never per table, so no field ever gains a second writer.

## Attendance is a ledger

Attendance is recorded per `(user, meeting)`, with the workshop as a dimension on
the row.

```sql
platform.attendance (
  id           uuid primary key,
  "meetingId"  uuid not null references platform.meetings(id),
  "workshopId" uuid references platform.workshops(id),
  "userId"     uuid not null references auth.users(id) on delete cascade,
  method       platform."checkInMethod" not null,   -- code | discord | officer | airtable
  "recordedBy" uuid,
  "recordedAt" timestamptz not null default now(),
  unique ("meetingId", "userId"),
  foreign key ("workshopId", "meetingId")
    references platform.workshops(id, "meetingId")
);
```

Because workshops run **in parallel**, attending a meeting does not say which
workshop somebody was in — so the workshop has to be on the row, and it is what
the workshop star reads. But presence at the meeting is a separate fact worth
keeping, which is why the two are one row rather than two tables:

- **`workshopId` is nullable.** A member who comes only for judging, or for a
  meeting with no workshop, is present without being in a workshop. They get an
  attendance row and no star, which is exactly right.
- **`unique ("meetingId", "userId")` enforces one row per member per meeting**,
  which is true because the workshops are concurrent — you cannot be in two.
- **The composite foreign key is what keeps `workshopId` honest.** Without it,
  an attendance row could name a workshop belonging to a different meeting, and
  a member would earn a star for a room they were never in. It is the same
  denormalize-then-anchor pattern as `teamMembers."competitionId"`, and it is
  the reason `workshops` carries `unique (id, "meetingId")`.

There is no `teamId` on the row. Teams belong to competitions, not to meetings,
and a team dissolving must not erase attendance — keeping them unlinked is what
guarantees that rather than relying on `on delete set null`.

`method` is stored so earned check-ins can be told apart from officer overrides
later, when somebody asks.

### Check-in

**An Airtable form**, since 2026-08-06: workshops are run with one already,
because poll questions get asked in the room anyway and a second sign-in sheet
next to a form people are filling in regardless is a worse experience for no
gain. Co-branded events arrive the same way — whichever club ran the event has
their own scheme, and pasting their roster into a table is a great deal easier
than teaching the platform to import it.

Two paths remain beside it: an officer adding somebody by hand, and the Discord
slash command this note describes but nothing has built. All of them write the
same row, distinguished by `method`.

> **The rotating check-in codes are gone**, and so is `platform."checkInCodes"`.
> They existed to disambiguate concurrent rooms — a short string shown at the
> front of each workshop, resolving to a (meeting, workshop) pair, so a member
> never picked a room from a list and could not claim the wrong one. The form's
> Workshop link is that same disambiguation without anybody reading a screen and
> typing, so the codes were paying a whole subsystem's cost for a property
> something else now provides for free.
>
> Dropping `'code'` from `checkInMethod` was safe because both the linked
> project and the local database held **zero** attendance rows using it. Had
> there been any, the value would have stayed: attendance is a ledger, and a row
> saying how somebody was counted must not be edited to say something else.

> **Airtable captures, Postgres mirrors.** Postgres stays what the platform
> READS — `memberStars` is a view over `attendance` and `judgingPass` decides
> team eligibility from it, and neither can wait on a vendor being reachable or
> on a fifteen-minute sync being current. So the form creates the row and the
> import mirrors it; it is not a move.

#### The form asks for a MyID, not an email

The local part alone — `jdoe`, not `jdoe@uga.edu` — and the importer appends the
domain itself. Sign-in is Google restricted to `hd=uga.edu`, so an account made
for an address outside that domain could never be signed into by anybody: it
would be a row holding somebody's attendance permanently out of reach. Building
the address rather than accepting one makes that unrepresentable instead of
merely discouraged. A response naming another domain is refused, with the value
quoted back into `⚙️ Sync status`.

#### Most first-time attendees have no account yet

That is the ordinary case rather than the edge one, so the import **creates**
the account: `auth.users` with the MyID as its email, and a profile carrying the
MyID as `preferredName`.

Two rules make that safe, and both are asserted by tests rather than left to
this page.

**The account is created UNCONFIRMED.** Nobody has checked that the person
filling in the form owns the mailbox.

> **Measured** on 2026-08-06: `admin.createUser` with `email_confirm: false`
> produces a user carrying an `email` identity with `email_verified: false`.
> Supabase's documented safeguard is that "when a new identity can be linked to
> an existing user, Supabase Auth will remove any other unconfirmed identities
> linked to an existing user" — so a real Google sign-in as that address links to
> this row and displaces the unconfirmed identity. Passing `true` would confirm
> the identity, the safeguard would not fire, and the behaviour would depend on a
> case Supabase's documentation does not cover.
>
> The consequence is that a mistyped MyID is a prunable orphan rather than a
> lockout for whoever really owns that address.

**It does not write `ugaEmail` or `legal*`.** Those are durable identity from the
Involvement roster, and `profile_ugaEmail_key` is unique. A self-declared MyID
sitting in that column would raise a unique violation the next time the roster
import reached the real owner of the address — inside a transaction, aborting the
import for the entire club. One typo, everybody's roster.

#### One attendance per member per meeting, still

`unique ("meetingId", "userId")` is unchanged, so a member who sat in two
workshops of one meeting produces two form responses and one row. The second is
**refused rather than dropped**: both responses are legitimate and the schema
collapses them on purpose, so the officer is told that rather than left to
notice a missing row.

#### Deleting the Airtable record IS how somebody is removed

Every other table in the pull treats a missing record as an archive rather than
a delete, on the grounds that attendance is a record of who was in a room on a
Tuesday and no amount of "I deleted the wrong row" in a spreadsheet erases that.

**That rule inverts here, and the inversion is the point.** It was written when
the PLATFORM created attendance and Airtable mirrored it — there, a deletion in
the mirror was an accident that must not destroy the original. Once Airtable is
the source, the row exists only because somebody created it there, so removing
it there is the source saying it did not happen, and a mirror that keeps
asserting otherwise is stale rather than principled.

The safety argument inverts with it. A removed row is fully reconstructible:
restore the record from Airtable's trash and the next pass re-imports it on the
same `airtableRecordId`. Nothing outside the table references an attendance id —
stars read by member and meeting, judging by member and workshop — so a restored
row is equivalent, not merely similar. **Airtable's own undo is the recovery
path**, which is why this still needs no `deletedAt`.

Two things bound it:

- **Only rows the import created** — `method = 'airtable'` with a record id. An
  officer's correction is never touched, including the case where a form
  response later attached its record id to a row the officer had already made.
  The officer created that row; the response only annotated it.
- **An empty table really does remove everything**, and that is correct rather
  than alarming: `listRecords` throws on any non-2xx, so a failed fetch aborts
  the pass and cannot masquerade as "the table is empty".

This is the only irreversible thing a pass does, so the console reports
**Attendance removed** as its own figure rather than folding it into Archived,
and shows it only when it is non-zero.

#### The form link is stored, because it cannot be discovered

`meetings."attendanceFormUrl"` holds the share link for the week's form, pasted
by an officer into Airtable and pulled down like every other officer-authored
field. A URL-shaped check constraint rejects anything that is not an
`https://airtable.com/` link, because the value is rendered as an href on a
public page and a paste into the wrong field would otherwise point members
somewhere else entirely.

> **Measured** on 2026-08-06: the Meta API returns views as `{id, name, type}`
> and nothing more. A form view's public `shr...` share token is not in that
> response, and its `viw...` id only resolves for somebody already a
> collaborator on the base — which a member is not. So there is no API path from
> "this meeting" to "this form", and one paste a week into a base officers are
> already editing is the whole cost of the alternative.

`checkInClosesAt` went with the codes. It existed so `checkIn(code)` could
refuse a late redemption — somebody arriving at the end for the pizza should not
earn what somebody who sat through the workshop earned. With nothing enforcing
it, it had become a datetime officers maintained that changed no behaviour
anywhere, and a column nobody acts on is worse than an absent one because it
reads as a control.

The platform therefore no longer claims to know whether attendance is open: the
form's own window is the only gate and this process cannot read it. The meeting
page says "here is the link" rather than "attendance is open", and the list
badge reads **Attendance form open** for the same reason.

### Officers can edit any roster

An officer holding the appropriate permission may add or remove attendance rows
for any meeting, at any time, including after the check-in window has closed.
Gate this through the existing dynamic permissions system rather than a role
literal, and record every change in the audit log.

**Stars must reflect those edits immediately**, which is the main reason the next
section derives them rather than storing them.

## Awards

```sql
platform."teamAwards" (
  id              uuid primary key,
  "teamId"        uuid not null,
  "competitionId" uuid not null,
  category        text not null,       -- 'winner' | 'honorable-mention' | ...
  citation        text,                -- one line on why, shown on the hall of fame
  "mergedPrUrl"   text,
  "awardedBy"     uuid not null,
  "awardedAt"     timestamptz not null default now(),
  foreign key ("teamId", "competitionId")
    references platform.teams(id, "competitionId")
);

create unique index on platform."teamAwards" ("competitionId")
  where category = 'winner';
```

The partial unique index allows exactly one winner per competition while leaving
side awards unconstrained.

Because a competition is already (meeting, project) via its workshop, that winner
row _is_ the answer to "which team won which feature implementation".

**The `winner` row is written by the election tally**, not by hand — it goes to
whichever team finished the competition with the most total points. See
[Elections](./elections.md). Other categories stay officer-authored in Airtable,
because an honourable mention is a judgement rather than a sum.

`mergedPrUrl` is distinct from `teams."submissionUrl"`: the submission is the PR
against the competition's integration branch, and `mergedPrUrl` is the PR that
merged the winner up to `main`. The feature-lineage view links to the second.

## The star system

Following Advent of Code, but with the count depending on what the week actually
was: a workshop that opened a competition is worth two stars, a supplementary
workshop is worth one.

### Stars are derived, never stored

There is no `stars` column. Stars are a **view**, computed by these two rules for
a given `(user, workshop)`:

| Star            | Earned when                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------- |
| **Workshop**    | an attendance row for that workshop, **or** the competition star below                         |
| **Competition** | on the workshop's competition team when judging began, **and** that team had a live entry then |

Three things fall out of that table, and all three are requirements rather than
accidents:

- **Competing earns both stars.** Someone who misses the workshop but builds and
  submits is not penalized. Attending the workshop is never a prerequisite for
  competing.
- **A supplementary workshop can only ever yield one star**, because it has no
  competition row, so the second rule can never fire.
- **The competition star reads `competedAt`, not attendance.** There is no
  meeting to attend for the async week, and joining a team then disappearing is
  not participation. Requiring a submission means the star tracks what the team
  actually produced.

That last rule has a consequence worth stating plainly: **the competition star
is a team-level outcome, awarded to every member of the team.** A team that
submits earns it for everybody on the roster, including someone who
contributed little; a team that does not submit earns it for nobody, including
someone who worked hard alone. Distinguishing further would require judging
individual contribution, which is not something the platform should attempt.

Deriving rather than storing is what makes officer roster edits work. An officer
adding an attendance row causes the affected stars to appear on the next read,
with no backfill job, no denormalized counter to repair, and no way for the two
to disagree.

### Meetings can have several stars

A member who attends two meetings and competes in one has three stars across
those weeks. Within a single meeting, only one workshop is attendable — they are
concurrent — so a meeting yields at most two stars per member, and only when
that member's workshop opened a competition they went on to submit for.

The display therefore **cannot assume a fixed two stars per row**. Group by
meeting, render one cluster per workshop the member attended, and let the cluster
size follow from whether that workshop opened a competition.

Winning is a **state of the competition star**, not an additional star. AoC's
visual grammar is built on stars being identical units; a third kind would break
the reference that makes the whole thing legible at a glance. A distinct fill
says "this team won" without adding a column.

The second display surface is **feature lineage**: per project, a timeline of
each competition, its winning team, that team's roster, and the PR that merged to
`main`. "The study group finder's messaging was built by Team Lantern in week 2"
is a better artifact than a points column.

### This replaces the GitHub leaderboard

`platform.leaderboardProfiles`, `platform.points`, `syncLeaderboard.ts`, and
`ClosedIssues.gql` are retired by this system.

That resolves a join that would otherwise be awkward. The old leaderboard is
keyed on `leaderboardProfiles.githubId`, so attendance — keyed on
`auth.users.id` — would have had to resolve through `auth.identities` on every
read, and members who had not linked GitHub would silently score nothing. The
new tables key on `auth.users.id` directly.

Linking GitHub remains a hard requirement for competing, but for org access and
PR attribution rather than for scoring.

## CSV export

**The per-meeting attendance export is cut.** Pushing attendance and members into
Airtable removed the reason to build it.

An earlier draft argued against using Airtable's native grid-view export on the
grounds that "it can only export what Airtable holds, and attendance deliberately
is not there." Attendance is there now — read-only, one row per
`(member, meeting)`, alongside the Members table dues tracking already requires.
Airtable exports any grid view to CSV with no code at all, so building a
streaming serializer for the same rows would be writing an endpoint to duplicate
a button.

That leaves one export worth keeping, and the reason it survives is the same test
applied the other way round.

### `stars.csv` — one file, all meetings

Stars are **derived**, not stored. Getting them into Airtable would mean pushing
a computed row per `(member, workshop)` — the entire participation matrix,
recomputed and re-pushed whenever an officer corrects an attendance row, against
a per-workspace API allowance shared with dues and project management. One
streamed endpoint is dramatically cheaper than that push, so the endpoint stays.

Their value is also cross-meeting, which is the shape Airtable is worst at: the
point is seeing a member's record across a semester, not one meeting's roster.

One row per `(member, workshop)`, which is the grain stars are defined at.

```
user_id, preferred_name, email, github_login,
meeting_id, meeting_slug, meeting_name, meeting_starts_at,
workshop_id, project_id, project_slug, project_name,
competition_id, workshop_star, competition_star, submitted, won, award_category
```

Keeping this out of Airtable also avoids a real ambiguity that a pushed table
would have to resolve: because competing earns the workshop star, a member who
skipped the workshop and submitted anyway has a workshop star with **no
attendance row to hang it on**. The Airtable attendance mirror has no row for
that member at that workshop; the stars export gives them both stars. Neither
has to lie, because they are answering different questions — and merging them
into one Airtable table would force one of them to.

### What is lost by exporting from Airtable instead

Two things, and both are worth stating rather than discovering:

- **No audit trail on the roster export.** The platform endpoint was to write an
  audit entry on every download; anybody with base access can export an Airtable
  view silently. This is a smaller loss than it sounds — the same people can
  already read every row in the grid — but bulk extraction stops being
  detectable.
- **Airtable only has what is pushed.** `github_login`, `pronouns`,
  `graduation_semester`, and `graduation_year` live in the platform profile and
  are deliberately **not** mirrored.

The second one is the trap. If a destination turns out to need graduation year,
the tempting fix is to push those columns into the base — which walks straight
back into the PII surface the sync rules exist to avoid, and does it to save
writing a serializer. **Add a scoped platform endpoint for that specific
destination instead**, once a real requirement exists to shape it.

### Format contract

The stability rules matter more than the specific columns, since the columns
will change:

- **Columns are append-only.** New fields go at the end; existing columns are
  never reordered or renamed. This is what lets a downstream import keep working
  when the schema grows.
- **RFC 4180 quoting**, UTF-8, `\r\n` line endings.
- **Timestamps are ISO 8601 with an explicit offset**, never bare local times —
  the same reasoning that governs `EVENT_TZ` in the meetings UI.
- **Booleans are `true`/`false`**; nulls are empty strings.
- Accepts date-range and project filters, and streams rather than buffers.

The export carries emails, so gate it behind `canExportStars` and write an
audit log entry on every download.

## Collaboration: branches, not forks

Ordinary contributions keep using the fork-and-PR workflow in
[Contributing](./contributing.md). **Competition teams get a branch in the org
instead**, for one decisive reason: you cannot automate collaborator grants on a
student's personal fork. Adding teammates to `someone/DevDogs-Website` requires
that student's personal-account admin, which the org's GitHub App has no reach
into. Every other argument is secondary to that one, though they all point the
same way — fork PRs do not receive secrets, which the E2E suite needs, and
GitHub Teams only apply to org repositories.

Org membership is not a new burden: linking GitHub at `devdogsuga.org` already
invites the user to the organization and accepts on their behalf, in
`server/auth/providers/github.ts`.

### Branch layout

```
main
 └── comp/2026-fall/w02/study-group-finder     judging target, cut from main
      ├── team/2026-fall/w02/sgf/lantern       team working branches
      └── team/2026-fall/w02/sgf/marble
```

The week segment is not decoration. Competitions recur per project across the
semester, so `comp/2026-fall/study-group-finder` would collide with itself every
week — the integration branch is named from `competitions.slug`, which is unique
by construction.

Teams open PRs against the **competition's integration branch**, not `main`.
Judging happens across those PRs; a maintainer merges the winner up to `main`.

**The PR is the team's entry**, and it drives both the roster lock and the
competition star through
[the entry state machine](#the-entry-state-machine). The webhook only mirrors
GitHub's view of the PR; every time-dependent consequence is derived from that.

Two details the handler has to get right, because both are silent when wrong:

- **Only PRs targeting the competition's own integration branch count.** A team
  PR opened against `main` by mistake, or against another week's branch, must not
  register as an entry. Match on base ref, not just on the head branch prefix.
- **Merged is not closed.** `pull_request.closed` fires for both, and they are
  different states — check the `merged` flag rather than treating every close
  alike.

This is what keeps `main` clean. Pointing every team at `main` produces a pile of
PRs that mostly get closed unmerged, which is both noisy and demoralizing — and
it makes "best implementation wins" an explicit merge decision rather than an
implicit one.

A repository ruleset restricts creation and updates on `team/**` so a team can
only push to its own branch, with the officer role as a bypass actor. Rulesets
support exactly this: fnmatch branch patterns, a "restrict pushes to matching
refs" rule, and bypass actors that may be a role, a team, or a GitHub App. Note
that fnmatch support is partial — no `\` quoting and no `^` set complement — so
keep the patterns simple.

### Permission sync

Mirrors the existing Discord split between push-on-change and reconcile-on-cron
(`server/discord/roleSync.ts` and `server/discord/reconcile.ts`).

**Every row here fires on the platform event itself, not on a schedule.** The
whole point of the previous section is that a member who joins on Tuesday can
push on Tuesday, and a nightly reconcile would make that a nightly promise.

| Platform event     | GitHub App action                                                  |
| ------------------ | ------------------------------------------------------------------ |
| Team created       | Create team, grant `push`, cut the branch from the integration one |
| Member added       | Add to the GitHub team by the login on their linked identity       |
| Member removed     | Remove from the GitHub team                                        |
| PR opened          | `submissionState = 'open'` — **locks the roster**                  |
| PR closed unmerged | `submissionState = 'closed'` — unlocks unless judging has begun    |
| PR merged          | `submissionState = 'merged'`                                       |
| PR reopened        | `submissionState = 'open'`                                         |
| Competition ends   | Downgrade the team to `pull`                                       |
| Nightly cron       | Reconcile real GitHub team membership against `teamMembers`        |

Judging start is the exception that proves the rule: it is a _time_, not an
event anything emits, so it is the one thing here that has to be a cron. See
[The judging-start pass](#the-judging-start-pass).

The cron is a **backstop, not the mechanism.** GitHub's API can fail, and a
membership change that silently did not apply is invisible until somebody cannot
push — so the reconcile exists to close that gap, not to be the normal path.

One consequence worth planning for: **a member without a linked GitHub identity
cannot be added to the team.** Linking is already required to compete, but the
join path should refuse rather than succeed into a half-provisioned state where
somebody is on the roster and cannot push. `github_not_linked` joins the five
join errors as a sixth.

## Implementation

### Migrations

Six files, in this order. The split is by failure domain rather than by
convenience — each one leaves the database in a working state.

| #   | File                                     | Contents                                                               |
| --- | ---------------------------------------- | ---------------------------------------------------------------------- |
| 1   | `<ts>_platform_meetings_core.sql`        | Enums, `meetings`, `projects`, `workshops`, `competitions`, config     |
| 2   | `<ts>_platform_teams.sql`                | `teams`, `teamMembers`, `teamMembershipRequests`, the lead index       |
| 3   | `<ts>_platform_attendance.sql`           | `attendance`, the `memberStars` view                                   |
| 4   | `<ts>_platform_team_awards.sql`          | `teamAwards` and its partial unique index                              |
| 5   | `<ts>_platform_meetings_permissions.sql` | New `roles` columns, `resolvedUserPermissions` update, trigger refresh |
| 6   | `<ts>_platform_airtable_sync.sql`        | `airtableRecordId` columns, `deletedAt`, `airtableSyncState`           |

Six rather than the seven an RPC-based design would need — there is no RPC
migration. See
[Writes are server actions, not RPCs](#writes-are-server-actions-not-rpcs).

**Migration 2 must land before the sandbox work.** `teamEnvironments` has a
composite foreign key into `teamMembers("teamId", "userId", role)`, so the keys
that back it have to exist first. See
[Sandbox Environments](./sandbox-environments.md).

Enums to create in migration 1:

```sql
create type platform."teamRole" as enum ('lead', 'member');
create type platform."submissionState" as enum ('open', 'closed', 'merged');
create type platform."checkInMethod" as enum
  ('code', 'discord', 'officer', 'airtable');
create type platform."membershipDirection" as enum ('invite', 'request');
create type platform."membershipRequestStatus" as enum
  ('pending', 'accepted', 'declined', 'withdrawn', 'expired');
```

There is no `eventStage` enum. Splitting workshops and competitions into
separate tables removed the discriminator entirely, which is the clearest sign
the split was the right one — the enum existed only to say which half of a
conflated table a row belonged to.

### Writes are server actions, not RPCs

The moderation and feedback surfaces put every write behind a `security definer`
RPC because they are **client-agnostic**: an integrating app reaches them over
PostgREST with its own Supabase client, so the rules have to live where every
client necessarily passes through.

**None of that applies here.** Meetings, teams, and attendance are consumed by
the platform and nothing else. Routing them through RPCs would buy an
independence no caller wants, and would pay for it by splitting logic that
belongs together — a join is a database write, a GitHub API call, and an email,
and only one of those three can live in Postgres.

So: **server actions over Drizzle, with `db.transaction()` for anything
multi-statement.** `apps/platform/src/server/db/index.ts` already exposes the
client. Reads that a client component needs live in React Query hooks over
supabase-js, which keeps RLS doing the filtering on the read path.

#### Extract the client into `packages/db`

> **Built.** This is the one piece of this plan that exists. Both apps now import
> `createDb` from `@devdogsuga/db`; their local `db/index.ts` is four lines.

`apps/platform/src/server/db/index.ts` and
`apps/schedule-builder/src/server/db/index.ts` were **the same file** — same
`postgres-js` client, same `prepare: false`, same `globalForDb` caching trick,
differing only in which `relations` they import.

```ts
// packages/db/src/index.ts
export function createDb<R extends AnyRelations>(url: string, relations: R) {
  /* the postgres-js client, the globalThis cache, the dev-only reuse */
}
```

Each app keeps its own generated `schema.ts` / `relations.ts`, because they
introspect different Postgres schemas and the generated modules are genuinely
app-specific. What moves is the connection: driver options, pooling behaviour,
and the hot-reload cache.

The one real hazard in moving it was the cache key. The old code wrote
`globalThis.conn`, which is fine while each app owns the file and nothing else
competes for the name — but a shared factory called twice in one process would
have handed the second caller the first caller's connection, including its
database. The shipped version keys a `Map` on the connection string, under a
`Symbol.for("@devdogsuga/db.connections")` slot so two copies of the package at
different versions still share one cache rather than opening two pools.

#### Should the proxy worker use it too?

It could, and it mostly should not — but the reason is worth being precise about,
because the obvious worry is the wrong one.

**Drizzle is a client library; the RPC is a privilege boundary. They are
orthogonal.** The proxy worker's security property comes from its Postgres
_role_, which holds `execute` on `resolve_sandbox_credential` and nothing else.
Handing that role a full query builder changes nothing — `select * from
platform."sandboxEnvironments"` still fails, because the grant is not there. So
"Drizzle would let the worker read too much" is simply not true.

The real objections are practical, and they are about where the worker sits:

- **It is on the hot path of every sandbox request.** A direct Postgres
  connection has a different cost profile from an HTTP call to PostgREST, which
  Supabase already pools. Workers isolates are short-lived and cannot reliably
  hold a pool across invocations, so going direct means either paying connection
  setup per cold isolate or putting Hyperdrive in front of it.
- **There is nothing for a query builder to build.** The worker makes exactly one
  call, to one function, returning one fixed row shape. Drizzle's value is
  inference over tables — and this role may not touch any table.
- **Its dependency surface should stay minimal.** The worker is the component
  most exposed to untrusted traffic; adding a driver and an ORM to it buys
  consistency at the cost of the thing that makes it easy to audit.

So: extract `packages/db` for the two Next apps, where it removes real
duplication today. Leave the proxy worker on supabase-js against its narrow role.
If it ever needs to do more than resolve a credential, revisit — but that would
be a reason to widen its grants, which is the decision that actually matters, and
the client library would follow rather than lead.

#### What that changes about authorization

This is the part that needs care rather than enthusiasm. `db` connects with a
privileged role, so **every query through Drizzle bypasses RLS.** Moving writes
out of `security definer` functions does not move the authorization
requirement — it relocates it from the database to one TypeScript module, and
an action that forgets to call it has no second line of defence.

Two consequences worth building around, before the guards themselves:

- **The restrictive deny-all client-write policies stay.** They no longer guard
  the server path, but they are what stops a browser holding an `authenticated`
  JWT from writing these tables directly through PostgREST. Dropping them
  because "writes go through server actions now" would open exactly the hole the
  RPCs were closing.
- **Database invariants stay in the database.** This is the distinction that
  makes the trade safe: moving off RPC moves _procedures_ into TypeScript, not
  _constraints_. Every unique index, composite foreign key, and check constraint
  in this document is doing work that application code cannot do, and they are
  what actually holds under concurrency.

#### The guards, concretely

The repository already has this pattern — `requireManageRoles()` in
`server/actions/permissions.ts` resolves the caller, checks a flag, and returns
`{ callerId, ctx }`. The new actions extend it rather than inventing a parallel
convention. There are **two kinds**, and conflating them is the mistake to avoid.

**Role guards** answer "may this person do this kind of thing at all", and read
`resolvedUserPermissions`:

```ts
// server/actions/permissionGuards.ts
export async function requireEditAttendance() {
  const callerId = await expectSession();
  const ctx = await getCallerContext(callerId);
  if (!ctx.resolvedPermissions.canEditAttendance) {
    throw new Error("Not authorized: canEditAttendance required");
  }
  return { callerId, ctx };
}
```

```ts
// server/actions/attendance.ts
"use server";

export async function setAttendance(
  meetingId: string,
  workshopId: string | null,
  memberId: string,
  present: boolean,
): Promise<void> {
  const { callerId } = await requireEditAttendance(); // ← first line, always

  await db.transaction(async (tx) => {
    /* … write, then audit-log with callerId … */
  });
}
```

**Relationship guards** answer "may this person do this to _this row_" — is the
caller the lead of team X? These have no permission flag behind them; they are a
query. This is precisely what an RLS policy used to express, and the work does
not disappear, it becomes explicit:

```ts
export async function requireTeamLead(tx: Tx, teamId: string) {
  const callerId = await expectSession();
  const lead = await tx.query.teamMembers.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.teamId, teamId), eq(m.userId, callerId), eq(m.role, "lead")),
  });
  if (!lead) throw new TeamActionError("not_team_lead");
  return { callerId };
}
```

> **Relationship guards take the transaction handle.** Checking outside the
> transaction and then mutating inside it is a time-of-check/time-of-use gap —
> the lead can be transferred in between, and the action proceeds on an answer
> that was true a moment ago.

Role guards do not need this: a permission change mid-action is a legitimate
race with no security consequence, because the caller genuinely held the
permission when they invoked it.

#### Making a forgotten guard impossible rather than reviewable

Writing `requireX()` as the first line works only as long as everybody remembers,
and a server action with no guard looks exactly like one that does not need a
guard. For the role-gated actions, wrap instead:

```ts
export const setAttendance = officerAction(
  "canEditAttendance",
  async ({ callerId }, meetingId, workshopId, memberId, present) => {
    /* … */
  },
);
```

The guard is now structural — there is no way to export an action through this
helper without naming a permission. Relationship guards still have to be inline,
because they depend on the arguments, but those fail closed by nature: a missing
`requireTeamLead` shows up as any member being able to kick their teammates,
which a test catches immediately, whereas a missing role check on an officer
action may go unnoticed for a semester.

Add the three new flags to the `PERMISSION_KEYS` array in `permissions.ts`. Its
two-way exhaustiveness check will otherwise fail the build — which is the
intended behaviour, and a good reason not to bypass it.

#### Reads still go through RLS

| Table                    | `anon` select       | `authenticated` select      | Client writes |
| ------------------------ | ------------------- | --------------------------- | ------------- |
| `meetings`, `projects`   | ✅ all              | ✅ all                      | ❌ denied     |
| `workshops`              | ✅ all              | ✅ all                      | ❌ denied     |
| `competitions`           | ✅ all              | ✅ all                      | ❌ denied     |
| `teams`                  | ✅ name, slug, comp | ✅ all                      | ❌ denied     |
| `teamMembers`            | ❌                  | ✅ all (rosters are public) | ❌ denied     |
| `teamMembershipRequests` | ❌                  | ✅ own rows + own team's    | ❌ denied     |
| `attendance`             | ❌                  | ✅ own rows only            | ❌ denied     |
| `teamAwards`             | ✅ all              | ✅ all                      | ❌ denied     |

`attendance` being own-rows-only for clients is deliberate: officers read it
through a server action that checks the permission, so a broad `authenticated`
read never has to exist. And `teams` is readable by `anon` because the meetings
page lists teams to logged-out visitors — but `joinCode` must be excluded, which
means either a column-level grant or a view, not a bare `select` policy.

The one `security definer` function that survives in this area is
`resolve_sandbox_credential`, and it survives for exactly the reason the others
do not: its caller is the proxy Worker, which is a different client.

### Server action contracts

`apps/platform/src/server/actions/`, all `"use server"`, all beginning with an
authorization check.

```ts
createTeam(competitionId: string, name: string): Promise<TeamId>
joinTeam(teamId: string, joinCode: string): Promise<void>
requestToJoin(teamId: string, message?: string): Promise<RequestId>
inviteToTeam(teamId: string, inviteeId: string): Promise<RequestId>
respondToMembership(requestId: string, accept: boolean): Promise<void>
leaveTeam(teamId: string): Promise<void>
transferLead(teamId: string, newLeadId: string): Promise<void>
reformTeam(sourceTeamId: string, targetCompetitionId: string): Promise<ReformReport>
checkIn(code: string): Promise<WorkshopId>
setAttendance(meetingId: string, workshopId: string | null,
              memberId: string, present: boolean): Promise<void>
setSubmission(teamId: string, prUrl: string | null): Promise<void>
awardTeam(teamId: string, category: string, citation?: string): Promise<AwardId>
requestAirtableSync(): Promise<SyncReport>
```

`reformTeam` returns a structured report rather than an id, because the caller
needs the skipped-member list: `{ teamId, invited, skipped: [{ userId, reason }] }`.
This is where dropping RPCs pays immediately — that shape was `jsonb` before,
typed by hand on both sides; now it is one interface.

`setSubmission` is the officer override for a team that presented without a PR;
the webhook path writes `submissionState` directly. Both are described by
[the entry state machine](#the-entry-state-machine).

#### The join path is one function, called from three places

**Every path that adds a member runs the same six checks in the same order.**
`joinTeam`, `respondToMembership`, and `reformTeam` all need them, and drift
between copies is how someone ends up on two teams — so they live in one
`requireCanJoin(tx, competitionId, userId)` taking the transaction handle:

1. Competition exists and judging has not begun → `competition_closed`
2. Team is not locked — see the lock predicate → `roster_locked`
3. Caller has a linked GitHub identity → `github_not_linked`
4. Current member count < effective cap → `team_full`
5. No existing `teamMembers` row for `(userId, competitionId)` → `already_on_team`
6. Insert

Throw a typed `TeamActionError` carrying one of those codes rather than a
string — the UI branches on them, and the join screens need to say _which_ check
failed.

#### Why checks 4 and 5 do not actually enforce anything

**They exist to produce a good error message.** Both are `select`-then-`insert`,
and the gap between the two statements is real whether the code is PL/pgSQL or
TypeScript. Two concurrent joins interleave inside it.

**Race one — the cap.** Team is full at 4, currently has 3, two invitations are
accepted at the same moment:

```
T1  respondToMembership(inviteA)     T2  respondToMembership(inviteB)
─────────────────────────────────────────────────────────────────────
BEGIN                                BEGIN
select count(*) → 3   (cap 4, ok)
                                     select count(*) → 3   (cap 4, ok)
insert (userA, team) → ok
                                     insert (userB, team) → ok
COMMIT                               COMMIT
                                          ⇒ the team now has 5 members
```

Nothing in the schema stops this, and nothing can: **"at most four rows" is a
count, not a uniqueness property**, so there is no index that expresses it. The
only fixes are a lock or a serializable transaction. Take the lock — it is one
statement and it costs nothing at this scale:

```ts
await db.transaction(async (tx) => {
  // Serializes every concurrent join for this team, and only this team.
  await tx.execute(
    sql`select 1 from platform.teams where id = ${teamId} for update`,
  );

  const [{ n }] = await tx
    .select({ n: count() })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));

  if (n >= cap) throw new TeamActionError("team_full");
  await tx.insert(teamMembers).values({ teamId, competitionId, userId });
});
```

`for update` on the team row makes T2 block until T1 commits, so T2's count reads
4 and it fails cleanly. The lock is per team, so joins to different teams still
run concurrently.

**Race two — one team per competition.** Same shape, different mechanism. A
member accepts invitations from two _different_ teams in the same competition:

```
T1  respondToMembership(fromAlpha)   T2  respondToMembership(fromBeta)
─────────────────────────────────────────────────────────────────────
BEGIN                                BEGIN
select membership → none
                                     select membership → none
insert (user, alpha) → ok
                                     insert (user, beta)  → ⛔ 23505
COMMIT                               ROLLBACK
```

The row lock above does **not** help here: the two transactions lock different
team rows and never contend. What saves it is
`unique ("userId", "competitionId")` — the constraint fires and the second
transaction dies. So the insert has to expect that and translate it, rather than
assuming check 5 already settled the question:

```ts
try {
  await tx.insert(teamMembers).values({ teamId, competitionId, userId });
} catch (e) {
  if (isUniqueViolation(e, "teamMembers_userId_competitionId_key")) {
    throw new TeamActionError("already_on_team");
  }
  throw e;
}
```

`postgres-js` surfaces this as an error with `code === "23505"` and
`constraint_name` set; match on the constraint, not the message, and not on the
code alone — the same action can violate more than one unique index and the user
deserves to know which.

**The general shape: two races, two mechanisms.** A uniqueness race is caught by
a constraint and needs translating; a counting race is caught by nothing and
needs a lock. Telling them apart is the skill, and getting it wrong is invisible
until a real event with real simultaneity. Neither `eslint-plugin-drizzle` nor a
test that runs statements in sequence will find them, which is why the
[tests](#tests) drive both through the real actions in parallel.

#### Side effects go outside the transaction

**The insert commits before GitHub is called.** Provisioning is an external API
that can be slow or down, and holding a transaction open across it would let one
GitHub outage block every join in the club — worse now than under RPCs, because a
`postgres-js` connection held open across a network call is a pooled connection
nobody else can use.

So the shape is: transaction writes and commits, then the action provisions, then
it stamps. Same as [invitation email](#email-notification), and the same reason
the reconcile pass exists. A member briefly on the roster without push access is
recoverable; a join that failed because GitHub was slow is not.

Server actions run in the same Worker invocation that returned the response, so
anything after the commit should be handed to `waitUntil` rather than awaited
before returning — the user does not need to wait on GitHub to see they joined.

### The star view

Stars are derived, so they are a view — never a table. The two stars come from
different sources, so the readable spelling is a union of participation facts
folded down per `(user, workshop)`:

```sql
create view platform."memberStars"
with (security_invoker = on) as
with participation as (
  -- Attended the workshop.
  select a."userId", a."workshopId", true as attended, false as competed, false as won
  from platform.attendance a
  where a."workshopId" is not null

  union all

  -- Competed: had a live entry when judging began.
  select tm."userId", c."workshopId", false, true, false
  from platform."teamMembers" tm
  join platform.teams t        on t.id = tm."teamId"
  join platform.competitions c on c.id = t."competitionId"
  where t."competedAt" is not null

  union all

  -- Won.
  select tm."userId", c."workshopId", false, false, true
  from platform."teamMembers" tm
  join platform.teams t         on t.id = tm."teamId"
  join platform.competitions c  on c.id = t."competitionId"
  join platform."teamAwards" aw on aw."teamId" = t.id and aw.category = 'winner'
)
select
  p."userId",
  p."workshopId",
  w."meetingId",
  w."projectId",
  bool_or(p.attended or p.competed) as workshop_star,
  bool_or(p.competed)               as competition_star,
  bool_or(p.won)                    as won
from participation p
join platform.workshops w on w.id = p."workshopId"
group by p."userId", p."workshopId", w."meetingId", w."projectId";
```

`workshop_star` is `attended or competed`, which is exactly the rule — attending
earns it, and competing implies it. `competition_star` requires the second
branch. A supplementary workshop has no competition, so only the first branch can
ever produce rows for it.

**The view never reads `submissionState`**, which is the point of splitting the
two columns: it would otherwise have to know that a closed PR after judging still
counts and a closed PR before judging does not, and that rule has no business
being restated in SQL. `competedAt` carries the answer already.

`security_invoker = on` is load-bearing, as it is on
[`memberPoints`](./elections.md#lifetime-points-per-member): without it the view
runs as its owner and hands every caller the full attendance ledger, straight
past the own-rows-only policy in the table above.

Add covering indexes on `attendance ("userId", "workshopId")`,
`teamMembers ("userId", "teamId")`, and `teams ("competitionId")`; the view is
read on every profile and star-grid render.

A member's **lifetime points** follow the same derived-never-stored rule, but
they sum `competitionStandings` rather than attendance, so that view lives with
the scoring it reads: see
[`memberPoints`](./elections.md#lifetime-points-per-member).

### Permissions

**Three** new boolean columns on `platform.roles`, each threaded through
`resolvedUserPermissions` and given a `canUser*` wrapper in
`server/actions/permissions.ts` alongside the existing seven:

| Column              | Grants                                       |
| ------------------- | -------------------------------------------- |
| `canEditAttendance` | Add or remove attendance rows on any meeting |
| `canExportStars`    | Download `stars.csv`                         |
| `canTriggerSync`    | Run the Airtable sync by hand                |

**There is deliberately no `canManageMeetings`.** Meetings, workshops,
competitions, and side awards are authored in Airtable, and access to the base
_is_ the permission — adding a second one in Postgres would mean two systems that
can disagree about who is an officer. See
[The officer surface](#the-officer-surface).

`canExportStars` stays separate from `canEditAttendance` because the export
carries every member's email, and reading the whole club's contact details is a
different grant from correcting one roster. `canTriggerSync` is separate because
the button is reachable from Airtable, where the audience is everyone with base
access rather than everyone who can fix a roster.

Note the honest limit on all three: they gate the **platform's** surfaces only.
Anyone with Airtable access can export the roster and the attendance mirror from
the base directly, and no Postgres permission can prevent that. Base access is
the real boundary — which is the same reasoning that removed `canManageMeetings`,
applied to reads instead of writes.

Remember to update the `resolvedUserPermissions` view **and** the refresh
triggers in `20260728000000_platform_resolved_permissions_triggers.sql` — a new
column that the trigger does not recompute will silently read as `null`.

### Application layer

| Path                               | Contents                                                                |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `server/actions/teams.ts`          | create, join, invite, request, respond, leave, transfer, re-form        |
| `server/actions/attendance.ts`     | check-in, officer roster edits                                          |
| `server/actions/meetings.ts`       | award, submission override, manual lock                                 |
| `server/teams/requireCanJoin.ts`   | The six checks, shared by all three join paths                          |
| `server/teams/lockState.ts`        | The derived lock predicate, one definition                              |
| `server/loaders/meetings.ts`       | Meeting list, workshop detail, calendar frames                          |
| `server/loaders/teams.ts`          | Team detail, roster, pending requests                                   |
| `server/loaders/stars.ts`          | `memberStars` reads for profile and grid                                |
| `server/loaders/points.ts`         | `competitionStandings` and `memberPoints` reads                         |
| `server/email/send.ts`             | `getCloudflareContext().env.EMAIL` wrapper, retries, suppression        |
| `server/github/teamSync.ts`        | Team/branch creation, member add and remove, reconcile                  |
| `app/(api)/export/stars/route.ts`  | Cross-semester CSV, streamed                                            |
| `app/(api)/airtable/sync/route.ts` | Manual sync trigger, permission-gated                                   |
| `server/airtable/client.ts`        | Typed REST wrapper, PAT from Vault, rate-limit backoff                  |
| `packages/airtable/`               | The field registry; see [Setup](./airtable-setup.md#the-field-registry) |
| `server/airtable/sync.ts`          | Upsert by `airtableRecordId`, refusals, status write-back               |
| `server/airtable/push.ts`          | Projects mirror, counts, points, attendance rows and counts             |

Plus two new workspace packages:

| Path              | Contents                                                     |
| ----------------- | ------------------------------------------------------------ |
| `packages/email/` | react-email sources, compile step, generated typed templates |
| `packages/db/`    | The shared `postgres-js` + Drizzle client factory            |

`packages/email`'s `build` task emits `dist/` and must be declared as a turbo
dependency of the platform build, or a stale artifact ships. Because `dist/` is
gitignored, the rendered snapshots under `__snapshots__/` are what make a design
change visible in review.

`packages/db` **exists**; it replaced the byte-identical clients in both Next
apps. See [Extract the client](#extract-the-client-into-packagesdb).

**`lockState.ts` deserves being a module rather than an inline condition.** The
predicate is read by the join checks, the team page, the star view's SQL
equivalent, and the UI that decides whether to show a "close your PR to add
someone" hint. Four copies of a three-term boolean is exactly the kind of drift
that produces a screen saying a roster is open while the action rejects the
join.

### Scheduled work

`apps/platform/cloudflare/scheduled.ts` gains three passes on top of what the
sandbox and election work already need. Listing them together because they are
easy to design one at a time and then forget to schedule:

| Pass             | Cadence | Does                                                |
| ---------------- | ------- | --------------------------------------------------- |
| Airtable sync    | 15 min  | Everything in the next section                      |
| Judging start    | 5 min   | Freeze `competedAt`, create solo teams, hard-lock   |
| GitHub reconcile | nightly | Repair team membership that a failed webhook missed |

`wrangler.jsonc` currently declares `["0 0 * * *", "*/10 * * * *"]`, so the
triggers have to be widened before any of this runs. Cloudflare allows several
cron expressions per Worker and `scheduled.ts` already dispatches on
`event.cron`, so this is a config change rather than a new deployment unit.

#### The judging-start pass

Small, and load-bearing: **no competition star is ever awarded without it.**
Every five minutes, for each competition whose `judgingStartsAt` has passed:

1. **Freeze participation** — the `competedAt` update from
   [the entry state machine](#the-entry-state-machine). This is the step that
   turns a live entry into a permanent fact, and the window matters: a PR closed
   between judging starting and this pass running costs that team its star. Five
   minutes is tight enough that it would take deliberate effort to lose one, and
   the officer override exists for the case where somebody manages it.
2. **Create solo teams** for members of that workshop who never joined one, so
   attribution has a row to hang on.
3. Nothing else. The roster hard-lock needs no write — it falls out of
   `judgingStartsAt` in the predicate.

Idempotent throughout, by the `competedAt is null` guard and by skipping members
who already have a team. Re-running it is a no-op, which is what makes a
five-minute cadence safe.

This is deliberately **not** folded into the election tally cron, even though
both run every five minutes. The tally blocks on ungraded competitions and on a
missing tiebreak ballot; freezing participation must happen whether or not
grading is done, or a slow officer would cost every team its star.

### The sync pass

Added to `scheduled.ts`, every 15 minutes, and shared verbatim with the manual
trigger:

1. Take the advisory lock, or return "already running".
2. Push `projects` into Airtable (upsert by slug), on change only.
3. Fetch Meetings, Workshops, and Competitions modified since
   `airtableSyncState.lastSyncedAt`.
4. Upsert into Postgres keyed on `airtableRecordId`.
5. For each refused edit, write the reason into that record's `Sync status`.
6. Soft-archive Postgres rows whose Airtable records are gone.
7. Push changed derived fields — attendance rows and counts, team counts, Teams
   mirror with points, per-member meetings-attended — batched 10 records per
   request, skipping rows whose values are unchanged. Then read the
   officer-authored `Requirements met` and side-award fields back into Postgres.
8. Send queued invitation emails: every pending request with a null `notifiedAt`,
   stamping it on success. This is a **retry path, not the send path** — the
   server action already sent on commit, so anything the cron finds here is
   something that failed.
9. Reconcile GitHub team membership against `teamMembers`, for the same reason.
10. Advance `lastSyncedAt` **only if the pass completed** — a partial pass must
    re-fetch the same window rather than skip it.

Airtable's API rate-limits at 5 requests/second per base, so the client needs
backoff. At one base and a few hundred records that is not a real constraint, but
an unhandled 429 in a cron job fails silently.

**Sync refusals need a test each**, because they are the rules that protect
already-earned credit: a workshop's meeting changed, its project changed, a
finalized competition's `requirementCount` edited, and `judgingStartsAt` moved
after the freeze — each against a row with attendance or a published result. Plus
the delete-becomes-archive path, and a rename asserting that attendance still
resolves.

### Tests

- **RLS persona tests** in `packages/sb/testing/` — extend `personas.ts` rather
  than inventing a parallel fixture. Since writes no longer pass through
  Postgres, these now cover the **read** path and the deny-all write policies:
  a member cannot read another member's attendance; `memberStars` returns only
  the caller's rows; and an `authenticated` JWT cannot insert into `teamMembers`
  through PostgREST even though server actions can.
- **Authorization tests belong with the actions**, not with the personas, and
  they are the ones to write first. Every mutating action called by a member who
  lacks the permission must reject — a suite that enumerates the exported
  actions and asserts each one refuses an unprivileged caller catches the
  failure mode this architecture introduces, which is an action that simply
  forgot to check.
- **Concurrency, both races, driven through the real actions in parallel** — not
  as sequenced statements, which pass trivially and prove nothing:
  - Two accepts for the **same user** across two teams in one competition ⇒ one
    membership, one `already_on_team`. Proves the `23505` is caught and
    translated rather than the check being trusted.
  - Two accepts against a team with **one seat left** ⇒ one membership, one
    `team_full`. Proves the `for update` lock is present; without it this test
    is the one that fails.
- **Star derivation** — table-driven over the view: attended only; competed
  without attending (must yield both stars); on a team that never submitted (must
  yield neither); supplementary workshop (must yield exactly one); officer-added
  attendance row (star appears with no other write).
- **Attendance/workshop agreement** — an attendance row naming a workshop from a
  different meeting must raise, and both valid shapes (a workshop row and a
  null-workshop judging row) must insert.
- **Re-form** — source roster larger than target cap, and a member already placed
  in the target competition.
- **Access is immediate** — joining a team grants GitHub membership and a sandbox
  credential without any lock or cron pass intervening, and leaving revokes both.
- **The entry state machine**, table-driven and walked in order, because the
  interesting cases are all sequences rather than states. Minimum: open → locked;
  close before judging → **unlocked**; reopen → locked; judging begins →
  `competedAt` frozen; merge the winner → star kept; **close every losing PR
  after judging → stars kept**; and a team whose PR was already closed at judging
  → no star, ever. The second-to-last is the one the previous design got wrong,
  so it is the one that most needs a test.
- **The freeze pass is idempotent** — running it twice must not move
  `competedAt`, and must not award a star to a team whose PR closed in between.
- **A null `judgingStartsAt` freezes nothing** and leaves rosters open, and a
  competition still null two weeks after its opening workshop surfaces as needing
  attention rather than quietly costing every team a star.
- **Two competitions judged at one meeting, forty minutes apart** — the first
  locks and freezes while the second is still open to joins. This is the case the
  old meeting-derived time could not express, so it is the one that proves the
  column earns its place.
- **Leaving one of two teams on a shared environment** must not disable the
  credential, per the reachability rule. This is the failure mode most likely to
  survive review, because it only appears with a lead running two projects.
- **Provisioning failure is recoverable** — a join whose GitHub call throws still
  commits the membership, and the reconcile pass repairs it. Assert the row
  exists after a simulated GitHub outage.
- **Manual sync** — two concurrent calls, the second returning "already running"
  rather than double-applying.
- **CSV** — RFC 4180 quoting against a team or member name containing a comma
  and a quote, and a stars export spanning two semesters.
- **Email rendering** — snapshot the compiled HTML of each template, so a change
  to a shared component cannot alter an invitation unnoticed. Plus two the
  compile step needs specifically: **every slot is filled** for a fully-populated
  props object, so no `⟦token⟧` can reach an inbox; and **a value containing
  `<script>` is escaped** in the output, since team names are user-authored.
- **Template branching is rejected** — a template that reads a prop inside a
  conditional must fail the compile step rather than silently baking in one
  branch.

## Resolved

- **A competition is a week-long async window**, opened by a workshop at one
  meeting and judged at a later one. It is not a room and has no check-in.
- **Workshops run in parallel**, one per project, so attendance keys to the
  workshop. Check-in codes were per workshop for the same reason; the Airtable
  form's Workshop link replaced them on 2026-08-06.
- **The competition star requires having had a live entry when judging began**,
  not attendance — there is nothing to attend — and it is frozen into
  `competedAt` so the post-competition PR cleanup cannot revoke it.
- **The workshop is not a prerequisite for competing.** Competing earns both
  stars.
- **Check-in windows are gone** along with the codes; the Airtable form's own
  open and close is the only gate, and the platform does not model it.
- **Projects are their own table**, because the study group finder carries two.
- **Default team size is 4**, overridable per competition.
- **Invitation email goes through the Cloudflare `send_email` binding**, because
  Supabase only sends auth templates.
- **Templates are defined in code** with react-email, and the marketing ESP gets
  a rendered export of the same layout rather than its own design.
- **Templates compile to HTML at build time**, so React never ships to the
  Worker and runtime substitution is a loop over two arrays. The generated types
  make `render(name, props)` checked against the component.
- **Writes are server actions over Drizzle, not Postgres RPCs.** RPCs exist for
  client-agnostic surfaces; nothing here has a second client. The deny-all write
  policies and every database invariant stay regardless.
- **Attendance is pushed to Airtable, never pulled** — officers get the dues
  cross-reference without attendance gaining a second writer.
- **The per-meeting attendance CSV is cut.** Airtable's native grid export covers
  it once attendance is pushed there; only `stars.csv` survives, because stars
  are derived and pushing them would cost more than the endpoint.
- **Access is granted at join, not at lock.** GitHub membership and sandbox
  credentials track the live roster in both directions, and the lock does
  nothing but stop new members joining.
- **The lock is derived, not scheduled** — a live entry or judging start,
  whichever is first — and closing the PR before judging reopens the roster. No
  deadline column.
- **Judging has an authored `judgingStartsAt`**, not the judging meeting's
  `startsAt`. Presentations are their own slot: two competitions judged at one
  meeting can start at different times, judging can have a meeting to itself, and
  the lock predicate reads one row instead of joining through to `meetings`.
- **Lock state and participation are separate columns.** `submissionState`
  tracks the PR forever; `competedAt` is frozen once at judging. Derive what is a
  question about now, store what is a question about a past moment.
- **The Drizzle client moves to `packages/db`**, shared by both Next apps. The
  proxy worker stays on supabase-js against its narrow role — the RPC there is a
  privilege boundary, not a client-library choice.

## Open decisions

- **Check-in code rotation interval** — a display detail, but it sets how long a
  leaked code stays useful.
- **Grace period length.** 30 minutes is the assumed default; it belongs
  alongside `defaultMaxTeamSize` in `platform.instance`.
- **What "submitted" means for a team that presents without a PR.** The
  `setSubmission` override exists; whether officers should routinely use it, or
  whether a missing PR should simply cost the star, is a club policy call.
- **Whether a team should be able to reopen an entry after judging.** The state
  machine permits `closed → open` at any time, but the freeze has already run, so
  reopening earns nothing. Harmless, and arguably confusing enough to warrant
  refusing it outright.
- **Which ESP.** Mailchimp, Brevo, and Loops all have free tiers above club
  volume and all accept an uploaded HTML template with editable regions. The
  choice barely matters given templates live in code; pick on whoever finds the
  campaign editor least annoying.

## See also

- [Elections](./elections.md) — how teams vote on each other, and how the
  1000-point split decides the competition winner.
- [Airtable Base Setup](./airtable-setup.md) — scaffolding the base, the field
  registry, and the member identity columns that have to exist first.
- [Sandbox Environments](./sandbox-environments.md) — how a team gets a shared
  Supabase instance to build against.
