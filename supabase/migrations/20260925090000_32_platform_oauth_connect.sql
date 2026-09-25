-- One-click OAuth client connect (`devtools oauth`): moves from "copy a
-- client id/secret by hand" to a loopback + PKCE handoff (RFC 8252) that
-- mints a new OAuth client per project instead of reusing one client for
-- everything a developer builds.
--
-- Two changes to the existing "single client per member" model:
--
-- 1. `oauthRegistrations."userId"` loses its unique constraint. One client
--    per connection now, not one client per member -- a developer with three
--    projects ends up with three rows, each independently revocable. The
--    scalar-subquery ownership lookups elsewhere in the schema
--    (`platform.is_test_identity` and friends) key off `clientId`, which
--    stays a primary key, so nothing downstream assumed the dropped
--    constraint.
-- 2. A `label` column so `/tools/oauth` can list "Community Resource Forum",
--    "attendance-kiosk", etc. rather than a bare client id. The one row that
--    predates this migration gets a generic label -- it was created through
--    the old single-client toggle, which never asked for a name.
alter table "platform"."oauthRegistrations"
  drop constraint "oauthRegistrations_userId_key";

alter table "platform"."oauthRegistrations"
  add column "label" text not null default 'Default Client';

-- The handoff itself. `devtools oauth` opens `/tools/oauth/connect` in a
-- browser, the signed-in member approves, and the platform redirects back to
-- a `127.0.0.1`/`localhost` port the CLI is listening on with a one-time
-- code -- never the client secret, which would otherwise have to ride in a
-- URL. The CLI then POSTs the code plus its PKCE verifier to
-- `/tools/oauth/connect/exchange` and gets the secret back over that
-- response body instead.
--
-- Every row here is single-use and short-lived by construction, not by a
-- background sweep: `POST /tools/oauth/connect/exchange` deletes the row it
-- looked up in the same statement that reads it, before checking expiry or
-- verifying the PKCE challenge, so a code cannot be replayed even by a
-- second request that arrives while the first is still validating, and a
-- failed exchange (expired, wrong verifier) consumes the code exactly like a
-- successful one. There is deliberately no `consumedAt`/"used" flag to check
-- instead -- a row's presence IS its validity, which is what makes
-- delete-then-validate race-free without a transaction-level lock.
--
-- `clientSecret` sits here in plaintext, which is the one place in this
-- schema that is true. It is acceptable only because this table is
-- server-only (RLS denies every client role below, matching
-- `rateLimitHits`), rows live at most ~2 minutes, and a row is gone the
-- instant it is read by the exchange endpoint -- there is no window where a
-- secret is both readable twice and outside that endpoint's control.
create table "platform"."oauthConnectCodes" (
  "id" uuid not null default gen_random_uuid(),

  -- sha256 of the code the CLI holds, hex-encoded. The code itself is the
  -- bearer credential for this row (like a password reset token), so only
  -- its hash is stored -- a leaked backup or replication stream does not
  -- hand out live codes.
  "codeHash" text not null,

  -- The PKCE `code_challenge` the connect request supplied (S256 only, per
  -- RFC 8252 loopback guidance). The exchange endpoint hashes the caller's
  -- `code_verifier` with SHA-256, base64url-encodes it, and compares against
  -- this column -- proof that whoever calls `/exchange` is the same process
  -- that opened the browser, not a second party that merely observed the
  -- redirect.
  "codeChallenge" text not null,

  "clientId" uuid not null,
  "clientSecret" text not null,
  "userId" uuid not null,

  -- The CLI's loopback callback (`http://127.0.0.1:<port>/<path>` or the
  -- `localhost` equivalent). Recorded for audit/debugging; the exchange
  -- endpoint itself never redirects, it only returns JSON, so this column is
  -- not read to build a response.
  "redirectUri" text not null,

  "createdAt" timestamptz not null default now(),
  "expiresAt" timestamptz not null default (now() + interval '2 minutes'),

  constraint "oauthConnectCodes_pkey" primary key ("id")
);

-- The exchange endpoint's entire lookup, one index, one row.
create unique index "oauthConnectCodes_codeHash_key"
  on "platform"."oauthConnectCodes" ("codeHash");

-- Backs the expired-row sweep `approveConnect` and the exchange route both
-- run (`where "expiresAt" < now()`) -- an abandoned code (nobody ever
-- approved, or approved and never ran the exchange) would otherwise sit
-- here holding a plaintext client secret forever, since nothing else ever
-- deletes an unconsumed row.
create index "oauthConnectCodes_expiresAt_idx"
  on "platform"."oauthConnectCodes" ("expiresAt");

alter table "platform"."oauthConnectCodes"
  add constraint "oauthConnectCodes_clientId_oauth_clients_id_fkey"
  foreign key ("clientId") references auth."oauth_clients" ("id")
  on update cascade on delete cascade;

alter table "platform"."oauthConnectCodes"
  add constraint "oauthConnectCodes_userId_users_id_fkey"
  foreign key ("userId") references auth."users" ("id")
  on update cascade on delete cascade;

alter table "platform"."oauthConnectCodes" enable row level security;

-- Server-only, same shape as `rateLimitHits`: RLS is on with no permissive
-- policy at all, so no client role can read a row (that absence is the whole
-- SELECT deny), and these three restrictive policies close the write side
-- that migration 00's default privileges opened.
create policy "no_client_insert" on "platform"."oauthConnectCodes"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."oauthConnectCodes"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."oauthConnectCodes"
  as restrictive for delete to anon, authenticated using (false);
