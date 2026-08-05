---
name: Sandbox Environments
description: How a competition team gets one shared Supabase instance without anyone holding a secret key — the OAuth integration, the proxy worker, and the control plane.
---

# Sandbox Environments

> **Status: schema built and verified; control plane and proxy not built.** The
> three migrations, the `sandbox_proxy` role and both RPCs exist and are covered
> by database tests. The provisioning module, CLI and proxy Worker are not
> written yet. The Supabase APIs the rest depends on were exercised end to end
> against a real free-plan account — see [Spike results](#spike-results) — so
> the numbers and behaviors quoted below are measured rather than assumed.
> Blocks marked **Measured** are observations; everything else is design intent.
>
> Not to be confused with the [Sandbox App](./sandbox-app.md), which is the
> moderation fixture schema. Unrelated, unfortunately similar name.

A competition team needs one Supabase instance they all build against. The reason
is mobile: to test the study group finder's messaging you need two people
messaging each other, and while a second browser profile is free, a second
Android or iOS VM is not. The fix is not more emulators. It is **one shared
backend, with each teammate on their own real device signed in as themselves**.

That requirement — shared instance, individual identities — is what the rest of
this page is about.

## What was ruled out, and why

**Supabase branching.** The obvious answer, and the one to revisit if the budget
ever allows. A branch per team, seeded from `packages/sb/supabase/migrations`,
destroyed after judging. At $0.01344/branch/hour that is roughly $6.50 for a
weekend event with ten teams and $22.50 for a full week — affordable in
principle, but it requires the paid plan on every instance involved and the club
is optimizing for zero.

The design below keeps branching reachable: `sandboxEnvironments.kind`
distinguishes an owned project from a branch, and switching later changes the
provisioning step and nothing else.

**Handing out the secret key.** Sharing one project's `service_role` across a
team means three laptops hold a key that bypasses RLS entirely, revocation is
all-or-nothing, and nothing is attributable. A `.env.local` committed to a team
branch leaks everything.

**Supabase organization member management.** This one is not a choice. Supabase
OAuth apps expose an `Organizations` scope that is **read-only — write is
documented as N/A** — and no scope grants member invitation. You can enumerate
an org's members on a user's behalf; you cannot add anyone to one.

That single fact determines the architecture: **manage credentials, not
collaborators.** Nothing in the Supabase API makes shared human access to an
instance automatable, so the platform brokers access instead.

## Where the instance comes from

Each environment is a **free project owned by the team lead**, created by the
platform through Supabase OAuth.

The scope set the spike ran against, which is the one to register the real OAuth
app with:

```
projects:read   projects:write     -- create the project, read its status
secrets:read                       -- retrieve its API keys
database:read   database:write     -- run migrations through database/query
auth:read       auth:write         -- configure the DevDogs sign-in provider
organizations:read                 -- resolve the target org, count capacity
```

> **Measured:** the token response does **not** include a `scope` field, so
> there is no way to confirm from the grant which scopes were actually approved.
> The only check is calling an endpoint and seeing whether it succeeds — worth a
> startup probe in the real integration rather than discovering a missing scope
> mid-provision.
>
> Access tokens last **86,400s (24h)**, so a daily refresh on the existing
> Cloudflare cron has ample margin.

### Environments are separate from teams

An environment is **not** owned by a team. It is owned by a person, and teams
attach to it. That separation is what makes reuse and sharing possible:

- A team can attach an **existing** environment instead of provisioning a new
  one, which is the common case for a returning team.
- **Several teams can share one environment** when their events overlap — a lead
  running two projects the same week does not need two projects.

So `sandboxEnvironments` holds the project, and `teamEnvironments` is a thin
join from a team to the environment it uses. The proxy hostname belongs to the
environment, not the team.

Sharing is therefore available to a person across the teams _they lead_, not
across arbitrary teams; the next section explains why that falls out of the
ownership rule rather than being an extra restriction.

### Capacity and lead reassignment

The free plan grants **two projects, counted across every organization where the
member is an owner or admin** — not two per organization. The team lead owns
their team's environment, so a lead who is already at two projects cannot
provision a third.

Rather than silently picking a different owner, provisioning **checks and then
asks**:

1. For every member with a linked Supabase account, call `GET /v1/projects` and
   count what they own. Members without a linked account show as unknown rather
   than zero — the platform genuinely cannot tell.
2. If the lead has capacity, provision under them. Done.
3. If not, present the three ways out: **attach an existing environment**,
   **pause one of the lead's active projects** to free a slot, or **transfer team
   lead** to a member who has one.

All three remedies are the team's decision, not the platform's. Automatically
reassigning ownership would put a project — and its billing relationship — into
somebody's Supabase account without them choosing it, and automatically pausing
one would take somebody's unrelated app offline.

Transferring lead is available here precisely because nothing is attached yet.
Once an environment exists, the same transfer requires detaching it first — see
below.

### Pausing to free a slot, in-flow

A lead at the two-project ceiling should not have to leave for the Supabase
dashboard, work out which project to pause, wait, and come back. The connect
screen lists their projects and offers to pause one on the spot.

This is only a comfortable thing to offer because **pausing is reversible**: a
paused project restores in about three minutes and stops counting against the
cap immediately. The UI should say so, because "pause my project" reads as
destructive until you know that.

The list comes from `GET /v1/projects` under the lead's own token, so it includes
projects that have nothing to do with DevDogs. That makes presentation the
careful part:

- **Show name, organization, status, and region** for each — enough to tell a
  forgotten experiment from something live.
- **Label which are DevDogs environments** by matching against
  `sandboxEnvironments.projectRef`. Everything unmatched is the member's own
  project, and should be visually distinct.
- **Never pre-select anything, and never pause more than one per confirmation.**
  This is the one place the platform acts on infrastructure outside its own
  domain; it should feel like an explicit, singular choice every time.

Two refusals are worth enforcing rather than warning about:

- **A DevDogs environment still attached to a team with an open competition cannot be
  paused here**, for the same reason the auto-pause cron waits for the last
  attached team. Offering it would let one lead break another team's event.
- **The environment being provisioned into cannot be the one paused**, which
  sounds obvious but is easy to allow when the list is generic.

Because pausing takes about 80 seconds and the slot is not free until the project
reports `INACTIVE`, the flow **polls and then continues automatically** into
provisioning rather than returning the lead to the start. Retrying the create
immediately would fail on a quota that has not yet been released.

Two facts make the ceiling mostly self-managing. **Paused projects do not count
toward the limit**, and free projects pause after a week of inactivity, so an
environment stops consuming its owner's quota shortly after the event ends.
Auto-pause (below) makes that immediate rather than incidental.

### The owner is the lead, and the database enforces it

The invariant is:

> The environment's owner is the **lead** of every team attached to it.

This mirrors reality rather than imposing on it. The lead is the person who can
manage the environment from the Supabase dashboard, because it is their project;
giving them sole authority over it inside the platform keeps the two consistent.
It follows that **two teams sharing an environment must have the same lead** —
sharing is a person reusing their own project across their own teams, which is
exactly the case it was introduced for.

It is enforceable declaratively. The obstacle is that Postgres foreign keys
cannot reference a _partial_ unique index, so `unique (teamId) where role='lead'`
is not a usable FK target. Carrying `role` into the key sidesteps that:

```sql
alter table platform."teamMembers"
  add primary key ("teamId", "userId"),
  add unique ("teamId", "userId", role);      -- non-partial, so FK-able

alter table platform."sandboxEnvironments"
  alter column "ownerUserId" set not null,
  add unique (id, "ownerUserId");             -- backs the first FK below

platform."teamEnvironments" (
  "teamId"        uuid primary key references platform.teams(id) on delete cascade,
  "environmentId" uuid not null,
  "ownerUserId"   uuid not null,              -- denormalized from the environment
  "ownerRole"     platform."teamRole" not null default 'lead',
  "attachedAt"    timestamptz not null default now(),
  "attachedBy"    uuid not null,

  constraint owner_is_lead check ("ownerRole" = 'lead'),

  foreign key ("environmentId", "ownerUserId")
    references platform."sandboxEnvironments"(id, "ownerUserId"),

  foreign key ("teamId", "ownerUserId", "ownerRole")
    references platform."teamMembers"("teamId", "userId", role)
    on update restrict on delete restrict
);
```

Three pieces, no triggers. The `check` pins `ownerRole` to `'lead'`; the second
FK then requires a `teamMembers` row with that exact role; the first FK ties the
denormalized owner back to the environment's real one. Together they mean every
team attached to an environment is led by that environment's owner — and
therefore by the same person.

**`on update restrict` is doing as much work as `on delete restrict`.** Demoting
the lead in `teamMembers` would orphan the referencing row, so Postgres rejects
it outright. That is the desired behavior, and it has a consequence worth stating
plainly to leads:

> Transferring team lead requires detaching the environment first.

There is no way around this and it is not a modelling artifact. The project lives
in the original owner's Supabase organization and no API can move it, which is
the same constraint that rules out managing collaborators. A new lead gets a new
environment; the old one keeps its project.

`ownerUserId` becoming `not null` also means a deleted account can no longer null
it out. Account deletion orphans the environment instead — see below.

### End of life: detaching, revoking, and orphaning

An environment outlives the events that use it, so "no active team" is a normal
resting state rather than a teardown trigger. Three distinct endings:

| State        | Meaning                                                | Trigger                          |
| ------------ | ------------------------------------------------------ | -------------------------------- |
| **detached** | No team attached; project still exists and is reusable | Last event ended, teams detached |
| **revoked**  | Deliberately torn down                                 | Owner or officer action          |
| **orphaned** | Upstream project no longer exists                      | Reconcile finds it gone          |

**Detached is not teardown.** Reuse is an explicit goal, so a detached
environment keeps its project, its hostname, its Vault secrets, and its member
credentials. It simply auto-pauses and waits. Deleting its secrets here would
make "attach my environment from last month" require full re-provisioning, which
is the friction this feature exists to remove.

#### Hostnames are retired, never recycled

When an environment is revoked or orphaned, its hostname is **permanently
retired**. It is never reassigned to a different environment.

This matters more than it looks. A stale `.env` file or an already-installed
Flutter build still points at `<env>-sandbox.devdogsuga.org`. If that name later
resolved to a different team's project, an old build would silently read and
write someone else's database — with a valid-looking hostname and no error. A
retired hostname costs one row on a wildcard domain; recycling one costs a
cross-team data leak.

The proxy answers a retired hostname with **410 Gone** and a body explaining
which environment it was and that it has ended, so an old build fails
legibly rather than looking like a network problem.

#### Secret teardown order

On revoke or orphan, the order matters:

1. Revoke every `sandboxCredentials` row, so no new request can resolve.
2. Delete the Vault secrets — `secretKeySecretId` and `jwtSecretId` — with the
   existing `deleteVaultSecret` helper.
3. Detach any remaining teams and mark the hostname retired.

Credentials first. Deleting the secrets first would leave live credentials
resolving against a half-dismantled environment, which fails in more confusing
ways than a clean rejection.

#### When the owner deletes their project

This will happen, so it needs to be routine rather than an incident.

The nightly reconcile is the authority: it calls `GET /v1/projects/{ref}`, and a
404 — or absence from `GET /v1/projects` — means the project is gone. **The proxy
must not make this determination**, because a transient upstream error would
otherwise orphan a healthy environment.

On confirmation, the environment moves to `orphaned`, runs the teardown above,
and notifies the owner and every affected team lead. The console then offers
one-click re-provisioning, which creates a **new** environment with a **new**
hostname — never a resurrection of the old one.

The blast radius is deliberately small, and worth stating plainly to teams:
migrations live in git, so re-provisioning restores the entire schema. Only test
data is lost, because that is the only kind of data these instances are ever
supposed to hold.

Two related cases fold into the same path. A project paused beyond Supabase's
**90-day restore window** is effectively deleted, and the cron should mark it
orphaned pre-emptively rather than discovering it at wake time. And because
`ownerUserId` is now `not null`, a deleted user account orphans their
environments rather than nulling the column.

### Lifecycle toggles

Two switches per environment, **both on by default**, editable by the
environment's owner:

| Toggle         | Default | Effect                                                                 |
| -------------- | ------- | ---------------------------------------------------------------------- |
| **Pre-warm**   | On      | The cron wakes this environment ahead of competitions that will use it |
| **Auto-pause** | On      | The environment is paused once the last attached event has ended       |

Auto-pause is what keeps a shared free plan livable — it returns the owner's
project slot immediately rather than waiting a week for Supabase's own pause. A
lead who is actively building between events turns it off.

**Auto-pause must wait for the last attached team.** A shared environment is
attached to several teams whose events end at different times; pausing when the
first one finishes would break everyone else. The cron pauses only when no
attached team has an open competition.

The toggles live on the environment rather than the team because a shared
environment has exactly one owner and therefore one lifecycle.

## Three planes

The key insight is that "access to the instance" is three different problems
with three different transports, and conflating them is what makes the design
look hard.

| Plane                             | Transport | Mechanism                          | Who               |
| --------------------------------- | --------- | ---------------------------------- | ----------------- |
| Data — REST, Realtime, Storage    | HTTPS/WSS | `apps/sandbox` proxy               | Any active member |
| Control — migrations, reset, seed | SQL       | Platform → Supabase Management API | Any active member |
| Secrets                           | —         | Supabase Vault on the platform     | Platform only     |

### Why the control plane is not proxied

`supabase db push` speaks the **Postgres wire protocol**, not HTTP. An HTTP
worker cannot proxy it, and implementing wire-protocol auth injection over
Workers TCP sockets is a large, fragile thing to own during an event weekend.

Instead the Management API's `POST /v1/projects/{ref}/database/query` runs SQL
under the owner's OAuth token. The endpoints this design depends on, confirmed
against the live OpenAPI spec at `api.supabase.com/api/v1-json`:

| Endpoint                                 | Purpose                          |
| ---------------------------------------- | -------------------------------- |
| `POST /v1/projects`                      | Provision a team's project       |
| `GET /v1/projects/{ref}`                 | Read status                      |
| `GET /v1/projects/{ref}/api-keys`        | Retrieve publishable/secret keys |
| `POST /v1/projects/{ref}/database/query` | **[Beta]** Run SQL               |
| `POST /v1/projects/{ref}/restore`        | Wake a paused project            |
| `POST /v1/projects/{ref}/pause`          | Auto-pause; free a slot in-flow  |

All authenticate with a bearer token, so an OAuth token works wherever a
personal access token does, subject to scopes.

**`database/query` is marked Beta**, and it is the single point the entire
control plane rests on. Treat its stability as a risk to re-check before each
event, and keep the fallback in mind: the owner can always run migrations from
their own machine with the CLI.

> **Measured: `database/query` is atomic.** A multi-statement payload with a
> deliberate error in the middle rolled back completely — both bare and wrapped
> in explicit `begin`/`commit`, nothing persisted.
>
> A failed migration therefore leaves the schema untouched rather than
> half-applied, so the migration driver needs **no repair path** and
> `pnpm sb push --team` does not need idempotency for correctness. All 24 real
> migrations applied cleanly, the largest at 23 KB, so payload size and statement
> timeouts are not a concern at current sizes.

> **Measured: select API keys by `type`, not by name.** A fresh project returns
> four keys — `anon`, `service_role`, and _two_ both named `default`. The new
> publishable/secret pair is distinguishable only by its `type` field, so
> matching on the name either picks a deprecated key or is ambiguous.

The legacy `anon`/`service_role` key endpoints are explicitly documented as
slated for removal, which is why this design uses publishable/secret naming
throughout.

```
pnpm sb push --team lantern
  → platform server action
  → authorize against teamMembers
  → Management API query endpoint (owner's OAuth token)
  → audit log
```

Every member gets full DDL, migrations, and reset. Nobody holds a key, and the
owner never opens the dashboard.

## The proxy

`apps/sandbox` is a Cloudflare Worker sitting in front of each team's project.
It follows the same wrangler layout as `apps/platform` and
`apps/schedule-builder`.

```
apps/sandbox/
  wrangler.jsonc          route: *-sandbox.devdogsuga.org/*
  package.json            deps: @devdogsuga/sb, @devdogsuga/with-env
  src/
    index.ts              path-class router
    credential.ts         token → resolve_sandbox_credential
    rewrite.ts            headers, query params, Storage response URLs
    upstream.ts           forward, including WebSocket upgrade
```

### The hostname is one label deep, deliberately

`<env>-sandbox.devdogsuga.org`, **not** `<env>.sandbox.devdogsuga.org`.

Cloudflare's Universal SSL covers the apex and first-level subdomains only.
Anything deeper needs Advanced Certificate Manager at around $10/month. Keeping
the label flat puts every environment under the free `*.devdogsuga.org` wildcard.

A single wildcard DNS record plus one worker route covers every environment
forever, so creating one writes a database row and does no DNS work at all.

The hostname keys to the **environment**, which is what makes reuse work: a team
that re-attaches last event's environment keeps the same URL, so existing app
builds and `.env` files keep working with no changes.

### Hostname per environment, tokens per member

The hostname identifies the environment; an opaque token identifies the member
_and_ the authority they are asking for.

Keying the hostname to the member would break the canonical test — one member's
build running on another member's phone. That build would carry the first
member's URL and token, so the second member's actions would attribute to the
first, and revoking the first would brick the second's installed app.

Member tokens are opaque random strings stored hashed, following the
`reportApiKeyHash` pattern already in `oauthRegistrations`, and prefixed
`dd_publishable_` / `dd_secret_` to mirror upstream.

### What the proxy actually does per request

Members sign in through the **proxied GoTrue**, which returns a genuine
Supabase-signed user JWT. That token is valid upstream on its own, so the normal
data path needs no rewriting beyond swapping the key:

| Request                                  | Behavior                                                        |
| ---------------------------------------- | --------------------------------------------------------------- |
| `apikey` = `dd_publishable_*`            | Swap for the real publishable key; pass `Authorization` through |
| `apikey` = `dd_secret_*`, non-browser UA | Swap for the real secret key; always logged                     |
| `apikey` = `dd_secret_*`, browser UA     | `401`, matching upstream                                        |
| Anything else                            | Reject                                                          |

### Authority follows the credential, not a header

Every member holds **two** tokens per environment, and which one they present is
what decides their authority — exactly as upstream, where `sb_publishable_…`
means `anon`/`authenticated` and `sb_secret_…` means `service_role`.

```ts
createClient(url, "dd_publishable_…"); // browser
createClient(url, "dd_secret_…"); // server, seeding, tooling
```

An earlier draft used a custom `x-devdogs-role: secret` header instead. It was
wrong on both axes this design cares about. On fidelity, it is a DevDogs-ism in
a system whose entire selling point is that a sandbox behaves like the real
thing, so code written against it needs a rewrite to ship. On security, a header
can be attached to any request by anything holding the one token, whereas a
scope-bearing credential is provisioned, disabled, and audited on its own —
elevation becomes something granted rather than something asserted.

`proxyRequestLog` already carries `credentialId`, so "always logged" is a join
to that credential's scope rather than a trusted header.

**Mirror the upstream prefixes.** `dd_publishable_` and `dd_secret_` are what
make the CI secret scan on `team/**` branches able to pattern-match at all, and
they make an accidental elevation visible in a diff.

**Secret tokens are refused in the browser**, matching on `User-Agent` the way
upstream does. Without it a student ships `dd_secret_` to the browser, it works
all week against the sandbox, and the identical code `401`s in production.

### The sandbox must be able to represent a logged-out user

The same draft had a third row: _tooling with no user session gets a minted
`authenticated` JWT bound to the member_. It is deleted, and it was the more
damaging of the two divergences.

Upstream, a publishable key with no `Authorization` header runs as `anon` and
`auth.uid()` is null. Minting replaces that with a real session, which means the
sandbox never once exercises the logged-out path — the state every public page,
every sign-up flow, and every unauthenticated visitor starts in. A policy scoped
`to authenticated` that was meant to be public reads fine all week and returns
an empty array on demo day. An app never has to wire up sign-in to work, so the
auth flow's first real exercise is in front of judges. And because the mint is
bound to whoever's token it is, every script-written row is owned by the same
member, so anything keyed to authorship goes untested.

Worse, it diverges from _itself_: the same query against the same table returns
different rows depending on whether the caller is a browser with a session or a
script, which is not a distinction Supabase makes anywhere.

Deleting the row removes no capability, because scoped tokens give all three
underlying cases a faithful home:

| Intent                      | How, and it is the upstream how                          |
| --------------------------- | -------------------------------------------------------- |
| Bypass RLS to seed or debug | `dd_secret_` → `service_role`                            |
| Act as a specific user      | Sign in through the proxied GoTrue, use the returned JWT |
| Be logged out               | `dd_publishable_`, no `Authorization` → `anon`           |

The third was unreachable before. The second already works — `/auth/v1/*` is
proxied — and was the only case minting genuinely served; it served it by
papering over the first and deleting the third.

The ergonomic cost is real: quick scripting now means signing in or reaching for
the secret token. That belongs in the CLI rather than in a proxy that silently
rewrites semantics, so **`pnpm sb link` writes both tokens** under the names a
real project uses. The student then chooses the same way they will in
production, having been shown the distinction exists.

Removing the mint also means the worker never signs anything, so it has no use
for the environment's JWT secret and `resolve_sandbox_credential` stops
returning it. Incoming user JWTs are passed through for upstream to verify;
attribution comes from the member token, which the worker has already resolved.
That is a real narrowing of the one call the proxy can make.

### Secrets are read through a narrow RPC

The worker must not hold the platform's own secret key — that would be a larger
key than the ones being protected. Instead, a `SECURITY DEFINER` function in the
style of the existing moderation RPCs.

**This is the one place in the teams work that stays an RPC**, and it is the
clearest possible illustration of the rule that governs the rest: the caller is
the proxy Worker, which is a separate client holding its own narrow role. Team
and attendance writes have no second caller and are
[server actions instead](./meetings-and-teams.md#writes-are-server-actions-not-rpcs);
this one has to be reachable by something that is not the platform, so it lives
where every caller must pass through.

```sql
platform.resolve_sandbox_credential(hostname text, token_hash text)
  returns table (outcome text,            -- ok | unknown_host | retired_host
                                          --    | bad_credential
                 credential_id uuid, environment_id uuid, user_id uuid,
                 project_ref text, upstream_url text, publishable_key text,
                 secret_key text,         -- null unless scope = 'secret'
                 scope platform."proxyScope", environment_name text)
  security definer;

platform.log_proxy_request(credential_id uuid, method text,
                           path text, status smallint)
  returns void security definer;
```

Three things in that signature are deliberate, each replacing something that
would have been a defect:

- **It takes the hostname as well as the token.** Resolving the token alone
  would let a credential minted for environment A be presented at environment
  B's hostname and resolve happily; the Worker would have to remember to compare
  the two itself, on every path, forever.
- **It returns the secret key, and only for a `secret` credential.** The Worker
  needs that key to serve an elevated request. Deciding it here means a
  publishable credential cannot obtain it even if the proxy's routing is buggy —
  the elevation is a database fact rather than an `if` in a Worker.
- **It returns an `outcome` rather than zero rows.** The proxy owes an unknown
  or retired hostname a `410` and a bad credential a `401`, and cannot tell
  those apart from an empty result.

`team_id` is deliberately absent: one environment serves many teams and a member
can be reachable through more than one, so there is no single correct answer.
`credential_id` is what the audit trail actually needs.

`log_proxy_request` is a second function rather than an `INSERT` grant so the
role's table privileges stay at exactly zero, and so the definer can stamp
`lastUsedAt` in the same round trip — which the reachability reconcile reads and
the Worker could not otherwise write.

Execute is granted to a dedicated Postgres role with no other privileges, and
the worker holds only that role's key. A compromised worker yields one team's
config per _valid_ token rather than the whole Vault.

**The role is reached with a self-signed JWT, not a secret API key.** This is
the one place the new-key migration does not reach, and getting it backwards
produces a "narrow" role that is actually `service_role`:

> **Verified: `sb_secret_…` keys cannot be bound to a custom role.** Supabase's
> [API keys guide](https://supabase.com/docs/guides/getting-started/api-keys)
> states plainly that "secret keys authorize access to your project's data via
> the built-in `service_role` Postgres role." There is no role parameter, no
> scoping option. A secret key _is_ `service_role`.
>
> PostgREST still honors a `role` claim, and the
> [signing keys guide](https://supabase.com/docs/guides/auth/signing-keys)
> confirms the claim "must be set to an existing Postgres role in your database,
> such as `anon`, `authenticated`, or `service_role`" — any role `authenticator`
> can switch into qualifies, custom ones included.

```sql
create role sandbox_proxy nologin;
grant sandbox_proxy to authenticator;   -- lets PostgREST SET ROLE into it

revoke execute on function platform.resolve_sandbox_credential(text) from public;
grant  execute on function platform.resolve_sandbox_credential(text) to sandbox_proxy;
```

The `revoke … from public` is not optional — and, as built, it is not
sufficient either. Both halves were measured rather than reasoned about, and
both were wrong in the first draft of the migration:

> **Measured: `revoke … from public` leaves the API roles' grants standing.**
> This schema carries `alter default privileges in schema platform grant execute
on functions to anon, authenticated, service_role`, so every new function
> arrives with EXPLICIT per-role grants alongside the implicit `PUBLIC` one.
> Revoking `PUBLIC` strips `=X/postgres` from the ACL and leaves
> `anon=X/postgres` untouched. The first version of this migration therefore
> shipped a `SECURITY DEFINER` function returning decrypted Vault secrets that
> any browser holding an authenticated JWT could call through PostgREST. Name
> every role explicitly.
>
> **Measured: `PUBLIC` made the narrow role not narrow.** Postgres grants
> `EXECUTE` to `PUBLIC` on every new function, and `PUBLIC` means every role —
> including one created specifically to have none. `sandbox_proxy`, holding no
> table privileges at all, could execute **18** of this schema's functions,
> every one of them `SECURITY DEFINER` and therefore unprotected by its empty
> table grants. `claim_root` was among them.
>
> The fix is schema-wide, because the hole is:
>
> ```sql
> revoke execute on all functions in schema "platform" from public;
> alter default privileges in schema "platform"
>   revoke execute on functions from public;
> ```
>
> Safe to do because all 18 already carry explicit grants to `anon`,
> `authenticated` and `service_role` — checked before revoking, not after. The
> role now reaches exactly two functions where it previously reached twenty, and
> `anon`/`authenticated` are unchanged at 18.

> **Verified end to end against the local stack**, 12/12: PostgREST accepts a
> `role: sandbox_proxy` claim and runs the function; the role cannot read any
> table or call any other RPC; `authenticated` can neither resolve a credential
> nor forge an audit entry; the publishable key is refused; and a JWT naming the
> role but signed with the wrong secret is rejected outright.
>
> `apps/platform/src/server/sandbox/resolveCredential.db-test.ts` keeps all of
> it honest, including a guard that fails the moment a new function reintroduces
> a `PUBLIC` grant.

Vault storage reuses the helpers already in `server/actions/credentials.ts` —
`storeVaultSecret`, `readVaultSecret`, `deleteVaultSecret`.

Do not cache in the first cut. It trades revocation latency for latency that is
not yet a problem.

### WebSockets pass through

Realtime is proxied by fetching upstream with the `Upgrade` header and returning
the response. The worker runs for the **handshake only**; afterwards the client
and Supabase talk through a tunnel the worker is not in. No duration billing, no
memory pinning — a WebSocket costs exactly one worker request.

Calling `accept()` and handling messages would keep the worker engaged for the
connection's lifetime and incur duration charges. That is the Durable Objects
pattern and it is not needed here. If `accept()` is ever used, pass
`{ allowHalfOpen: true }` — Cloudflare documents that the automatic close
behavior interferes with proxying.

**The consequence: the worker cannot rewrite anything mid-stream.** Verified
against `@supabase/realtime-js` 2.110.8 and `@supabase/phoenix` 0.4.5, the
credentials divide as follows:

| Credential                | Where it travels                                      | Rewritable?     |
| ------------------------- | ----------------------------------------------------- | --------------- |
| `apikey`                  | connection query string, via `Socket.endPointURL()`   | Yes — handshake |
| socket auth token         | `Sec-WebSocket-Protocol`, as `base64url.bearer.phx.…` | Yes — handshake |
| `access_token` on join    | `phx_join` payload (`RealtimeChannel`)                | No — in-stream  |
| `access_token` on refresh | `access_token` messages (`RealtimeClient`)            | No — in-stream  |

The two in-stream values need no rewriting, because an authenticated member's
token comes from the proxied GoTrue and is genuinely valid upstream. But it does
mean **unauthenticated Realtime does not work through the proxy** — with no
session, supabase-js falls back to sending the publishable key as the access
token, which would put the member token in-stream where it cannot be swapped.
The messaging feature requires login anyway. Document it as a limit rather than
leaving it to be discovered at 2am.

### Storage needs no rewriting

An earlier draft of this design assumed Storage responses would have to be
rewritten because signed URLs point at the real project domain. **They do not.**

Both SDKs construct the signed URL from the _client's own base URL_ plus a
relative path returned by the server — `@supabase/storage-js` 2.110.8 builds
`` `${this.url}${data.signedURL}` ``, and Dart's `storage_client` 2.6.0 builds
`'$url$signedUrlPath'`. Since the client's base URL is already the proxy
hostname, signed URLs come out pointing at the proxy with no intervention.

### The parts that will take the time

- **Realtime's `apikey` lives in the query string**, so query rewriting is
  required, not just header rewriting. It is the easiest thing to miss and the
  exact path the messaging test depends on.
- **The socket auth token rides in `Sec-WebSocket-Protocol`**, so the handshake
  must rewrite that header too, preserving the `phoenix` subprotocol alongside
  it.
- **GoTrue redirect URLs** must be configured to the sandbox hostname, or the
  DevDogs OAuth round-trip lands back on the bare project.

## Paused instances are normal, not exceptional

Free projects pause after **one week** of inactivity. A team's instance will be
paused every time they come back after a week off, so it is the standard cold
path rather than an edge case. Paused projects stay restorable for **90 days**,
which comfortably covers a semester gap but not a summer — a team returning in
the fall gets a fresh project, not their old one.

`sandboxEnvironments.status` mirrors the Management API's own project status
rather than inventing a parallel vocabulary. The values that matter are `INACTIVE`
(the paused state), `RESTORING`, `COMING_UP`, and `ACTIVE_HEALTHY`; the full
enum also includes `ACTIVE_UNHEALTHY`, `GOING_DOWN`, `INIT_FAILED`, `REMOVED`,
`UPGRADING`, `PAUSING`, `RESTORE_FAILED`, `RESTARTING`, `PAUSE_FAILED`, and
`UNKNOWN`. Store it alongside `lastSeenActiveAt`, and treat anything not
`ACTIVE_HEALTHY` as "not ready" rather than enumerating failure modes in the
proxy.

- **Proxy** — on an upstream 5xx, return a structured 503 with `Retry-After` and
  a machine-readable body, and ask the platform to confirm in
  `ctx.waitUntil()`. Never block a request on a restore that takes minutes.

> **Measured:** a paused project does not return a structured Supabase error. Its
> auth endpoint answers **HTTP 522 with an HTML body** — Cloudflare's
> "connection timed out", because the edge cannot reach a paused origin.
>
> Two consequences for the proxy. **522 is indistinguishable from a transient
> network fault**, so the proxy must not conclude "paused" on its own; it reports
> the failure and the platform confirms with `GET /v1/projects/{ref}`, the same
> rule that governs orphan detection. And **401 must never be treated as
> paused** — a bad member token and a paused project can look alike from the
> edge, and conflating them would send members into a restore loop over a typo.

- **CLI** — recognize that body and print _"waking your team's instance, about
  three minutes"_. Measured restore is 196s, so the estimate can be honest rather
  than vague. This is the highest-value polish in the whole plan; it is the first
  error every team will hit.
- **Console** — show status with a "Wake instance" button, and surface the
  `COMING_UP → RESTORING → ACTIVE_HEALTHY` progression rather than an
  undifferentiated spinner.
- **Cron** — pre-warm every environment with `prewarmEnabled` attached to a team
  whose competition opens within the next **15 minutes at minimum**, in the same
  scheduled worker as the reconcile job. Fifteen sits comfortably above the
  measured 196s restore and absorbs a cron tick landing badly.
- **Cron** — pause every environment with `autoPauseEnabled` once **no** attached
  team has an open competition, returning the owner's project slot
  immediately rather than a week later. Pausing takes ~80s, so the job must
  re-check status on the next pass rather than assume the slot is free when the
  call returns.

The two cron passes are opposites over the same table and should share one query
of "which environments have open competitions", so they can never disagree about
whether the work is over.

**A competition is open from the workshop that announced it until its judging
meeting begins** — see
[Meetings & Teams](./meetings-and-teams.md#the-model). That window is the whole
reason these environments matter: teams build asynchronously across most of a
week, so an environment has to stay reachable for days rather than for the
length of a meeting. Deriving the window from
`competitions."judgingStartsAt"` rather than from any meeting the team attends
is what keeps pre-warm and auto-pause reading the same clock.

> **Measured lifecycle timings**, free plan, under an OAuth token:
>
> | Operation                         | Duration |
> | --------------------------------- | -------- |
> | Create project → `ACTIVE_HEALTHY` | ~10s     |
> | Pause → `INACTIVE`                | **80s**  |
> | Restore → `ACTIVE_HEALTHY`        | **196s** |
>
> **Restore works on the free plan under an OAuth grant**, so the pre-warm cron
> is viable rather than aspirational.
>
> Three numbers to design against. Pre-warm needs a lead time comfortably above
> ~3.5 minutes — **15 minutes is a reasonable floor**, which also absorbs a cron
> tick landing badly. The proxy's `Retry-After` should say ~4 minutes rather than
> a token 30 seconds. And because **pausing itself takes 80s**, the auto-pause
> job must re-check status instead of assuming the owner's project slot is freed
> the moment it fires.
>
> `ACTIVE_HEALTHY` proved trustworthy: all 24 migrations applied immediately
> after the status flip, so it is a real readiness signal and needs no separate
> connectivity probe.

The status sequence during a restore is `INACTIVE → COMING_UP → RESTORING →
ACTIVE_HEALTHY`, so a progress indicator has real stages to show rather than an
undifferentiated spinner.

## Schema

```sql
platform."supabaseConnections" (
  "userId"               uuid primary key references auth.users(id) on delete cascade,
  "orgSlug"              text not null,
  "accessTokenSecretId"  uuid not null,
  "refreshTokenSecretId" uuid not null,
  "expiresAt"            timestamptz not null,
  scopes                 text[] not null,
  "connectedAt"          timestamptz not null default now()
);

-- The project itself. Owned by a person, not a team.
platform."sandboxEnvironments" (
  id                   uuid primary key,
  name                 text not null,
  kind                 platform."envKind" not null,      -- 'owned' | 'branch'
  "ownerUserId"        uuid not null references auth.users(id) on delete restrict,
  "projectRef"         text not null,
  "apiUrl"             text not null,
  -- Both populated from GET /v1/projects/{ref}/api-keys, selected by the
  -- response's `type` field. Do NOT match on `name`: a fresh project returns
  -- anon, service_role, and two keys both literally named "default".
  "publishableKey"     text not null,
  "secretKeySecretId"  uuid not null,
  "jwtSecretId"        uuid not null,
  "proxyHostname"      text not null unique,
  "prewarmEnabled"     boolean not null default true,
  "autoPauseEnabled"   boolean not null default true,
  status               platform."envStatus" not null default 'provisioning',
  "lastSeenActiveAt"   timestamptz,
  "provisionedAt"      timestamptz,
  "revokedAt"          timestamptz
);

-- Which environment a team uses. Many teams may point at one environment.
-- The check plus two composite FKs guarantee the environment's owner is the lead
-- of every attached team; see "The owner is the lead".
platform."teamEnvironments" (
  "teamId"        uuid primary key references platform.teams(id) on delete cascade,
  "environmentId" uuid not null,
  "ownerUserId"   uuid not null,
  "ownerRole"     platform."teamRole" not null default 'lead',
  "attachedAt"    timestamptz not null default now(),
  "attachedBy"    uuid not null,
  constraint owner_is_lead check ("ownerRole" = 'lead'),
  foreign key ("environmentId", "ownerUserId")
    references platform."sandboxEnvironments"(id, "ownerUserId"),
  foreign key ("teamId", "ownerUserId", "ownerRole")
    references platform."teamMembers"("teamId", "userId", role)
    on update restrict on delete restrict
);

-- One row per (contributor, environment, scope), for the lifetime of the pair.
-- Scope is in the key because authority follows the credential: a member holds
-- a publishable token and a secret token, and the secret one is disabled on its
-- own. See "Authority follows the credential, not a header".
platform."sandboxCredentials" (
  id              uuid primary key,
  "environmentId" uuid not null references platform."sandboxEnvironments"(id) on delete cascade,
  "userId"        uuid not null references auth.users(id) on delete cascade,
  "tokenHash"     text not null,
  scope           platform."proxyScope" not null,  -- 'publishable' | 'secret'
  status          platform."credentialStatus" not null default 'active',
                                        -- 'active' | 'disabled' | 'revoked'
  "lastUsedAt"    timestamptz,
  "disabledAt"    timestamptz,
  "rotatedAt"     timestamptz,
  "revokedAt"     timestamptz,
  unique ("environmentId", "userId", scope)
);

platform."envVars" (
  "environmentId" uuid not null references platform."sandboxEnvironments"(id) on delete cascade,
  key             text not null,
  value           text,          -- when visibility = 'shared'
  "secretId"      uuid,          -- when visibility = 'secret'
  visibility      platform."envVarVisibility" not null,
  "updatedBy"     uuid not null,
  "updatedAt"     timestamptz not null default now(),
  primary key ("environmentId", key),
  check (num_nonnulls(value, "secretId") = 1)
);

platform."proxyRequestLog" (id, "credentialId", method, path, status, at);
platform."envAccessLog" (id, "environmentId", "userId", "keysFetched" text[], at);
```

`envVars` generalizes past Supabase — a `secret` value is never delivered to a
member, only used by platform-side operations, which is what keeps the secret key
out of `.env.local` while living in the same system.

### Access is a reachability question, not a lookup

Because one environment serves many teams, "may this member use this
environment?" is no longer a row lookup. The rule is:

> A member may hold a credential for an environment if they are an active member
> of **any** team currently attached to it.

That makes losing access the subtle part. **Removing someone from a team must not
disable their credential if they remain on another team attached to the same
environment.** Check reachability first, or a member competing in two projects
loses access to a shared instance the moment one of those teams drops them. The
nightly reconcile applies the same rule in reverse, disabling credentials no
longer reachable from any attached team.

### Disabled is not revoked

Losing access **disables** a credential rather than revoking it. The distinction
matters because access is not usually permanent — people leave a team and rejoin,
or come back for the next event on the same environment.

| Status       | Meaning                                   | Set when                                  |
| ------------ | ----------------------------------------- | ----------------------------------------- |
| **active**   | Token resolves; proxy serves the request  | Member is reachable from an attached team |
| **disabled** | Token rejected; row and history preserved | Member is no longer reachable             |
| **revoked**  | Terminal; environment is gone             | Environment revoked or orphaned           |

The point of disabling is the elevation path: the secret-scoped credential is
what grants a bypass of RLS, so someone who leaves a team must lose secret-key
access to a project they neither own nor contribute to — immediately, and
without waiting for anyone to notice. Because scope is part of the key, that
revocation is also available at a finer grain than "all or nothing": a member
can keep publishable access while losing the secret token.

**One row per `(contributor, environment, scope)`, for the lifetime of the
pair.** The unique constraint is unconditional, so history, `lastUsedAt`, and
the audit trail survive a member leaving and returning.

**Re-granting access reactivates the same token.** The row and its secret both
persist, so a member returning to an environment finds their existing `.env`
still works.

This is a deliberate trade. Rotating on every re-grant would be marginally
safer, but the whole point of environment reuse is teams that stay consistent
across events — and a credential that silently changes underneath them produces
exactly the confusing, hard-to-diagnose failure the feature exists to avoid. The
window of risk is small: a disabled token is inert while disabled, and
reactivation only happens when the member is genuinely back on an attached team.

Rotation stays available as an explicit action for the environment owner, for the
case where a token is believed compromised. It is a response to a problem, not a
routine step.

### OAuth clients belong to the environment

Both existing OAuth tables assume a single individual owner and must be reshaped.
The owner they gain is the **environment**, not the team.

That is the correct grain because a DevDogs OAuth client exists to let an app
sign in _against a particular Supabase project_: its client ID and secret are
configured into that project's auth settings as the "Sign in with DevDogs"
provider. Tie it to a team and two teams sharing an environment would need two
clients configured into one project's single provider slot — a contradiction. Tie
it to the environment and reuse works for free: re-attaching last month's
environment brings its OAuth client with it, still configured, nothing to redo.

```sql
alter table platform."oauthRegistrations"
  drop constraint "oauthRegistrations_userId_key",
  alter column "userId" drop not null,
  add column "environmentId" uuid
    references platform."sandboxEnvironments"(id) on delete cascade,
  add column "clientSecretId" uuid,          -- Vault
  add constraint one_owner
    check (num_nonnulls("userId", "environmentId") = 1);

create unique index on platform."oauthRegistrations" ("userId")
  where "userId" is not null;
create unique index on platform."oauthRegistrations" ("environmentId")
  where "environmentId" is not null;

drop table platform."oauthTestAccounts";
```

**The client secret never reaches a contributor.** The platform holds it in Vault
and writes it into the project's auth configuration itself, over the Management
API with the `auth:write` scope — the same job `packages/oauth-setup` does today
against a local stack, generalized to a remote project. Nobody has to copy a
secret into a config file, so there is no secret to leak from one.

### Test accounts are removed entirely

Test accounts existed because a contributor developing alone had no other way to
have two users in a room. Federated sign-in replaces that: members authenticate
against their team's environment with their **real DevDogs accounts**, so local
profile data is real profile data and a synthetic second user has no remaining
job.

Removing them is also a security simplification rather than just a deletion. Test
accounts were backed by genuine `auth.users` rows, which is why
`20260729000000_platform_instance_gate.sql` had to build `platform.is_test_identity()`
and four restrictive `deny_test_identities` policies to subtract those identities
from tables granting unconditional `authenticated` SELECT. **Deleting the concept
deletes both the risk and its mitigation.**

The inventory, all of which belongs in phase 2:

| Item                                                                                                                                    | Action                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `components/OAuthTestAccounts.tsx`, `OAuthTestAccountsField.tsx`, `TestAccountDialog.tsx`                                               | Delete (~280 lines)               |
| `server/actions/testAccounts.ts`                                                                                                        | Delete (~154 lines)               |
| `server/oauth/clientAuth.ts` → `isTestAccountForClient`                                                                                 | Delete function                   |
| `server/actions/consent.ts` → `approveTestAccountAuthorization` and its schema                                                          | Delete; consent becomes one path  |
| `ConsentForm`, `oauth/consent/page.tsx`, `tools/oauth/page.tsx`, `FeedbackDialog`, `loaders/console.ts`                                 | Drop the test-account branch      |
| `scripts/seed-builtin-roles.ts`                                                                                                         | Drop test-account role seeding    |
| `platform."oauthTestAccounts"`                                                                                                          | Drop table                        |
| `platform.is_test_identity()` and 4 `deny_test_identities` policies on `roles`, `reportReasons`, `reportContentTypes`, `feedbackTopics` | Drop — no identities left to deny |

**`packages/sb/testing/personas.ts` is not part of this.** Personas are RLS test
fixtures, a separate concept that its own comments are careful to distinguish
from test accounts; `rls.test.ts` depends on them and both stay.

The one thing to confirm while removing: the consent flow currently branches on
whether the authorizing user is a test account. Collapsing it to a single path is
the goal, but it touches live OAuth authorization, so it wants its own commit and
its own test.

## `sb` targets

The existing scripts are thin `with-env` wrappers over the Supabase CLI with a
two-target convention (`reset-remote-database` / `reset-local-database`). Adding
a third target would take that to 3× the script count, so the CLI gains a
dispatcher instead:

```
pnpm sb push   --local | --remote | --team <slug>
pnpm sb reset  --local | --remote | --team <slug>
```

`--local` and `--remote` shell out to **literally today's command strings** —
not a reimplementation that happens to match. There is then no way for the
Management API work to regress the paths the platform itself is developed on.

Two invariants:

- **Same migration files, same ledger.** The Management API driver applies the
  same `packages/sb/supabase/migrations/*.sql` in the same order and records
  them in `supabase_migrations.schema_migrations`, exactly as the CLI does. A
  contributor who develops locally and then pushes to their team's instance must
  land on an identical schema, or the whole "build alone, then share" flow
  breaks.
- **Distribution is just environment variables.** `pnpm sb link` writes
  `API_URL=https://<team>-sandbox.devdogsuga.org` and the member's token as
  `PUBLISHABLE_KEY`. Because
  `apps/study-group-finder` already builds with
  `--dart-define=SUPABASE_URL=$API_URL --dart-define=SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY`,
  the Flutter app becomes proxy-aware with no code change.

### Generated types leave source control

`packages/sb/src/database.types.ts` becomes untracked, matching
`apps/study-group-finder/.gitignore`, which already ignores `lib/generated/`.

This solves team divergence, which is what raised the question — three teams
generating types for three different feature implementations can no longer
collide on one committed file.

#### What generation actually requires

An earlier draft claimed a bare Postgres with the migrations applied would
suffice. **It does not**, and the gap is larger than it first appears:

- A stock `postgres:17` fails on the first migration — the `anon`,
  `authenticated`, and `service_role` roles do not exist.
- The `supabase/postgres` image gets closer, shipping those roles plus the
  `auth`, `storage`, `graphql_public`, `extensions`, and `vault` schemas — but
  of the tables the migrations reference it provides only `auth.users`. It has
  no `auth.identities`, no `auth.oauth_clients`, and no `storage` tables, since
  those come from the GoTrue and storage-api migrations.
- The generated file covers every schema in `config.toml`'s `schemas` list,
  which includes `storage` and `graphql_public`. The `storage` schema alone
  accounts for roughly 545 of its 2,552 lines. Hand-stubbing that would drift
  every time Supabase updates storage-api.

So generation needs the real stack — but only part of it. `supabase start -x`
can exclude everything not involved, leaving `db`, `auth`, and `storage`:

```
supabase start -x studio,inbucket,edge-runtime,functions,imgproxy,realtime,vector,analytics,kong,rest,meta
```

Type generation connects to Postgres directly, so `rest`, `kong`, and `meta` are
not needed. Confirm the exact exclusion set on the first CI run.

#### Verified behavior

- `--db-url` and `--local` produce **byte-identical output** against the same
  database, so CI may use either.
- The committed file currently has **zero drift** — regenerating from the local
  stack reproduces it exactly.
- **`__InternalSupabase` is not a gotcha.** The CLI does not emit it as a key at
  all; it appears only in a defensive `Omit<Database, "__InternalSupabase">`
  helper type. The comment in `packages/sb/src/index.ts` describing it as a
  generated key carrying PostgREST version metadata is stale and should be
  corrected in the same change.

#### Consequences to handle

- **`turbo.json` gains a `generate-types` task** that `build`, `typecheck`, and
  `lint` depend on, with `inputs` set to `supabase/migrations/**` and
  `supabase/config.toml` and `outputs` to the generated file. Turbo's cache then
  runs it once per migration change rather than per invocation, which is what
  keeps the stack boot off the critical path of ordinary jobs.
- **No postinstall hook.** Generating on every `pnpm install` would force Docker
  onto contributors doing docs-only work and onto CI jobs that never touch the
  database. The task graph already expresses the dependency correctly; a hook
  would only make it eager.
- **Cold clones pay once.** With no warm cache the first `typecheck` boots three
  containers and takes a minute or two. Make the failure legible: if the file is
  absent and Docker is unavailable, fail with a message naming the bootstrap
  command rather than a module-not-found cascade.
- **Turbo remote cache**, if enabled, makes this nearly free in CI — worth
  turning on alongside this change.

## Phases

**Phase 0 — the API spike — is complete.** See [Spike results](#spike-results).
Every assumption the later phases rest on was verified against a real free-plan
account, so nothing below is blocked on unknowns.

1. **Team foundation** — `meetings`, `projects`, `workshops`, `competitions`,
   `teams`, `teamMembers`, `teamMembershipRequests`, `teamAwards`,
   `maxTeamSize` config; join, invite, request, accept, leave, transfer-lead,
   and re-form as server actions over Drizzle. No integrations, fully testable
   alone. **Dependency-free — start here.**
2. **OAuth ownership and test-account removal** — the refactor above, resolving
   an owner rather than assuming `userId` in `server/actions/oauth.ts` and
   `OAuthCredentialsField`, and the full test-account inventory. Parallel with
   phase 1, though the consent-flow collapse wants its own commit.
3. **Supabase OAuth** — app registration, authorize and callback routes, Vault
   token storage, refresh cron, and the `GET /v1/projects` capacity check with
   its three remedies — attach, pause-in-flow, transfer lead.
   `scripts/spike/supabase-oauth-spike.ts` already implements this sequence
   working against the live API; it is the skeleton to lift from, and what needs
   rewriting is its error handling, not its flow.
4. **Control plane** — `pnpm sb push --team` and `reset --team` through the
   Management API, plus the target dispatcher and the generated-types change.
   Simpler than originally scoped: `database/query` is atomic, so no repair path
   and no idempotency requirement.
5. **Sandbox worker** — (a) token resolution, JWT minting, REST forwarding;
   (b) Realtime query and subprotocol rewriting, GoTrue redirects;
   (c) `pnpm sb link` distribution.
6. **Revocation and lifecycle** — credential `status` transitions with the
   reachability check, plus a GoTrue ban so an issued JWT cannot outlive
   membership; the pre-warm and auto-pause cron passes; owner-facing key
   rotation.
7. **Stars, awards, and CSV export.**

Phase 4 deliberately precedes phase 5. It makes the system usable with a shared
publishable key while the proxy is still being built, so a slipped worker does
not block an event.

Two guardrails belong in phase 5c rather than later: a CI secret scan on
`team/**` branches, because somebody will commit `.env.local`, and confirming
`.env.local` is ignored in every workspace `sb link` writes to.

## Worker key rotation happens at deploy

The worker's credential for `resolve_sandbox_credential` is a JWT carrying
`{"role": "sandbox_proxy"}`, signed with the platform project's own signing key.

That has a consequence worth designing around: **minting is signing, not an API
call.** There is no `POST /v1/projects/{ref}/api-keys`, no management token in
CI, and no dashboard step — the deploy signs a token locally and writes it to
Secrets Store. So rotation stops being a three-step overlap dance and becomes
free, which means it should happen on **every deploy**, with a 90-day `exp` so a
pipeline that goes stale fails loudly instead of quietly holding a key forever.

**Import the signing key rather than letting Supabase generate one.** The
signing-keys guide is explicit that "you can only extract the legacy JWT secret;
once you've moved to the JWT signing keys feature, extracting the private key or
shared secret from Supabase is not possible." Legacy keys are removed in late
2026, so a generated key would leave nothing to sign with and force this back
onto a manual path. Importing is a one-time decision with a deadline attached.

The obvious objection is that CI now holds a key that can mint any user's
session. It does not survive scrutiny while one pipeline deploys both workers:
whoever can deploy `apps/platform` can already push code that reads `SECRET_KEY`
out of its own environment, so CI is fully trusted today and this adds no
authority it did not have. That reasoning is load-bearing, though — if the proxy
ever moves to a separate, less-trusted pipeline, the signing key does not follow
it, and the token goes back to being minted out-of-band.

## Rate limiting: deliberately deferred

The proxy has no rate limiting in the first cut, and that is a decision rather
than an oversight.

Cloudflare's free-tier options do not fit well — KV's free write ceiling is too
low for per-request counters, and Durable Objects cost money, which is the
constraint this whole design exists to respect. Meanwhile the realistic load is
roughly thirty students during an event window, against instances that are
already rate-limited upstream by Supabase's own free tier.

What ships instead is the ability to _notice_: `proxyRequestLog` records every
request, so abuse is visible after the fact. Revisit if a single credential ever
exceeds a few thousand requests in an hour, which is the point where a Durable
Object counter becomes worth its cost.

Two cheap safeguards do ship now, because they cost nothing: reject unknown
paths rather than forwarding them, and cap request body size.

## Implementation

### Migrations

Four files, landing **after** `<ts>_platform_teams.sql` from
[Meetings & Teams](./meetings-and-teams.md) — `teamEnvironments` has a composite
foreign key into `teamMembers("teamId", "userId", role)`, so those keys must
already exist.

| #   | File                                        | Contents                                                                                                                                                                                 |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `<ts>_platform_supabase_connections.sql`    | `supabaseConnections`, enums                                                                                                                                                             |
| 2   | `<ts>_platform_sandbox_environments.sql`    | `sandboxEnvironments`, `teamEnvironments`, `envVars`                                                                                                                                     |
| 3   | `<ts>_platform_sandbox_credentials.sql`     | `sandboxCredentials`, `proxyRequestLog`, `envAccessLog`, `resolve_sandbox_credential`, `log_proxy_request`, the `sandbox_proxy` role and its grants, and the schema-wide `PUBLIC` revoke |
| 4   | `<ts>_platform_oauth_environment_owner.sql` | OAuth refactor, **drop `oauthTestAccounts`**, drop `is_test_identity` + its 4 policies                                                                                                   |

Migration 4 is the destructive one and should be its own PR. It removes
`platform.is_test_identity()` and the four `deny_test_identities` restrictive
policies on `roles`, `reportReasons`, `reportContentTypes`, and `feedbackTopics`
that `20260729000000_platform_instance_gate.sql` created.

Enums:

```sql
create type platform."envKind"            as enum ('owned', 'branch');
create type platform."envStatus"          as enum
  ('provisioning','active','paused','restoring','detached','revoked','orphaned');
create type platform."credentialStatus"   as enum ('active','disabled','revoked');
create type platform."proxyScope"         as enum ('publishable','secret');
create type platform."envVarVisibility"   as enum ('shared','secret');
```

`proxyScope` names the **key class the token stands in for**, mirroring
upstream's publishable/secret split. An earlier draft had it as `member`/`lead`,
which conflated authority with team role — the wrong axis, since a lead has no
more reason to bypass RLS than anyone else, and the header that actually granted
elevation ignored it anyway.

`envStatus` is the platform's own lifecycle, not a mirror of Supabase's 15-value
project status. Map the latter onto the former at the boundary — anything that is
not `ACTIVE_HEALTHY` becomes not-ready, per
[Paused instances](#paused-instances-are-normal-not-exceptional).

### RLS

Deny-all client CRUD, with reads through `security definer` RPCs. **This table
keeps the RPCs** where the teams tables drop them, because what is being guarded
is a credential rather than a row: the point of a narrow function here is that it
selects specific columns and can never widen by accident, which is a property of
the function signature rather than of who calls it.

| Table                 | Client access                                                   |
| --------------------- | --------------------------------------------------------------- |
| `supabaseConnections` | ❌ none — token metadata, platform-only                         |
| `sandboxEnvironments` | ✅ select own team's non-secret columns via RPC only            |
| `teamEnvironments`    | ✅ select via RPC only                                          |
| `sandboxCredentials`  | ❌ none — the token hash must never be client-readable          |
| `envVars`             | ✅ `visibility = 'shared'` only, via RPC, gated on reachability |
| `proxyRequestLog`     | ❌ none                                                         |

**`envVars` is the one to be careful with.** A policy that filters on
`visibility = 'shared'` is easy to write and easy to get subtly wrong; prefer an
RPC that selects the columns explicitly, so a future `secret` row cannot leak
through a `select *`.

### The worker's routing table

`apps/sandbox/src/index.ts` classifies by path prefix before doing anything else.
Anything unmatched is rejected rather than forwarded — the allowlist is the
security boundary.

| Path prefix       | Handling                                                                            |
| ----------------- | ----------------------------------------------------------------------------------- |
| `/rest/v1/*`      | Swap `apikey`; pass `Authorization` through; forward                                |
| `/auth/v1/*`      | Swap `apikey`; rewrite redirect URLs to the sandbox host                            |
| `/storage/v1/*`   | Swap `apikey`; forward. **No response rewriting** — see above                       |
| `/realtime/v1/*`  | Rewrite `apikey` **query param** and `Sec-WebSocket-Protocol`; upgrade pass-through |
| `/functions/v1/*` | Swap `apikey`; forward                                                              |
| everything else   | `404`                                                                               |

Cross-cutting, applied before the table:

1. Resolve the hostname → environment. Unknown or retired → **`410 Gone`** with
   the explanatory body, never `404`.
2. Resolve the member token → `resolve_sandbox_credential`. Missing or
   `status <> 'active'` → `401`.
3. If the resolved credential's scope is `secret`, reject a browser `User-Agent`
   with `401`; otherwise inject the secret key and write `proxyRequestLog`. A
   `publishable` credential never reaches the secret key by any path.
4. On upstream `5xx`, return the structured `503` and enqueue a platform status
   check in `ctx.waitUntil()` — the worker never concludes "paused" itself.

`wrangler.jsonc` needs the route `*-sandbox.devdogsuga.org/*` against a single
wildcard DNS record, plus the `sandbox_proxy` JWT in Secrets Store. Both are
deploy-time chores: nothing in phases 3–5 depends on the DNS record existing,
since `wrangler dev` serves the proxy locally and every routing decision reads
`proxyHostname` from the database rather than inferring it from the request
host.

### Provisioning module

`apps/platform/src/server/supabase/` — the sequence is already proven end to end
in `scripts/spike/supabase-oauth-spike.ts`, so lift the flow and rewrite the
error handling.

```ts
connectSupabase(userId, code, verifier): Promise<void>   // store tokens in Vault
refreshToken(userId): Promise<void>                      // daily cron; 24h TTL
listOwnedProjects(userId): Promise<ProjectSummary[]>     // capacity + pause picker
provisionEnvironment(teamId, ownerUserId): Promise<EnvId>
attachEnvironment(teamId, environmentId, actorId): Promise<void>
pauseProject(userId, projectRef): Promise<void>          // in-flow slot freeing
restoreEnvironment(environmentId): Promise<void>
applyMigrations(environmentId): Promise<void>            // database/query
configureAuthProvider(environmentId): Promise<void>      // auth:write
retrieveKeys(projectRef): Promise<{ publishable, secret }>
```

Two details that will otherwise be got wrong:

- **`retrieveKeys` selects on the response's `type` field, never `name`.** A
  fresh project returns four keys and two are both literally named `default`.
- **`provisionEnvironment` polls to `ACTIVE_HEALTHY` before applying
  migrations.** Measured at ~10s, but it is a poll, not a sleep.

### CLI surface

`packages/sb` gains a dispatcher; the existing `--local` and `--remote` paths
shell out to today's exact command strings so they cannot regress.

```
pnpm sb link   --team <slug>        # writes API_URL + both member tokens to .env
pnpm sb push   --local | --remote | --team <slug>
pnpm sb reset  --local | --remote | --team <slug>
pnpm sb status --team <slug>        # environment status, wakes if paused
```

`--team` authenticates with the member's DevDogs session, so the CLI needs a
device-code or paste-a-token flow. Reuse `packages/oauth-setup`'s clack-based
prompts rather than inventing a second CLI idiom.

### Cron

Extend `apps/platform/cloudflare/scheduled.ts`. One query of "environments with
open competitions" feeds three passes, so they cannot disagree:

| Pass          | Cadence | Action                                                          |
| ------------- | ------- | --------------------------------------------------------------- |
| Token refresh | daily   | Refresh Supabase OAuth tokens (24h TTL)                         |
| Pre-warm      | 5 min   | Restore `prewarmEnabled` envs with a competition inside 15 min  |
| Auto-pause    | hourly  | Pause `autoPauseEnabled` envs with no open attached competition |
| Reconcile     | nightly | Project existence → orphan; credential reachability             |

Pre-warm runs on a tighter cadence than the others because a 15-minute lead time
against a 196s restore leaves little room for a missed tick.

### Tests

- **Worker unit tests** against a mock upstream — the routing table, `410` for
  retired hostnames, `401` for disabled credentials, and that a `secret`-scoped
  credential is the _only_ path injecting the secret key. Assert the negative
  directly: a `publishable` token plus every header an attacker might try must
  never produce the secret key upstream.
- **Logged-out fidelity** — a `publishable` token with no `Authorization` header
  must reach upstream as `anon` with `auth.uid()` null. This is the property the
  deleted minting row destroyed, and nothing else in the suite would notice its
  return.
- **Browser refusal** — a `secret` token with a browser `User-Agent` must `401`
  without contacting upstream.
- **Realtime handshake** — assert the rewritten URL carries the real publishable
  key in the query string and that `Sec-WebSocket-Protocol` retains `phoenix`
  alongside the rewritten token. This is the easiest thing to break and the
  hardest to notice.
- **Reachability** — removing a member from one of two teams sharing an
  environment must leave their credential `active`; removing them from both must
  disable it.
- **Ownership constraint** — assert the composite FK actually rejects demoting a
  lead whose environment is attached, rather than trusting the DDL by reading it.
- **Provisioning** — against a throwaway project, gated behind an env flag so it
  never runs in normal CI.

## Spike results

The whole lifecycle was driven end to end against a throwaway free-plan account
by `scripts/spike/supabase-oauth-spike.ts` — authorize, create, keys, migrate,
configure auth, pause, capture, restore, refresh, delete. **23 checks, 0
failures.**

| Question                                       | Answer                                               |
| ---------------------------------------------- | ---------------------------------------------------- |
| Can OAuth create a free-plan project?          | **Yes** — the architecture holds                     |
| Does free-plan restore work under OAuth?       | **Yes**, 196s                                        |
| Is `database/query` atomic?                    | **Yes**, bare and wrapped — no repair path needed    |
| Do real migrations apply?                      | All 24, largest 23 KB                                |
| What does a paused project return?             | Cloudflare **522**, HTML body — not a Supabase error |
| Access token TTL                               | 86,400s (24h)                                        |
| Does `auth:write` configure a project?         | Yes                                                  |
| Does refresh work, and teardown free the slot? | Yes to both                                          |

Two incidental findings worth carrying into the implementation: the token
response **does not return a `scope` field**, so granted scopes can only be
verified by calling an endpoint and seeing whether it succeeds; and the free-plan
ceiling of two projects is real and was reached during the run, which is what
makes auto-pause load-bearing rather than cosmetic.

## Open questions

- **`database/query` is Beta**, and the control plane depends on it entirely.
  It behaved correctly under test, but Beta means the contract can move — re-check
  before each event.
- **Re-probe the paused REST endpoint against a real table path.** The spike hit
  `/rest/v1/` root, which requires the secret key regardless of pause state, so
  its 401 measured the wrong thing. The 522 from the auth endpoint is the usable
  signal; the REST equivalent is still unmeasured.

## See also

- [Meetings & Teams](./meetings-and-teams.md) — what a team is and how membership is
  decided.
- [OAuth Setup](./oauth-setup.md) — the existing local flow this generalizes.
