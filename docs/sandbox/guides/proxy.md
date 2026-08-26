---
name: The proxy
description: The Cloudflare Worker in front of each team's Supabase project — the three planes, the flat hostname, and what happens to a request on its way through.
order: 2
---

# The proxy

`apps/sandbox` is a Cloudflare Worker sitting in front of each team's Supabase
project. Read this if you are **changing the Worker, or debugging a request that
went in and came back wrong**: what it does per request, which paths it forwards,
and the two transports it deliberately leaves alone. If you just want a URL and
tokens, read [Access](/docs/sandbox/guides/access). For an exact signature, the
[generated reference](/docs/sandbox/reference/src) is built from the Worker's
source on every build.

## Three planes

"Access to the instance" is three problems with three answers, and conflating
them is what makes the design look hard.

| Plane                                           | Transport | Mechanism                              | Who                            |
| ----------------------------------------------- | --------- | -------------------------------------- | ------------------------------ |
| Data — REST, Auth, Storage, Realtime, Functions | HTTPS/WSS | the `apps/sandbox` Worker              | any member with tokens         |
| Control — migrations, reset, status             | HTTPS     | the platform → Supabase Management API | any member of an attached team |
| Secrets                                         | —         | Supabase Vault, on the platform        | the platform only              |

## The control plane is not proxied

`supabase db push` speaks the **Postgres wire protocol**, not HTTP, so an HTTP
Worker cannot carry it. The platform runs SQL through the Management API instead,
under the owner's OAuth token:

```
pnpm sb push --team lantern
  → POST /sandbox/push on the platform
  → the member's own DevDogs session identifies them; membership is checked
  → POST /v1/projects/{ref}/database/query, under the owner's OAuth token
```

Every member of an attached team gets full DDL, migrations and reset (`pnpm sb
push --team <slug>`, `pnpm sb reset --team <slug>`) without holding a key, and
the owner never opens the dashboard. `applyMigrations` sends every file in
`supabase/migrations` as **one payload**, because `database/query` is atomic: an
error partway through rolls it all back, so a failed migration leaves the schema
untouched and there is no repair path to write.

<details>
<summary>What does <code>pnpm sb</code> cover, across all three targets?</summary>

`packages/devtools/src/stack.ts` dispatches four commands over three targets
(`stop` and `restart` are the other two, and are local-only):

| Command  | `--local` / `--remote`                            | `--team <slug>`                                         |
| -------- | ------------------------------------------------- | ------------------------------------------------------- |
| `link`   | starts the local stack / links the remote project | `POST /sandbox/link` — both tokens, writes `.env.local` |
| `push`   | `push-migrations`                                 | `POST /sandbox/push` — every migration as one payload   |
| `reset`  | `reset-local-database` / `reset-remote-database`  | `POST /sandbox/reset` — drop `public`, re-apply         |
| `status` | reads Docker locally / points at the dashboard    | `POST /sandbox/status` — reports, and wakes if paused   |

A team reset drops the `public` schema only. `auth` survives, because the members
signed into that project are federated against their real DevDogs accounts, and a
reset must cost test rows rather than the ability to log in.

`--local` and `--remote` shell out to the existing `@devdogsuga/supabase` package
scripts **by name** rather than reimplementing them, so those scripts stay the
single definition of what "reset" means and this work cannot regress the paths
the platform itself is developed on.

</details>

<details>
<summary>Which Management API endpoints does the control plane use?</summary>

From `apps/platform/src/server/supabase/managementApi.ts`:

| Endpoint                                 | Purpose                              |
| ---------------------------------------- | ------------------------------------ |
| `GET /v1/projects`                       | Capacity check, and the pause picker |
| `POST /v1/projects`                      | Provision a project                  |
| `GET /v1/projects/{ref}`                 | Read status; a 404 means gone        |
| `GET /v1/projects/{ref}/api-keys`        | Retrieve publishable/secret keys     |
| `POST /v1/projects/{ref}/database/query` | Run SQL                              |
| `POST /v1/projects/{ref}/pause`          | Auto-pause, and freeing a slot       |
| `POST /v1/projects/{ref}/restore`        | Wake a paused project                |

All of them authenticate with a bearer token, so an OAuth token works wherever a
personal access token does, subject to scopes.

`database/query` is a Beta endpoint and the entire control plane rests on it.
Treat its stability as something to re-check before an event, and keep the
fallback in mind: the owner can always run migrations from their own machine with
the Supabase CLI.

</details>

## The hostname is one label deep, deliberately

`<name>-<random>-sandbox.devdogsuga.org`, never `<name>.sandbox.devdogsuga.org`.
Cloudflare's Universal SSL covers the apex and first-level subdomains only, and
anything deeper needs Advanced Certificate Manager at about $10 a month. Keeping
the label flat puts every environment under the free wildcard, so **one wildcard
DNS record plus one Worker route covers every environment forever** — creating
one writes a database row and does no DNS work.

`buildProxyHostname` appends a short random suffix. Not for collision avoidance —
the unique constraint on `proxyHostname` handles that — but for unguessability:
without it, anyone who knows a team exists knows where its instance lives.

Staging claims a distinct wildcard, `*-sandbox-staging.devdogsuga.org`, because
two Workers cannot both claim one pattern. Development has no route:
`wrangler dev` serves locally, and every routing decision reads `proxyHostname`
from the database rather than inferring it from the request host.

## What the proxy does per request

Credentials first, then routing.

