# @devdogsuga/og

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
use Next's own vendored copy of `@vercel/og`, because `@opennextjs/cloudflare`
patches exactly that path on the way into a Worker; the CLI needs a build that
runs under plain Node, which the published `@vercel/og` does not provide. The
templates are the half they can share, so a change to the brand lands in the
chapter banner and in a `/events` link preview at once.

## Two axes

A template takes its own `width` and `height` rather than assuming one size,
because the same card is asked for at a link unfurl's 1.91:1, the GDG on Campus
platform's 2560x650 banner and its 1080x1080 square. `CardShell` lays each out
differently — the wide one turns on its side, with the lockup in a left column —
so a card is never one picture stretched across three shapes.

`formats.ts` holds the renditions; the CLI holds which graphic supports which.

```tsx
import { EventCard, FORMATS, loadFonts } from "@devdogsuga/og";

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

`loadFonts()` returns the faces embedded in this package. They are base64 in a
module rather than files on disk, because the platform renders inside a
Cloudflare Worker: there is no filesystem to read a `.ttf` out of, and fetching
one would put a second network round trip — and a second way to come back blank
— inside every link unfurl.

## Regenerating

```bash
pnpm --filter @devdogsuga/og generate
```

Rewrites `src/generated/`: the fonts (fetched from Google Fonts, the same
families `next/font` serves the site), the brand marks (split out of
`public/brand/devdogs-logo-dark.svg` and base64'd), and the Phosphor icon paths
(taken from the same package the app draws its UI with). Run it after a brand
asset, a font, or the Phosphor version changes; the output is committed. It is
not a build step — it reaches out to the network, and CI should not.

`src/brand.ts` is not generated. It transcribes Tailwind's mauve ramp and the
project accents in the `oklch()` notation Tailwind writes them in, converting to
hex on the way past because Satori cannot read `oklch()` — and treats what it
cannot read as transparent, silently. `palette.test.ts` reads the real
stylesheet and asserts the transcription still matches.

## Seeing them

```bash
pnpm devtools images                      # pick from a list
pnpm devtools images '*' --no-output      # what exists, and what each is for
pnpm devtools images 'page/*' --all-formats --out ./preview
```

`@devdogsuga/og/event` is the other entry point: the club's timezone and the
meeting-to-card formatting, shared by the platform's live event cards and the
CLI's exported ones. It imports nothing, so `lib/meetingTitle.ts` can take
`EVENT_TZ` from it without a bundler ever considering the fonts above.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/og)
