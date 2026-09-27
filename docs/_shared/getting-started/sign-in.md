---
name: Sign-in
description: Registering "Sign in with DevDogs" against your Supabase project — the environment step, not the app-side flow.
order: 50
section: getting-started
mount: [schedule-builder, study-group-finder, platform]
---

# Sign-in

This page is about **configuring your database to accept sign-in** — it is
not about how any app implements the sign-in screen itself. (If you're
building a competition that involves sign-in, that flow is part of the brief:
see the competition callout on your project's overview.)

Every DevDogs app authenticates through the same custom OAuth provider,
`custom:devdogsuga`, issued by the platform (production: `api.devdogsuga.org`).
Registering that provider against your Supabase project is one command,
whether your project is local or hosted:

```bash
pnpm devtools oauth
```

## What it does

The command asks which Supabase project to configure — the local stack
running in this directory, or a hosted one (by URL and service-role key) —
then either opens your browser for a one-click connect against the platform,
or asks for a device code if a browser isn't reachable from where you're
running it (SSH, a container, Codespaces). Either way it writes the resulting
client credentials to `.env.local` and configures the provider on your
project directly — nothing to paste into the Supabase dashboard yourself.

Running [`pnpm devtools setup`](./supabase-hosted)
against a hosted project chains into this automatically. Run it directly
when you're setting up a **local** stack (setup's hosted chaining doesn't
apply there), or if you need to redo it — reconnecting a project, or
switching which one a directory targets.

## Redirect URL

After configuring the provider, add your local dev URL to the project's own
allow list if you haven't already — Dashboard → Authentication → URL
Configuration → Redirect URLs, add `http://localhost:<port>/**` (3001 for
schedule-builder, 3000 for platform). Signing in without this configured
fails at the provider's redirect step — see
[Redirect URL missing](./troubleshooting#redirect-url-missing).

## Next

[Doctor](./doctor) checks that sign-in,
along with everything else, is actually reachable from your machine — then
run your project's own app.

<details>
<summary>Google sign-in</summary>

Production apps sign in through Google, restricted to `hd: uga.edu`, not
through `custom:devdogsuga` — that mode exists for members who aren't
contributors. Setting it up is officer/maintainer work; see the identity
guide under Infrastructure in the platform docs.

</details>