1. **Classify the path.** `url.pathname` is already normalized by the URL parser,
   so `/storage/v1/../../rest/v1/…` cannot be judged as storage while the origin
   treats it as REST.
2. **Find the member token** in `apikey`, in `Authorization: Bearer`, or — for
   realtime only — in the `apikey` query parameter. No token at all is `401`
   before anything else happens, so nobody maps which services exist without
   presenting one.
3. **Resolve it** against the platform, hostname and token hash together. A
   retired hostname is `410 Gone` naming the environment it was; an unknown one
   is the same `410`, unnamed; anything wrong with the credential is one
   undifferentiated `401`. See
   [Access](/docs/sandbox/guides/access) for the function behind this.
4. **Refuse a secret token from a browser** `User-Agent` with `401`, logged, and
   without contacting upstream.
5. **Reject anything else that does not belong** — a path outside the allowlist
   is `404`, a body over 1 MiB is `413`.

| Path prefix                                                | Handling                                       |
| ---------------------------------------------------------- | ---------------------------------------------- |
| `/rest/v1/`, `/auth/v1/`, `/storage/v1/`, `/functions/v1/` | Swap `apikey`, forward                         |
| `/realtime/v1/`                                            | Swap the `apikey` **query parameter** too      |
| everything else                                            | `404` — the allowlist is the security boundary |

The upstream request starts from an **empty `Headers`** rather than a copy of the
incoming one, and the request's headers are then copied in against a skip list:
`apikey`, `authorization`, `host` and `content-length`, plus anything beginning
`x-devdogs-`, `cf-`, `x-forwarded-` or `x-real-ip`. Those four prefixes are the
ones that never reach Supabase; a header nobody has thought about still travels.
Starting empty is what makes the skip list the only thing to read — and what
makes forgetting one a visible omission rather than a silent forward. `apikey`
is then set to the real upstream key, and `Authorization` carries the user's JWT
when there is one and the key otherwise. An upstream fetch that throws answers `503` with a
four-minute retry hint; the Worker never concludes "paused" on its own.

## WebSockets pass through

Realtime is proxied by forwarding the `Upgrade` request and returning the
response. The Worker never calls `accept()`, so it runs for the **handshake
only**; after that the client and Supabase talk through a tunnel it is not in. No
duration billing, no memory pinning — a WebSocket costs exactly one Worker
request.

The consequence is that **nothing can be rewritten mid-stream.** The handshake
rewrites what it can reach: the `apikey` query parameter, because a browser
`WebSocket` constructor cannot set headers, and any `dd_`-prefixed entry in
`Sec-WebSocket-Protocol`, leaving `phoenix` beside it intact. An authenticated
member needs nothing more: their session token comes from the proxied GoTrue and
is genuinely valid upstream.

> [!WARNING]
> **Unauthenticated Realtime does not work through the proxy.** With no session,
> supabase-js sends the key as the access token inside the `phx_join` payload,
> which is in-stream and unreachable. The messaging feature requires login
> anyway; this is a documented limit rather than something to discover at 2am.

## Storage needs no rewriting

Signed URLs look like a problem — they point at the real project domain — and
they are not. The SDKs build one from the _client's own base URL_ plus a
relative path returned by the server: `@supabase/storage-js` 2.112.3 builds
`` `${this.url}${data.signedURL}` ``. That base URL is already the proxy
hostname, so signed URLs come out pointing at the proxy with no intervention, and
storage responses are forwarded untouched.

## Why it's like this

<details>
<summary>Why reject unknown paths instead of forwarding them?</summary>

The allowlist **is** the security boundary. A proxy that forwards unknown paths
is a general-purpose open relay to somebody's Supabase project, and the set of
things reachable that way grows every time Supabase ships a new service.

Two details in `classifyPath` are load-bearing. The trailing slash in each prefix
matters — without it `/restaurants` matches `/rest`, the classic prefix-matching
bug, which here means classifying an unknown path as a known one. And
normalization is not that function's job: it classifies `url.pathname`, which the
URL parser has already resolved, and must never try to normalize a raw request
target with string manipulation.

</details>

<details>
<summary>Why is there no rate limiting?</summary>

There is none in `apps/sandbox`, and its absence is a decision rather than an
oversight. Cloudflare's free tier has no counter that fits: KV's free write
ceiling is too low for per-request counting, and Durable Objects cost money —
the constraint this whole design exists to respect. The load is roughly thirty
students during an event window, against instances Supabase's own free tier
already throttles upstream.

What exists instead is the ability to notice after the fact. `log_proxy_request`
writes every proxied request to `platform."proxyRequestLog"` with its method,
path and status, indexed by credential and time, so abuse is attributable to a
credential rather than merely visible. One credential past a few thousand
requests in an hour is the point where a Durable Object counter starts being
worth its cost.

The two safeguards that do ship are the free ones: rejecting unknown paths, and
capping the body at 1 MiB. Neither is a rate limiter and neither is meant to
stand in for one.

</details>

<details>
<summary>Why does the Worker hold no Supabase key of its own?</summary>

Its two bindings are `PLATFORM_REST_URL` and `SANDBOX_PROXY_TOKEN`, and the
second is a JWT carrying `{"role": "sandbox_proxy"}` rather than a Supabase
secret key — a secret key authorizes as `service_role` and would hand this Worker
every table in the platform database.

Because minting that token is signing rather than an API call, rotation is free
and happens on every deploy, with a 90-day expiry so a stale pipeline fails
loudly. Missing either binding is answered with a named `503`
(`proxy_misconfigured`) rather than a fallback to something permissive.

</details>
