---
name: Deployment
description: The DogDays zone, custom domains, and the one value nothing cross-checks.
order: 10
section: infrastructure
---

# Deployment

Deploys to Cloudflare Workers through vinext, on its own zone: `dogdays.dev` in
production and `staging.dogdays.dev` in staging, both declared as
`custom_domain` routes in `wrangler.jsonc`.

`SCHEDULE_BUILDER_URL` has to be kept in step with those by hand — nothing
cross-checks the two. A mismatch is not a build failure; it's an OAuth
callback that silently goes to the wrong place.

In-app branding is **DogDays** throughout (mark and copy from
`@devdogsuga/open-graph`), with its own light/dark zinc-and-red design driven
by system `prefers-color-scheme` — not the platform's design language.
