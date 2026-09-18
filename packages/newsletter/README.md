# @devdogsuga/newsletter

The DevDogs Changelog — the weekly newsletter — as one tree of email-safe React
components with two callers:

- **`apps/platform`** renders issues as pages at `/changelog` and
  `/changelog/<version>`, straight from `ChangelogEmail`.
- **`@devdogsuga/devtools`** exports issues as files — `pnpm devtools
newsletter` — an `.html` preview and an Outlook-importable `.eml` per issue.

It deliberately does not go through `@devdogsuga/email`. That package's
compiled-slot pipeline exists to prove a template cannot branch on its inputs,
which is exactly what a newsletter must do: issues differ in how many events
they list. So issues here are authored data (`src/issues.ts`), rendered at
author time with `react-dom/server`, and the send is a finished HTML document
rather than a template plus fill.

## One tree, two targets

Every component takes a `RenderContext` — font stacks plus an asset resolver —
because the two destinations disagree about both:

- **Pages** pass `webRenderContext()`: `var(--font-display)` and friends
  (`next/font` renames every family it self-hosts, so a literal `'Alan Sans'`
  would never match on the site) and SVG data-URI image sources.
- **Exports** pass `emailRenderContext()`: literal font stacks with email-safe
  fallbacks, and `cid:` references to PNG parts embedded in the `.eml` —
  Gmail and both Outlooks strip SVG in any form.

