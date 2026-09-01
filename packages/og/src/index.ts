/**
 * Brand image templates, rendered by two different callers.
 *
 * `apps/platform` renders them through `next/og` for Open Graph cards, and
 * `@devdogsuga/devtools` renders them through Satori directly to write files on
 * disk. Nothing here imports a renderer, which is what lets both work: the
 * platform must use Next's own compiled copy of `@vercel/og` (the one
 * `@opennextjs/cloudflare` patches on the way to a Worker), while the CLI needs
 * a build that runs under plain Node. The templates are the shared half.
 *
 * A template takes its own `width` and `height` rather than assuming one size.
 * The same card is asked for at a link unfurl's 1.91:1, the GDG platform's
 * 2560x650 banner and its 1080x1080 square, and `CardShell` lays each out
 * differently — see `formats.ts` for the renditions and `CardShell` for the
 * three shapes.
 *
 * Consumed BUILT, unlike `@devdogsuga/env` — there is no `devdogs-source`
 * export condition here on purpose. These are `.tsx`, and the source condition
 * hands raw TypeScript to whichever loader the importer is using; tsx picks its
 * JSX setting from a single tsconfig near the CWD, so `devtools` (whose CWD is
 * its own package) compiled these templates with the classic runtime and every
 * render failed with `React is not defined`. `dist` is compiled once, here,
 * with this package's own `jsx: react-jsx`, and no consumer has to agree.
 *
 * The cost is that editing a template means `pnpm --filter @devdogsuga/og build`
 * before the CLI sees it. Turbo's `^build` covers CI and every `pnpm build`.
 *
 * `@devdogsuga/og/event` is a SEPARATE entry point and deliberately so: it
 * holds the club's timezone and the meeting-to-card formatting, and importing
 * it must not drag this module's few hundred kilobytes of embedded fonts along.
 */
export {
  BLOCK_SHADOW,
  ACCENT,
  CONTACT,
  MAUVE,
  THEME,
  WHITE,
  WORDMARK_METRICS,
} from "./brand.js";
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
export { loadFonts, type LoadedFont } from "./fonts.js";
export {
  type Asset,
  GDGC_UGA,
  GDGC_UGA_LIGHT,
  MARK,
  WORDMARK_ON_DARK,
  WORDMARK_ON_LIGHT,
} from "./generated/assets.js";
export { type IconName } from "./generated/icons.js";
export {
  Icon,
  IconRow,
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
 * should import `@devdogsuga/og/event` directly.
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
} from "./event.js";
