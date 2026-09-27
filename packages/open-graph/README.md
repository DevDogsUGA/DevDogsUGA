# @devdogsuga/open-graph

The club's image templates, rendered two ways from one set of files.

Every picture DevDogs publishes is laid out here as JSX that
[Satori](https://github.com/vercel/satori) turns into a vector: the banner on
the GDG on Campus chapter page, the SavvyCal cover, the email signatures, the
app icons, and the Open Graph card behind every public link.

Two callers render them, and neither one lives here:

- **`apps/platform`** renders link cards per request through `next/og`
  (`app/**/opengraph-image.tsx`).
- **`@devdogsuga/devtools`** renders files on disk — `pnpm devtools images`.

That split is the reason this package exports no renderer. The platform must
use Next's own vendored copy of `@vercel/og`, bundled for the Worker by
vinext's build; the CLI needs a build that runs under plain Node, which the
published `@vercel/og` does not provide. The templates are the half they can
share, so a change to the brand lands in the chapter banner and in a
`/events` link preview at once.

## Two axes

A template takes its own `width` and `height` rather than assuming one size,
because the same card is asked for at a link unfurl's 1.91:1, the GDG on Campus
platform's 2560x650 banner and its 1080x1080 square. `CardShell` lays each out
differently — the wide one turns on its side, with the lockup in a left column —
so a card is never one picture stretched across three shapes.

`formats.ts` holds the renditions; the CLI holds which graphic supports which.

```tsx
import { EventCard, FORMATS, loadFonts } from "@devdogsuga/open-graph";

const format = FORMATS["gdgc-square"];

new ImageResponse(
  EventCard({ ...detail, width: format.width, height: format.height }),
  {
    width: format.width,
    height: format.height,
    fonts: loadFonts(),
  },
);
```

`loadFonts()` is re-exported here from `@devdogsuga/brand`; the faces it
returns are embedded there as base64 in a module rather than files on disk,
because the platform renders inside a Cloudflare Worker: there is no
filesystem to read a `.ttf` out of, and fetching one would put a second
network round trip — and a second way to come back blank — inside every link
unfurl.

## Regenerating

```bash
pnpm --filter @devdogsuga/open-graph generate
```

Two outputs, in two places, since the Backstage cutover split brand tokens
out of this package:

- `generated-for-brand/{assets,fonts}.ts` — the embedded fonts (fetched from
  Google Fonts, the same families `next/font` serves the site) and every
  brand mark, including `GDG_MARK` (split out of
  `public/brand/devdogs-logo-dark.svg` and Google's own bracket mark, then
  base64'd). This package does not ship or consume this output itself; copy
  it by hand into `Backstage/packages/brand/src/generated/{assets,fonts}.ts`
  and commit it there. Gitignored here on purpose — see
  `scripts/generate.ts`'s header.
- `src/generated/icons.ts` — the Phosphor icon paths this package's own
  templates draw. Committed as before; purely open-graph-specific, since
  `@devdogsuga/brand` has no opinion on icons.

Run it after a brand asset, a font, or the Phosphor version changes; the
`generated-for-brand/` output is not a build step here or in Backstage — it
reaches out to the network, and CI should not.

The palette, contact copy, and the `oklch()`-to-hex conversion Satori needs
now live in `@devdogsuga/brand` (`src/oklch.ts`, `src/brand.ts`, and that
package's own `palette.test.ts`), not here.

## Seeing them

```bash
pnpm devtools images                      # pick from a list
pnpm devtools images '*' --no-output      # what exists, and what each is for
pnpm devtools images 'page/*' --all-formats --out ./preview
```

`@devdogsuga/brand/event` is the other entry point: the club's timezone and the
meeting-to-card formatting, shared by the platform's live event cards and the
CLI's exported ones. It imports nothing, so `lib/meetingTitle.ts` can take
`EVENT_TZ` from it without a bundler ever considering the fonts above.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/og)
