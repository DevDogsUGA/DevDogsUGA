/**
 * The two brand marks the newsletter draws: the DevDogs mascot+wordmark
 * lockup (embedded here — og carries the wordmark and mascot separately, and
 * the masthead wants the composed artwork) and the GDG-on-Campus · UGA
 * cobrand, taken from og so the two stay one file.
 *
 * Display sizes are derived from each artwork's own units against a shared
 * 33px masthead height, so a re-exported SVG with a new viewBox cannot
 * silently stretch.
 */
import { GDGC_UGA, type Asset } from "@devdogsuga/og";
import { DEVDOGS_LOCKUP_ON_DARK } from "./generated/lockup.js";
import { socialIconDataUri, type SocialIconName } from "./icons.js";
import type { FontStacks } from "./theme.js";

export { GDGC_UGA };
export const DEVDOGS_LOCKUP: Asset = DEVDOGS_LOCKUP_ON_DARK;

/** The masthead/footer line height every mark is scaled to. */
const MARK_HEIGHT = 33;

function displayWidth(asset: Asset): number {
  return Math.round((MARK_HEIGHT * asset.width) / asset.height);
}

/** On-screen `<img>` dimensions, shared by the page, the email and the PNG rasteriser (which renders at 2x these). */
export const MARK_SIZES = {
  devdogsLockup: {
    width: displayWidth(DEVDOGS_LOCKUP),
    height: MARK_HEIGHT,
  },
  gdgcLockup: {
    width: displayWidth(GDGC_UGA),
    height: MARK_HEIGHT,
  },
  socialIcon: { width: 17, height: 17 },
} as const;

/** Where the components find their three `<img>` sources. */
export interface NewsletterAssets {
  /** `<img>` src for the DevDogs mascot+wordmark lockup (dark ground). */
  devdogsLockup: string;
  /** `<img>` src for the GDG On Campus · UGA cobrand lockup (dark ground). */
  gdgcLockup: string;
  /** `<img>` src for a footer social icon. */
  socialIcon: (name: SocialIconName) => string;
}

/**
 * Everything a render target decides: the page passes `next/font` CSS
 * variables and SVG sources, the exporter passes literal font stacks and
 * `cid:` references to embedded PNGs.
 */
export interface RenderContext {
  fonts: FontStacks;
  assets: NewsletterAssets;
}

/**
 * The marks as self-contained data URIs — right for anything with a real
 * browser behind it (the platform pages, an .html preview on disk), and
 * exactly wrong for a send: Gmail and Outlook strip SVG in any form.
 */
export const DATA_URI_ASSETS: NewsletterAssets = {
  devdogsLockup: DEVDOGS_LOCKUP.src,
  gdgcLockup: GDGC_UGA.src,
  socialIcon: socialIconDataUri,
};
