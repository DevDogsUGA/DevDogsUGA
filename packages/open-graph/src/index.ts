/**
 * Brand image templates, rendered by two different callers.
 *
 * `apps/platform` renders them through `next/og` for Open Graph cards, and
 * `@devdogsuga/devtools` renders them through Satori directly to write files on
 * disk. Nothing here imports a renderer, which is what lets both work: the
 * platform must use Next's own compiled copy of `@vercel/og` (bundled for the
 * Worker by vinext's build), while the CLI needs a build that runs under
 * plain Node. The templates are the shared half.
 *
 * A template takes its own `width` and `height` rather than assuming one size.
 * The same card is asked for at a link unfurl's 1.91:1, the GDG platform's
 * 2560x650 banner and its 1080x1080 square, and `CardShell` lays each out
 * differently — see `formats.ts` for the renditions and `CardShell` for the
 * three shapes.
 *
 * `apps/platform` always consumes this BUILT — Next bundles `dist` for the
 * Worker like any other dependency. `@devdogsuga/devtools` is the one
 * exception: it resolves this package's `"."` export through the
 * `devdogs-source` condition (declared in this package's `package.json`,
 * picked by hand in Backstage's `packages/devtools/src/repo/resolve.ts` —
 * `require.resolve`/tsx's `register({ conditions })` can't do condition-based
 * resolution here), so a template edit renders immediately with no build step
 * in between.
 *
 * This used to be impossible: these are `.tsx`, and the old in-repo devtools
 * (pre-Backstage-cutover) ran as a single `tsx --conditions=devdogs-source`
 * process, which picks its JSX setting from one tsconfig near the CWD —
 * `devtools`'s own, not this package's — so it compiled these templates with
 * the classic runtime and every render failed with `React is not defined`.
 * The cutover's devtools loads repo TypeScript through tsx's `register()` API
 * instead (`packages/devtools/src/repo/tsx-loader.ts`), which resolves each
 * loaded file's own nearest tsconfig, so it correctly picks up this package's
 * `jsx: react-jsx` — verified by rendering through `pnpm devtools images`
 * straight from `src`, no `dist` involved. Templates still import React
 * explicitly (see `tsconfig.json`) as a defensive measure in case that ever
 * stops being true for some other loader.
 *
 * `@devdogsuga/brand/event` is a SEPARATE entry point on `@devdogsuga/brand`
 * and deliberately so: it holds the club's timezone and the meeting-to-card
 * formatting, and importing it must not drag that package's few hundred
 * kilobytes of embedded fonts along. This package used to define its own
 * brand tokens (`brand.ts`, `event.ts`, `fonts.ts`, `oklch.ts`,
 * `generated/{assets,fonts}.ts`) and re-export them here; since the
 * Backstage cutover they all come from `@devdogsuga/brand` instead — see
 * that package for the palette, contact copy, fonts and artwork, including
 * `GDG_MARK`.
 */
export {
  BLOCK_SHADOW,
  ACCENT,
  CONTACT,
  MAUVE,
  THEME,
  WHITE,
  WORDMARK_METRICS,
  loadFonts,
  type LoadedFont,
  type Asset,
  GDGC_UGA,
  GDGC_UGA_LIGHT,
  MARK,
  WORDMARK_ON_DARK,
  WORDMARK_ON_LIGHT,
} from "@devdogsuga/brand";
export {
  CARD_FORMATS,
  cardLayout,
  EMAIL_SIGNATURE_ASPECT,
  FORMATS,
  type Format,
  type FormatFamily,
  type FormatName,
  formatsIn,
  CARD_REFERENCE_WIDTH,
  type CardLayout,
  OG_SIZE,
  OPAQUE_FORMATS,
} from "./formats.js";
export { type IconName } from "./generated/icons.js";
export {
  Icon,
  IconRow,
  GdgcCobrand,
  Mark,
  SocialRow,
  Tile,
  Wordmark,
} from "./primitives.js";
export { DogDaysMark, DogPackMark } from "./marks.js";

export { Banner, type BannerProps } from "./templates/Banner.js";
export {
  CardShell,
  type CardContext,
  type CardShellProps,
} from "./templates/CardShell.js";
export { rgba } from "./templates/wash.js";
export { AppIcon, type AppIconProps } from "./templates/AppIcon.js";
export {
  EmailSignature,
  type EmailSignatureProps,
} from "./templates/EmailSignature.js";
export { EventCard, type EventCardProps } from "./templates/EventCard.js";
export { PageCard, type PageCardProps } from "./templates/PageCard.js";

export { APPS, type AppKey, type AppBrand } from "./apps.js";
export { PAGE_CARDS, type PageCardCopy } from "./pages.js";

/**
 * Re-exported for convenience, and safe to take from here: these are types and
 * one pure function, so a consumer that only wants `EventDetail` pays nothing.
 * A consumer that must NOT pull in the fonts — anything a browser bundles —
 * should import `@devdogsuga/brand/event` directly.
 */
export {
  type CardableMeeting,
  type EventDetail,
  EVENT_TZ,
  formatEventDate,
  formatEventTime,
  meetingCardDetail,
  meetingLocation,
  type MeetingCardInput,
} from "@devdogsuga/brand/event";
