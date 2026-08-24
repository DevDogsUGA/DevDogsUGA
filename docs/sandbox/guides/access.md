---
name: Access
description: Two tokens per member per environment, why the credential rather than a header decides authority, and how access is withdrawn without being destroyed.
order: 3
---

# Access

Nobody on a team ever holds their Supabase project's real keys. Each member gets
two opaque DevDogs tokens instead, and which one they present decides what they
can do. This page is for **anyone linking a checkout to a team environment**, and
for anyone changing how credentials are issued or withdrawn. For the Worker's
behaviour rather than the credential model, read
[The proxy](/docs/sandbox/guides/proxy); for where the project came from, read
[Lifecycle](/docs/sandbox/guides/lifecycle).

## One hostname, two tokens per member

The hostname identifies the **environment**; a token identifies the **member**
and the authority they are asking for. `pnpm sb link --team <slug>` calls the
platform, which issues both tokens and writes `.env.local`:

```
SUPABASE_URL=https://<name>-<random>-sandbox.devdogsuga.org
SUPABASE_PUBLISHABLE_KEY=dd_publishable_…
SUPABASE_SECRET_KEY=dd_secret_…
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…
```

The URL is always the **proxy** hostname, never the real Supabase one. Handing
over the upstream URL would let a member bypass the proxy entirely, and with it
every revocation path and the whole audit trail.

Tokens are 32 bytes of CSPRNG output stored only as a hex SHA-256 in
`sandboxCredentials.tokenHash`. Plaintext is shown exactly once: a lost token is
re-issued in one command rather than recovered, because a recoverable one is a
secret sitting in a database waiting to be read.

Keying the **hostname** to a member instead would break the test this feature
exists for: one member's build running on another member's phone. That build
carries the first member's URL and token, so the second member's actions would
attribute to the first, and revoking the first would brick the second's app.

## Authority follows the credential, not a header

Every member holds two tokens per environment, and which one they present decides
their authority — exactly as upstream, where `sb_publishable_…` means
`anon`/`authenticated` and `sb_secret_…` means `service_role`.

```ts
createClient(url, "dd_publishable_…"); // browser
createClient(url, "dd_secret_…"); // server, seeding, tooling
```

Two consequences worth knowing:

- **The prefixes mirror upstream on purpose.** They are what lets a CI secret
  scan pattern-match at all, and what makes an accidental elevation visible in a
  diff.
- **Secret tokens are refused from a browser**, matched on `User-Agent` the way
  upstream does. It is a fidelity control, not a security one: a forged header
  only reaches a key the member already holds. Without it a student ships
  `dd_secret_` to the browser, it works all week against the sandbox, and the
  identical code `401`s in production.

## The sandbox can represent a logged-out user

All three things a member might want have an upstream-faithful home, and the
third is the one that is easy to lose:

| Intent                      | How, and it is the upstream how                          |
| --------------------------- | -------------------------------------------------------- |
| Bypass RLS to seed or debug | `dd_secret_` → `service_role`                            |
| Act as a specific user      | Sign in through the proxied GoTrue, use the returned JWT |
| Be logged out               | `dd_publishable_`, no `Authorization` → `anon`           |

Signing in through the proxy returns a genuine Supabase-signed user JWT, valid
upstream on its own, so the Worker forwards it untouched and verifies nothing.
With no session it sends the key in both places instead — what supabase-js does,
and what makes the request run as `anon` with `auth.uid()` null rather than as
anything the proxy invented.

## Secrets are read through a narrow RPC

The Worker must not hold the platform's own secret key; that would be a larger
key than the ones being protected. It calls two `security definer` functions
instead, as a Postgres role created to have nothing else.

`resolve_sandbox_credential(hostname, token_hash)` is its entire read of platform
state, and three things in that signature each replace a defect:

- **It takes the hostname as well as the token,** so a credential minted for one
  environment cannot be presented at another's hostname and resolve happily. The
  binding lives where it cannot be forgotten.
- **It returns the secret key only for a `secret` credential.** The elevation is
  a database fact, not an `if` in a Worker.
- **It returns an `outcome` rather than zero rows,** because the proxy owes a
  retired hostname a `410` and a bad credential a `401` and cannot tell those
  apart from an empty result.

`log_proxy_request` is a second function rather than an `INSERT` grant, so the
role's table privileges stay at zero and the definer can stamp `lastUsedAt` in
the same round trip.

<details>
<summary>How is <code>sandbox_proxy</code> actually kept narrow?</summary>

