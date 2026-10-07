---
name: email
description: react-email templates compiled at build time into two string arrays, so sending one is an interleave with no React in the Worker.
order: 8
section: guides
---

# email

`@devdogsuga/email` lives in the [Backstage](https://github.com/DevDogsUGA/Backstage) repository at `packages/email`, beside the platform that sends with it; run the commands below from there. It is one call in almost every case:

```ts
import { render } from "@devdogsuga/email";

const { subject, html, text } = render("TeamInvite", {
  inviteeName,
  teamName,
  competitionName,
  leadName,
  acceptUrl,
});
```

**Send the `text` part.** Some clients show only that, and its absence
measurably worsens spam scoring — a message with no plain-text alternative is
one of the cheapest signals a filter has.

`Templates` is generated from each template's exported props, so this call is
type-checked against the real component: a renamed prop, a missing one, or a
typo is a build error rather than a `⟦teamName⟧` appearing in somebody's inbox.
`templateNames` lists what exists — `JoinRequest` and `TeamInvite` today.

## Nothing React reaches the Worker

The sources under `src/templates` are ordinary react-email components, and they
are rendered **at build time only** — never per send — with a proxy standing in
for their props so every access emits a sentinel. The rendered HTML is split on
those sentinels, and the pieces are what ships: two arrays per template, filled
at runtime by interleaving them. React and the renderer are build-time
dependencies that the runtime cannot reach, which is what takes Worker bundle
size off the list of things to watch.

<details>
<summary>Why the compiler renders each template more than once</summary>

The build renders every template **twice per output**, with two different
sentinel alphabets, and compares the results. The Proxy hands back a string for
every prop access, so `{p.isLead ? … : …}` always takes the truthy branch and
would silently bake one variant into the shipped artifact. Two sentinel sets
must produce identical structure; anything that reads a prop's _value_ rather
than substituting it makes them disagree, and the build fails with the chunk
that differed.

`html` and `text` are compiled separately, and the subject line is rendered
once more on top, so a two-template package does around ten renders per build.
All of it happens in `packages/email/scripts/compile.tsx`, and none of it
happens again at send time.

</details>

Values are escaped **on substitution**, never at compile time — team names and
display names are user-authored, so a team called `<script>` must not become
one. Slots whose name ends in `Url` or `Href` go through `safeUrl` instead,
which is scheme-checked rather than merely encoded: `encodeURI` leaves
`javascript:alert(1)` completely intact, and these URLs are built from database
values.

Edit a template and run `pnpm -F @devdogsuga/email codegen` to regenerate
`src/generated/templates.ts`; the package's `typecheck` and `test` do it for you. That file
carries a "do not edit" header and means it.

## Preview populated emails

The package's `preview` script fills each template with realistic,
non-sensitive data rather than compiler sentinels:

```sh
pnpm -F @devdogsuga/email preview
pnpm -F @devdogsuga/email preview TeamInvite --format html,text --out ./previews
```

With no template names it writes every template. Name one or more to narrow it,
and pass `--format html,text` when both MIME alternatives are useful. HTML is
the default, and files go to `email-previews/` (gitignored) unless `--out` says
otherwise. The fixture registry is type-checked against every template, so a
new template or required prop cannot leave the preview script silently stale.

The compile step also writes `__snapshots__/<Template>.html` — the rendered artifact with
its sentinels still in place. Open one in a browser to see what a template looks
like, and read it in review: because the sentinels survive, a design change
shows up as a diff about the template rather than about whichever fixture values
happened to be used. There is no preview server.

Every export is in `packages/email/src` in Backstage.
