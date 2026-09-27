-- The device-code fallback for `devtools oauth` (TASK-352): the same "mint a
-- fresh OAuth client per project" outcome as migration 32's loopback
-- connect, for the case a loopback redirect cannot reach the CLI at all --
-- headless boxes, remote shells, containers with no forwarded port. Modeled
-- on RFC 8628 (OAuth 2.0 Device Authorization Grant), not the RFC 8252
-- loopback dance migration 32 documents.
--
-- The handoff: `devtools oauth --device` POSTs
-- `/tools/oauth/device/code`, which mints a `device_code` (the CLI's own
-- secret, never shown) and a short `user_code` (what a human types into
-- `/tools/oauth/device`, or that page pre-fills from
-- `verification_uri_complete`). The CLI then polls
-- `POST /tools/oauth/device/token` with the `device_code` on the `interval`
-- it was given, until a signed-in member visits the verification page,
-- confirms the `user_code`, and approves or denies. Same trust boundary as
-- migration 32's table: everything here is server-only, and the real
-- secret riding through it (`clientSecret`, and `deviceCode` before it is
-- hashed) never appears in a URL a proxy log could capture.
create type "platform"."oauthDeviceCodeStatus" as enum ('pending', 'approved', 'denied');

create table "platform"."oauthDeviceCodes" (
  "id" uuid not null default gen_random_uuid(),

  -- sha256 of the device_code the CLI polls with, hex-encoded -- same
  -- "only the hash is stored" trade-off as `oauthConnectCodes.codeHash`.
  "deviceCodeHash" text not null,

  -- sha256 of the normalized (uppercased, dash/space-stripped) user_code a
  -- human types into the verification page. Hashed for the same reason as
  -- `deviceCodeHash`: a database leak should not hand out live codes,
  -- even ones this short-lived.
  "userCodeHash" text not null,

  "label" text not null,
  "callbackUri" text not null,

  -- Unlike `oauthConnectCodes`, this row's whole life is "pending" until a
  -- human acts on it, and it has to survive that wait -- so this table
  -- needs a real status instead of relying on the row's mere presence to
  -- mean "still valid". `POST /tools/oauth/device/token` still deletes the
  -- row the instant it claims an approved one (or a denied one, once it has
  -- reported `access_denied` back), so the single-use guarantee is the same
  -- delete-then-return shape as the connect flow, just deferred until a
  -- human has caught up with the poller.
  "status" "platform"."oauthDeviceCodeStatus" not null default 'pending',

  -- The member who approved or denied this code, for audit/debug. Null
  -- while it is still pending.
  "userId" uuid,

  -- Set together on approval: the client `createOauthClientAndRegister`
  -- minted, and its plaintext secret, sitting here exactly as briefly and
  -- for the same reason `oauthConnectCodes.clientSecret` does -- the token
  -- endpoint's delete-then-return claims the row (and the secret with it)
  -- the first time the CLI polls after approval.
  "clientId" uuid,
  "clientSecret" text,

  -- RFC 8628 §3.5's `slow_down`: seconds the CLI must wait between polls.
  -- Starts at 5 (the value `/code` reports as `interval`) and the token
  -- endpoint bumps it by 5 every time it sees a poll arrive sooner than
  -- this, so a CLI that ignores `slow_down` keeps getting a longer wait
  -- rather than being cut off outright.
  "interval" integer not null default 5,

  -- The token endpoint's own throttle: a poll is `slow_down` only if it
  -- arrives less than `interval` seconds after this. Null on a code that
  -- has never been polled, so the very first poll is never `slow_down`
  -- regardless of how soon after `/code` it lands.
  "lastPolledAt" timestamptz,

  "createdAt" timestamptz not null default now(),
  "expiresAt" timestamptz not null default (now() + interval '10 minutes'),

  constraint "oauthDeviceCodes_pkey" primary key ("id")
);

-- The token endpoint's whole lookup, one index, one row.
create unique index "oauthDeviceCodes_deviceCodeHash_key"
  on "platform"."oauthDeviceCodes" ("deviceCodeHash");

-- The verification page's whole lookup, symmetric with the above.
create unique index "oauthDeviceCodes_userCodeHash_key"
  on "platform"."oauthDeviceCodes" ("userCodeHash");

-- Backs the expired-row sweep `/code` and `/token` both run (`where
-- "expiresAt" < now()`) -- same reasoning as
-- `oauthConnectCodes_expiresAt_idx`: an abandoned code (nobody ever
-- verified it, or approved it and the CLI never came back to poll) would
-- otherwise sit here holding a plaintext client secret indefinitely.
create index "oauthDeviceCodes_expiresAt_idx"
  on "platform"."oauthDeviceCodes" ("expiresAt");

alter table "platform"."oauthDeviceCodes"
  add constraint "oauthDeviceCodes_clientId_oauth_clients_id_fkey"
  foreign key ("clientId") references auth."oauth_clients" ("id")
  on update cascade on delete cascade;

alter table "platform"."oauthDeviceCodes"
  add constraint "oauthDeviceCodes_userId_users_id_fkey"
  foreign key ("userId") references auth."users" ("id")
  on update cascade on delete cascade;

alter table "platform"."oauthDeviceCodes" enable row level security;

-- Server-only, same shape as `oauthConnectCodes`: RLS is on with no
-- permissive policy at all, so no client role can read a row, and these
-- three restrictive policies close the write side migration 00's default
-- privileges opened.
create policy "no_client_insert" on "platform"."oauthDeviceCodes"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."oauthDeviceCodes"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."oauthDeviceCodes"
  as restrictive for delete to anon, authenticated using (false);