Migration `20260805000002_platform_sandbox_credentials.sql` creates the role
`nologin`, grants it to `authenticator` so PostgREST can `set role` into it, and
grants `usage` on the `platform` schema and `execute` on exactly those two
functions.

Revoking from `public` alone is **not** sufficient, and getting that wrong is the
whole security of the thing. This schema carries
`alter default privileges … grant execute on functions to anon, authenticated,
service_role`, so every new function arrives with explicit per-role grants
alongside the implicit `PUBLIC` one. Revoking `PUBLIC` leaves `anon=X/postgres`
standing — which would leave a function returning decrypted Vault secrets
callable by any browser holding an authenticated JWT. Every role is named
explicitly, `service_role` included.

Postgres also grants `EXECUTE` to `PUBLIC` on every new function, and `PUBLIC`
means every role — including one created to have none. So the same migration
revokes execute on all functions in the schema from `public` and sets the default
privilege to match, which is what keeps the hole from reopening the next time
somebody adds a function.

</details>

## Losing access disables; it does not revoke

Because one environment can serve several teams, "may this member use this
environment?" is a reachability question rather than a row lookup:

> A member may hold a credential for an environment if they are on **any** team
> currently attached to it.

Losing access is the subtle part. Removing somebody from one of two teams
sharing an environment must leave their credential active, so
`reconcileEnvironmentAccess` re-asks the question as a sweep rather than reacting
to the removal.

| Status       | Meaning                                   | Set when                     |
| ------------ | ----------------------------------------- | ---------------------------- |
| **active**   | Token resolves; the proxy serves          | The member is reachable      |
| **disabled** | Token rejected; row and history preserved | The member is not            |
| **revoked**  | Terminal                                  | The environment itself ended |

Disabling rather than revoking matters because access is usually not permanent —
people leave a team and rejoin, or come back for the next event on the same
environment. The row is unique on `(environmentId, userId, scope)`
unconditionally, so history, `lastUsedAt` and the audit trail survive the round
trip; reinstatement flips it back to `active` without minting a token nobody was
ever shown, and running `sb link` again issues fresh ones.

Because scope is part of that key, withdrawal is finer than all-or-nothing: a
member can keep publishable access while losing the secret token, which is the
one that bypasses RLS.

## Why it's like this

<details>
<summary>Why not an <code>x-devdogs-role: secret</code> header?</summary>

An earlier draft asked for elevation with a custom header on a single token. It
was wrong on both axes this design cares about.

On fidelity, it is a DevDogs-ism in a system whose entire selling point is that a
sandbox behaves like the real thing, so code written against it would need a
rewrite to ship. On security, a header can be attached to any request by anything
holding the one token, whereas a scope-bearing credential is provisioned,
disabled and audited on its own — elevation becomes something granted rather than
something asserted.

The header is not merely unused: the Worker strips every `x-devdogs-` header
before forwarding, because a header nobody reads is one somebody will eventually
start reading.

</details>

<details>
<summary>Why not mint a session for tooling with no user?</summary>

The same draft had the proxy mint an `authenticated` JWT bound to the member when
a script presented no session. Deleting that row was the more valuable of the two
corrections.

Upstream, a publishable key with no `Authorization` runs as `anon`. Minting
replaces that with a real session, so the sandbox never exercises the logged-out
path — the state every public page and every sign-up flow starts in. A policy
scoped `to authenticated` that was meant to be public reads fine all week and
returns an empty array on demo day. Worse, it diverges from itself: the same
query returns different rows depending on whether the caller is a browser with a
session or a script, which is not a distinction Supabase makes anywhere.

Removing the mint also means the Worker signs nothing, so it has no use for the
environment's JWT secret — a real narrowing of the one call it can make.

</details>

<details>
<summary>What happens to OAuth test accounts?</summary>

`platform."oauthTestAccounts"` exists because a contributor developing alone had
no other way to have two users in a room. Because those rows are backed by
genuine `auth.users` rows, `platform.is_test_identity()` and a set of restrictive
`deny_test_identities` policies exist to subtract them from tables that grant
unconditional `authenticated` SELECT.

A sandbox environment removes the need. Members authenticate against their team's
own project with their **real DevDogs accounts**, on their own real devices, so a
synthetic second user has no remaining job — and deleting the concept would
delete both the risk and its mitigation.

Not the same thing, despite the overlap: `packages/supabase/testing/personas.ts`.
Personas are RLS fixtures — real `auth.users` rows used to exercise policies —
and `rls.test.ts` depends on them. Only its `makeTestAccount` helper touches
`oauthTestAccounts` at all.

</details>