Everything else is the same markup, and that markup is written for the worst
renderer it will meet (classic Outlook's Word engine): tables for layout,
longhand font properties via the `font()` helper (never the `font:`
shorthand), `bgColor` attributes under every painted background, no alpha
anywhere (`mix()` pre-blends), and button geometry on table cells rather than
anchors. The tests in `src/export/render.test.tsx` hold the line on the
mechanical parts.

## Dark mode

Dark-mode mail clients do not leave an already-dark email alone: the web
Outlooks (outlook.com, new Outlook, Outlook mobile) run every color through a
contrast-repair pass. Rendered-DOM forensics (two dumps plus a sixteen-way
carrier probe, 2026-09-11) showed exactly how far the 2026 transform goes: it
computes every element's effective background from the full cascade and
**injects** the repaired value inline with `!important` — which, by the
cascade, no stylesheet rule can ever outrank — rewrites `bgcolor` attributes
and border colors, deletes `background-image`, `hsl()`, `var()` and
`color-mix()` from the embedded stylesheet, and recolors `rgba()` in place.
Exactly one paint mechanism passed the probe untouched, inline and in the
stylesheet alike: `box-shadow`. The architecture follows from those findings:

- **No background is ever inline.** Every painted element carries a `bc-`
  class naming its hex; `paintCss()` in `src/darkmode.ts` supplies the base
  rule (the color plus `solidBg`'s same-color `linear-gradient` underlay, as
  Gmail armor), and a `bgcolor` attribute covers clients without `<style>`.
  The dot-grid and slant textures ride the same stylesheet as `.bg-dots` /
  `.bg-slants`. The platform's `/changelog` pages embed `paintCss()` too.
- **Pins re-assert every color** (`darkModeCss()`): each value repeated with
  `!important` under `@media (prefers-color-scheme: dark)` for clients that
  honor it, and under the `[data-ogsc]`/`[data-ogsb]` attributes the web
  Outlooks stamp on elements they recolor — rules in that scope escape their
  color conversion (ancestor-scoped single-selector rules only; that is the
  one shape Outlook.com's CSS support keeps).
- **The scoped pins carry the real weapon:** a same-color
  `box-shadow: inset 0 0 0 3000px` on every `bc-` pin, painting the authored
  color over the gray Outlook injected. It lives only under the `data-og*`
  scopes because an inset shadow paints over `background-image` — in any
  other client it would erase the bar textures, but those scopes apply
  exactly when Outlook has already stripped the textures anyway.
- **One deliberate sacrifice:** `<body>` keeps its inline background so the
  web Outlooks repaint _it_, stamp it with `data-ogsb`, and thereby switch on
  every scoped pin below. The repainted body is fully covered by the pinned
  full-width table, so the sacrifice never shows.

Text colors stay inline (with `tc-` classes alongside); Outlook's text
repairs — lightening the dim grays — read fine on the armored surfaces.
Borders split by role: Outlook repaints border colors inline with
`!important` too, so every structural divider is a painted 1px cell
(`DividerCell`, full background armor) and only the card outlines remain
true borders, where the repaint reads as an intentional outline. In its dark
mode the design trades its textures and the featured card's block shadow for
flat, correct surfaces. A render test walks every issue and fails on any
inline background outside `<body>`, any `bgcolor` without its class, and any
class without its paint rule and pin.

None of this survives being sent from an Outlook composer — see
[Sending](#sending). The defenses assume the authored document reaches
recipients intact, which only `--send` guarantees.

The one holdout is classic Outlook for Windows in dark mode: the Word engine
does a full color invert with no override hook. The result stays readable
(its whole purpose is contrast), just re-themed, and readers get a
per-message toggle back to the sent colors.

## Issues

`src/issues.ts` is the content: one `ChangelogIssue` per send, versioned with
semver because a send is a release. The version doubles as the archive URL
segment and the export filename. A copy pass before a send touches that one
file; the platform archive and the exported email can never disagree.

## Exporting

```bash
pnpm --filter @devdogsuga/newsletter build   # the CLI consumes dist/
pnpm devtools newsletter                     # pick issues interactively
pnpm devtools newsletter '*' --out ~/changelog
```

The `.eml` carries `X-Unsent: 1` and no `Message-ID`, so **classic Outlook
for Windows** opens it as an editable compose draft. New Outlook and Outlook
on the web do not honor `X-Unsent` and open `.eml` files read-only; for those
clients the draft has to already be in the mailbox — which is what `--push`
does. Either way the draft is a review copy: the send happens with `--send`
(below), because every Outlook composer rewrites what it sends.

## Pushing a draft

```bash
pnpm devtools newsletter 3.0.1 --push
```

appends the issue — same MIME as the `.eml`, minus `X-Unsent` — straight into
the Drafts folder of `devdogs@uga.edu` over IMAP, where an officer can review
it in any Outlook signed into the club account.

Review is all a draft is for. **Never send the newsletter from Outlook
itself.** Its composers are rich-text editors with a style whitelist, and
sending re-serializes whatever the editor kept: forensics on a received copy
showed the head `<style>` replaced with Outlook's own, every
`background-image` and `bgcolor` stripped, and most class attributes dropped —
the entire dark-mode defense, gone in transit, leaving recipients' dark-mode
Outlooks free to repaint every background. (Classic Outlook mangles
differently, into Word HTML, with the same result.)

## Sending

```bash
pnpm devtools newsletter 3.0.1 --send --to listserv@listserv.uga.edu
```

submits the issue over SMTP as the club mailbox, byte-for-byte as authored —
no composer touches it, so recipients get the document with its stylesheet,
pins and gradient underlays intact. `--to` is required and comma-separated;
there is deliberately no interactive path to a send.

The first `--push` or `--send` opens a browser; sign in as the mailbox and
the CLI catches the redirect itself on a loopback port. (If no local port
would bind, it falls back to printing the URL and asking for the
`https://localhost` address the browser lands on.) The refresh token is
stored at `~/.config/devdogsuga/newsletter-mailbox.json` (mode 600 — it opens
the club mailbox, treat it like a password) and every later run is silent.
`--mailbox` overrides the account.

Why IMAP/SMTP and not Microsoft Graph: UGA's tenant blocks user consent for
every Graph mail scope, but Microsoft's default consent policy allowlists a
handful of mail clients by application ID for the legacy IMAP and SMTP
scopes. The sign-in therefore presents Thunderbird's public client ID — the
same grant Thunderbird itself would hold, and a documented convention in
open-source mail tooling (mbsync, OfflineIMAP, DavMail) — but it is
Microsoft's allowlist, and this stops working the day they prune it. The
durable fix is an EITS-approved app registration with delegated
`Mail.ReadWrite` and `Mail.Send`; if that ever lands, swap the IMAP APPEND
and SMTP submission for their Graph calls and delete the borrowed ID.

## Regenerating the lockup

`src/generated/lockup.ts` embeds `apps/platform/public/brand/devdogs-logo-dark.svg`
(the composed mascot + wordmark, which `@devdogsuga/og` does not export). If
that artwork changes, re-run from the repo root:

```bash
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const svg = readFileSync("apps/platform/public/brand/devdogs-logo-dark.svg", "utf8").trim();
const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
writeFileSync("packages/newsletter/src/generated/lockup.ts", [
  "// @generated from apps/platform/public/brand/devdogs-logo-dark.svg — the",
  "// mascot + wordmark lockup drawn for dark grounds. Regenerate by re-running",
  "// the base64 line in packages/newsletter/README.md if the artwork changes.",
  "",
  "/** The artwork's own viewBox units, carried so display sizes derive an aspect ratio instead of hard-coding one. */",
  "export const DEVDOGS_LOCKUP_ON_DARK = {",
  `  src: "data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}",`,
  `  width: ${w},`,
  `  height: ${h},`,
  "} as const;",
  "",
].join("\n"));
'
```

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/newsletter)
