---
name: Sign-in is down during registration
description: The incident page for the worst day to lose sign-in - how to tell where it broke, the fastest fix for each layer, and who to tell.
order: 1
section: infrastructure
---

# Sign-in is down during registration

When students are registering for classes, DogDays is in use and a broken sign-in is felt within minutes. Signed-out use still works in DogDays (its plans live in local storage), so this is degraded, not dead - say so in the announcement. Work down the layers; stop at the first one that is broken.

## 1. Is it us or the identity provider?

Open the platform in a private window and try each provider. If **only one** provider (Google, say) fails, the problem is that provider: its client, its consent screen, or its own outage. Check [Google Cloud](../credentials/google-cloud.md) (or the provider's page) and tell members to use another provider meanwhile.

## 2. Is the platform answering?

```sh
curl -sI https://devdogsuga.org/ | head -1
curl -s https://<api-host>/auth/v1/health
curl -s https://<api-host>/auth/v1/.well-known/openid-configuration | head -c 300
```

`<api-host>` is the project's API host from `API_URL`. If the health check fails, the Supabase project is the problem: check its status page and dashboard (paused? out of connections?). If the platform fails and Supabase is fine, it is a deploy: [Rolling back](../deploys/rollback.md).

## 3. Does the hand-off work?

The scheduled smoke run ([Smoke checks](../deploys/smoke-checks.md)) tests the exact path: authorize redirects to the platform's consent page, and the consent page answers 404 without an `authorization_id`. Run it now from the Actions tab (_Smoke_, _Run workflow_). The failing check names the layer:

- **Authorize does not redirect:** the Supabase OAuth server is off or the client is gone. Open the project's _Authentication, OAuth server_ settings.
- **Consent page 200 or 5xx:** the platform Worker is wrong. Roll back.
- **Hook check fails:** `platform.restrict_oauth_tokens` is broken; tokens may be refused for every client. Fix forward with a migration, or roll back the migration's deploy if the Worker still reads the old shape.

## 4. Products only

If members can sign in to the platform but **not to DogDays or DogPack**, the product's `custom:devdogsuga` provider is the suspect:

- The issuer the platform's discovery document reports must equal what the product registered. After the [vanity-subdomain switch](../deploys/vanity-subdomain-switch.md) or any change of the platform project, re-run provider registration (`config-push.mjs register`, the `register_provider` option of `deploy-database.yaml`).
- The product's OAuth client on `/settings/oauth` may have been deleted or rolled. A production client cannot be deleted unless a replacement exists, so look for a replaced one.

## While it is down

- Post once, in the announcements channel: what is broken, what still works, when you will update. Do not guess a cause in public.
- Pause deploys: do not approve anything that is waiting.
- Do not rotate the JWT signing keys or "reset" the auth config to see what happens. [Supabase](../credentials/supabase.md) explains why.

## Afterwards

Write a short note: timeline, cause, what detected it (a member, or the smoke check?), and the one change that would have caught it earlier. If a member found it first, the smoke check is missing a case; add it.
