/**
 * The browser-safe surface: components, content and tokens, with nothing that
 * assumes Node. The platform's /changelog pages import from here.
 *
 * The export-side surface (react-dom/server, MIME assembly, the cid: image
 * manifest) lives behind `@devdogsuga/newsletter/export` so bundling a page
 * never drags a server renderer along.
 */
export { ChangelogDocument, ChangelogEmail } from "./components.js";
export { paintCss } from "./darkmode.js";
export {
  DATA_URI_ASSETS,
  DEVDOGS_LOCKUP,
  GDGC_UGA,
  MARK_SIZES,
  type NewsletterAssets,
  type RenderContext,
} from "./assets.js";
export {
  type ChangelogEvent,
  type ChangelogIssue,
  ISSUES,
  issueByVersion,
} from "./issues.js";
export {
  SOCIAL_ICON_NAMES,
  socialIconDataUri,
  socialIconSvg,
  type SocialIconName,
} from "./icons.js";
export {
  CSS_VARIABLE_FONTS,
  EMAIL_FONTS,
  FONTS_HREF,
  type FontStacks,
  KIND,
  PALETTE,
  SITE,
  SOCIAL_LINKS,
  UGA,
} from "./theme.js";

import { DATA_URI_ASSETS, type RenderContext } from "./assets.js";
import { CSS_VARIABLE_FONTS } from "./theme.js";

/**
 * The context a platform page renders with: the `next/font` CSS variables the
 * root layout sets (next/font renames every family it self-hosts, so literal
 * names would never match) and SVG data-URI image sources.
 */
export function webRenderContext(): RenderContext {
  return { fonts: CSS_VARIABLE_FONTS, assets: DATA_URI_ASSETS };
}
