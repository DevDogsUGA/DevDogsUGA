/**
 * The club's brand identity: palette, contact/social copy, embedded fonts, the
 * mark/wordmark artwork, and the Satori templates (banner, app icon, event and
 * page cards) that render them.
 *
 * The templates take their own `width` and `height` rather than assuming one
 * size; see `formats.ts` for the renditions. Nothing here imports a renderer,
 * which is what lets two callers share them: `./next` renders through
 * `next/og` in an app's Worker, and `./render` through Satori and resvg in
 * Node. A consumer that wants only colours should take `./palette.css` or
 * `PALETTE`, and one that wants only the app marks `./marks`; both skip the
 * embedded fonts and artwork this entry carries.
 *
 * `@devdogsuga/sdk/brand/event` is a SEPARATE entry point and deliberately so —
 * see `event.ts` for why: it holds the club's timezone and the
 * meeting-to-card formatting, and importing it must not drag this module's
 * embedded fonts and artwork along.
 */
export {
  BLOCK_SHADOW,
  ACCENT,
  CONTACT,
  COSMIC,
  DEVDOGS,
  KIND,
  MAUVE,
  THEME,
  WHITE,
  WORDMARK_METRICS,
} from "./brand.js";
export { loadFonts, type LoadedFont } from "./fonts.js";
export {
  type Asset,
  GDG_MARK,
  GDGC_UGA,
  GDGC_UGA_LIGHT,
  LOCKUP_ON_DARK,
  LOCKUP_ON_LIGHT,
  MARK,
  WORDMARK_ON_DARK,
  WORDMARK_ON_LIGHT,
} from "./generated/assets.js";

export { PALETTE, paletteCss } from "./palette.js";
export {
  CARD_FORMATS,
  cardLayout,
  EMAIL_SIGNATURE_ASPECT,
  EVENT_FORMATS,
  INSTAGRAM_POST_SIZE,
  INSTAGRAM_STORY_SIZE,
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
export {
  DOGDAYS_MARK,
  DOGPACK_MARK,
  MARKS,
  markBody,
  markSvg,
  type MarkData,
  type MarkName,
  type MarkNode,
} from "./marks-data.js";
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
export {
  appGraphics,
  brandGraphics,
  staticBrandGraphics,
  type BrandGraphic,
} from "./graphics.js";
export { PageCard, type PageCardProps } from "./templates/PageCard.js";
export { APPS, type AppKey, type AppBrand } from "./apps.js";
export { PAGE_CARDS, type PageCardCopy } from "./pages.js";

/**
 * Re-exported for convenience, and safe to take from here: these are types and
 * one pure function, so a consumer that only wants `EventDetail` pays nothing.
 * A consumer that must NOT pull in the fonts and artwork — anything a browser
 * bundles — should import `@devdogsuga/sdk/brand/event` directly.
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
