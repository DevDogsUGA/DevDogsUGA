---
name: Apps outside the platform database
description: "How an app with its own database (DogPack) files reports and receives moderators' decisions, with the signed report API, the signed deliveries, the receiver rules, registration, and the three ways to test it."
order: 3
section: guides
---

# Apps outside the platform database

[Moderation](./index.md) and [Reporting](../reporting/index.md) describe apps that share the platform's Postgres: a table becomes reportable by gaining a foreign key, and a decision is applied by SQL. An app with its **own** Supabase project (DogPack) cannot work that way, so it talks to the platform over HTTPS in both directions, with messages signed by one shared secret.

```text
member taps Report
  -> your `report` Edge Function
       POST /moderation/v1/reports        (signed with your client's secret)
  -> the platform: a report in the moderators' queue
  -> a moderator decides in the console
  -> the decision commits together with its deliveries (platform."moderationDeliveries")
  -> Cloudflare Queue -> signed POST to your `platform-moderation` Edge Function
  -> `moderation.apply_event(...)` hides the content, bans the user
```

The platform stores nothing it can sign with. A client's secret is derived from a root key held by the Worker, the client id and a version number, so a database dump leaks nothing. Rotating a secret is bumping the version.

## The secret

Each OAuth client has one signing secret (`whsec_...`, [Standard Webhooks](https://www.standardwebhooks.com/)). It signs your reports **and** verifies the platform's deliveries. Turn moderation on for a client on [`/tools/oauth`](/tools/oauth) under **Moderation**; the secret is shown once (turning moderation on again does not show it again; rotate for a new one). A production client is turned on by registering it (below), which shows the secret once. **Rotate** invalidates the old one at once, so update your function's secret in the same minute.

Every message carries three headers:

| Header              | Meaning                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `webhook-id`        | unique per message; the platform sends `msg_<delivery id>`            |
| `webhook-timestamp` | unix seconds; a message more than **5 minutes** from your clock fails |
| `webhook-signature` | `v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<raw body>">`            |

`@devdogsuga/sdk/moderation` does all of it (`signMessage`, `verifyMessage`) with Web Crypto only, so it runs in a Worker, a Deno Edge Function or Node.

## Filing a report

`POST https://api.devdogsuga.org/moderation/v1/reports` (staging: `api-staging.devdogsuga.org`), from your backend, never a member's device.

Headers: the three above, `moderation-client-id: <your OAuth client id>`, `content-type: application/json`.

```json
{
  "reporterUserId": "<platform user id of the member reporting>",
  "authorUserId": "<platform user id of the member who wrote it>",
  "contentType": "session",
  "contentRef": "<your row's id>",
  "contentSnapshot": "what it said when reported (max 5000)",
  "contentUrl": "https://dogpack.example/s/…",
  "reason": "harassment",
  "description": "optional, required for 'other' (max 1000)"
}
```

`contentUrl` is optional and must be an `https` link.

The platform user id is the DevDogs identity's subject: `auth.identities.provider_id` where `provider = 'custom:devdogsuga'`. `GET /moderation/v1/reasons` returns the reasons to offer.

| Status | `error.code`                                        | Meaning                                                                                |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 201    | none                                                | `{ reportId, corroborated, sandbox }`                                                  |
| 400    | `invalid_json`, `invalid_request`                   | the body, or a missing description for `other`                                         |
| 401    | `missing_client`, `unknown_client`, `bad_signature` | the client is not registered for moderation, or the signature is wrong                 |
| 403    | `reporter_not_allowed`, `client_not_registered`     | the reporter is suspended or a test account; a production client no officer registered |
| 422    | `unknown_content_type`, `unknown_user`              | the type was not declared at registration; a user id is not a platform user            |
| 429    | `rate_limited`                                      | ten reports an hour per reporter                                                       |
| 503    | `not_configured`                                    | the platform has no signing key yet                                                    |

A second report of content that already has an open report becomes a corroboration (`corroborated: true`). The SDK's `createModerationClient` does the signing and maps these errors.

## Receiving decisions

The platform POSTs to the endpoint URL you registered. Seven message types:

| `type`                            | Means                                                               |
| --------------------------------- | ------------------------------------------------------------------- |
| `content.hide` / `content.remove` | set `quarantinedBy`; RLS hides the row from everyone but its author |
| `content.restore`                 | clear it                                                            |
| `user.suspend` / `user.ban`       | a Supabase `ban_duration` on the user with that DevDogs identity    |
| `user.restore`                    | lift it                                                             |
| `user.delete`                     | the member deleted their account: erase what you hold on them       |

```json
{ "type": "content.hide", "timestamp": "2027-01-01T00:00:00.000Z",
  "data": { "contentType": "session", "contentRef": "…", "reportId": "…" } }
{ "type": "user.ban", "timestamp": "…", "data": { "userId": "…", "reason": "harassment", "reportId": "…" } }
```

`reason` is the report's category. A moderator's private note never leaves the platform.

**Your receiver must:**

1. **Verify the signature** against the raw body, and answer 401 when it fails. The function's JWT check must be off; the signature is the authentication. The platform sends no `Authorization` or `apikey` header, so a Supabase Edge Function deployed with the default `verify_jwt = true` is refused at the gateway with `401 UNAUTHORIZED_NO_AUTH_HEADER` before your code runs, and every delivery retries until it dead-letters. Set it in the function's `supabase/config.toml` (`[functions.platform-moderation]` with `verify_jwt = false`), or deploy with `--no-verify-jwt`; `supabase functions serve` honours the same setting.
2. **Be idempotent.** Record `webhook-id` in a `moderation_events` table and answer 2xx for one you have seen. The platform retries, and a console resend reuses the id.
3. **Be order-safe.** Ignore (but acknowledge) a message whose `timestamp` is older than the last decision applied to the same item (`content:<type>:<ref>` or `user:<id>`).
4. Answer **2xx** once handled, including for a duplicate or a stale message, and **5xx** only for a failure worth retrying.

Anything but a 2xx is retried with a growing delay (30 s doubling to an hour, about ten tries). After that the delivery is dead-lettered: it is marked failed, an alert is raised for a registered app (a development client's failure only marks it failed: it is the owner's endpoint under test), and the report page in the console shows a **Resend** button. A delivery to an app with no endpoint is recorded as failed immediately instead of being dropped. A 15-minute cron re-queues a pending delivery only when it has shown no sign of life (queued or attempted) for 90 minutes, longer than the longest retry delay, so a delivery that is still retrying is never queued twice.

`createReceiver` in `@devdogsuga/sdk/moderation` is the reference implementation of all of it, with an in-memory store. Port its three rules to SQL in `apply_event`; do not invent others. Record the message id, check the order and apply the change in one transaction: an id recorded by a run that then failed would make the platform's retry a duplicate, and the decision would be lost.

## Registering a production app

An officer who holds `canManageOAuthApps` (the permission that manages production OAuth clients) registers an OAuth client as a production app on the moderation console (**Apps Outside the Platform**): a slug, a name, the client id, the endpoint URL (`https`, a public hostname) and one content type per line, `type | Label | https://app/{ref}`. Reports from that client then reach the moderators. Re-registering a slug updates it; pointing it at another client moves the registration, and the old client's reports are then refused until it is registered again.

Only a **production** OAuth client made on [`/tools/oauth`](/tools/oauth) can be registered; a development client, a client created some other way (it has no tier) and a deleted client are all refused. Deleting a client removes its moderation registration, so a deleted client's reports are refused and nothing is delivered to its endpoint. A **development** client that is not registered files its reports into a sandbox only its owner reads (below). A **production** client that is not registered gets `403 client_not_registered` instead of a sandbox answer, so a missed registration shows up in the app's first Report & Block instead of sending every report where no moderator will see it.

When registering is what first creates the client's moderation record, the console shows the client's signing secret once, under the form. Copy it into the app's environment (DogPack: `PLATFORM_MODERATION_SECRET`). If the secret is lost or copied wrongly, a holder of `canManageOAuthApps` rotates it on [`/tools/oauth`](/tools/oauth) under **Moderation**, where every production client is listed (the old secret stops working at once). Registering, rotating the secret and changing the endpoint of a production client are written to the audit log (`oauth_client.moderation_registered`, `oauth_client.moderation_secret_rotated`, `oauth_client.moderation_endpoint_changed`).

## Testing, in three layers

1. **The SDK.** `signedSamples()` is a six-message sequence: a hide is applied, its replay is a duplicate, a restore dated before it is stale, a later restore is applied, a suspension is applied, and an older user restore is stale. Run it against your receiver in CI.
2. **The sandbox.** With a development client, your backend's reports appear under **Sandbox reports** on `/tools/oauth` and never in the moderators' queue. **Send test action** sends a real signed delivery to your endpoint (`https` and public) and shows what it answered.
3. **Local Docker.** (Until a build of `main` with the moderation command is on the `next` tag, run the same commands from a checkout with `pnpm --filter @devdogsuga/devtools build` and then `pnpm --filter @devdogsuga/devtools run cli moderation …`.) `pnpm devtools moderation send content.hide --content-ref <id>` signs a message and POSTs it to your local Edge Function (default `http://127.0.0.1:54321/functions/v1/platform-moderation`). `--replay` sends it twice, `--stale` dates it a minute ago, and `pnpm devtools moderation samples` runs the whole sequence and reports pass or fail. Secrets: `--secret`, or `PLATFORM_MODERATION_SECRET`, or the well-known sample secret.

## Operating notes

- The root key is `MODERATION_SIGNING_KEY`, set as a secret on the GitHub environment (`staging`, `production`): the deploy writes it onto the Worker, so never set it on the Worker directly, where the next deploy would silently replace it. Without it the API answers 503 and no delivery is signed. Changing it changes **every** client's secret.
- The queues are `<tier>-moderation-deliveries` and `<tier>-moderation-deliveries-dlq`, created with `wrangler queues create`. The dead-letter consumer calls `postAlert`.
- Staging runs no crons, so a delivery that missed the queue there is re-queued by hitting `/cron/moderation-deliveries` by hand with the staging `CRON_SECRET`.
