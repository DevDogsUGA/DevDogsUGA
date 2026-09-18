/**
 * The Node-side export surface: render an issue to a complete HTML document,
 * describe the images that need rasterising, and assemble the .eml.
 *
 * Deliberately a separate entry point (`@devdogsuga/newsletter/export`): this
 * file imports `react-dom/server` and uses `Buffer`, and neither belongs in
 * anything a browser or a Worker bundles. The devtools CLI is the intended
 * caller — it owns resvg, so rasterising the `EmailImage` manifest to PNG
 * happens there and the results come back through `buildEml`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import {
  DATA_URI_ASSETS,
  DEVDOGS_LOCKUP,
  GDGC_UGA,
  MARK_SIZES,
  type RenderContext,
} from "../assets.js";
import { ChangelogDocument } from "../components.js";
import {
  SOCIAL_ICON_NAMES,
  socialIconSvg,
  type SocialIconName,
} from "../icons.js";
import type { ChangelogIssue } from "../issues.js";
import { EMAIL_FONTS } from "../theme.js";

export { buildEml, type EmlImage, type EmlInput } from "./eml.js";

/** The right-hand side of every Content-ID; any stable, unique-ish token works. */
const CID_DOMAIN = "changelog.devdogsuga.org";

/**
 * One image the email needs: its SVG source, the width to rasterise at (2x
 * the on-screen size the components declare), and the identity it carries
 * into the MIME parts.
 */
export interface EmailImage {
  cid: string;
  filename: string;
  svg: string;
  rasterWidth: number;
}

function cidFor(key: string): string {
  return `${key}@${CID_DOMAIN}`;
}

/** Unpack an SVG `<img>` source back into markup a rasteriser can eat. */
function svgFromDataUri(src: string): string {
  const comma = src.indexOf(",");
  const meta = src.slice(0, comma);
  const payload = src.slice(comma + 1);
  return meta.includes(";base64")
    ? Buffer.from(payload, "base64").toString("utf8")
    : decodeURIComponent(payload);
}

/** Every image an exported issue references, exactly once each. */
export function emailImages(): EmailImage[] {
  return [
    {
      cid: cidFor("devdogs-lockup"),
      filename: "devdogs-lockup@2x.png",
      svg: svgFromDataUri(DEVDOGS_LOCKUP.src),
      rasterWidth: MARK_SIZES.devdogsLockup.width * 2,
    },
    {
      cid: cidFor("gdgc-lockup"),
      filename: "gdgc-lockup@2x.png",
      svg: svgFromDataUri(GDGC_UGA.src),
      rasterWidth: MARK_SIZES.gdgcLockup.width * 2,
    },
    ...SOCIAL_ICON_NAMES.map((name) => ({
      cid: cidFor(`icon-${name}`),
      filename: `icon-${name}@2x.png`,
      svg: socialIconSvg(name),
      rasterWidth: MARK_SIZES.socialIcon.width * 2,
    })),
  ];
}

/**
 * The context a send renders with: literal font stacks and `cid:` references
 * matching the `emailImages()` manifest.
 */
export function emailRenderContext(): RenderContext {
  const socialIcon = (name: SocialIconName) => `cid:${cidFor(`icon-${name}`)}`;
  return {
    fonts: EMAIL_FONTS,
    assets: {
      devdogsLockup: `cid:${cidFor("devdogs-lockup")}`,
      gdgcLockup: `cid:${cidFor("gdgc-lockup")}`,
      socialIcon,
    },
  };
}

/**
 * The context an on-disk .html preview renders with: the same literal font
 * stacks a mail client would fall down, but self-contained data-URI images so
 * the file opens anywhere with nothing to attach.
 */
export function previewRenderContext(): RenderContext {
  return { fonts: EMAIL_FONTS, assets: DATA_URI_ASSETS };
}

/** An issue as one self-describing HTML document string. */
export function renderIssueDocument(
  issue: ChangelogIssue,
  ctx: RenderContext = emailRenderContext(),
): string {
  return (
    "<!doctype html>" +
    renderToStaticMarkup(<ChangelogDocument issue={issue} ctx={ctx} />)
  );
}
