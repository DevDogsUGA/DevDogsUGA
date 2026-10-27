import type { ReactElement } from "react";
import { APPS } from "./apps.js";
import type { Format } from "./formats.js";
import { Banner } from "./templates/Banner.js";
import { EmailSignature } from "./templates/EmailSignature.js";
import { AppIcon } from "./templates/AppIcon.js";
import { PageCard } from "./templates/PageCard.js";

/**
 * The club's reusable brand graphics: the lockup and each app, with the
 * formats each is drawn at.
 *
 * They are defined here, and not in the CLI's registry, because two callers
 * list them: `backstage graphics` writes them to disk, and the console's
 * Graphics page previews and serves them. The matrix of (graphic, format) is
 * sparse and has to be the same in both.
 */

export interface BrandGraphic {
  /** `group/name`, which is what the CLI matches and globs against. */
  name: string;
  group: "brand" | "app";
  /** The leaf. Unique across every graphic. */
  stem: string;
  /** Format names this can be rendered at. */
  formats: string[];
  /** One line: what this picture is. */
  why: string;
  render: (format: Format) => ReactElement;
}

/** The two renditions anything may need, because anything may reach the GDG platform. */
const GDG = ["gdgc-wide", "gdgc-square"];
const EMAIL = ["email-1x", "email-2x", "email-3x"];
const ICON_SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 384, 512, 1024];

/**
 * The club lockup, on each of the two grounds it is ever set on.
 *
 * One subject, two grounds, and the rendition decides which template draws it:
 * the email densities want the signature's tight horizontal strip, everything
 * else wants the banner.
 */
export function brandGraphics(): BrandGraphic[] {
  return (["dark", "light"] as const).map((ground) => ({
    name: ground === "dark" ? "brand/club" : "brand/club-light",
    group: "brand",
    stem: ground === "dark" ? "club" : "club-light",
    formats: [
      "og",
      ...GDG,
      ...(ground === "dark" ? ["savvycal"] : []),
      ...EMAIL,
    ],
    why: `The DevDogs lockup with the GDG chapter cobrand, on a ${ground} ground.`,
    render: (format) =>
      format.family === "email"
        ? EmailSignature({ width: format.width, ground })
        : Banner({ width: format.width, height: format.height, ground }),
  }));
}

/** Each app's mark as an icon, and its card as a link. */
export function appGraphics(): BrandGraphic[] {
  return (Object.keys(APPS) as (keyof typeof APPS)[]).map((app) => {
    const brand = APPS[app];

    return {
      name: `app/${app}`,
      group: "app",
      stem: app,
      formats: [
        ...ICON_SIZES.map((size) => `icon-${size}`),
        // Next's file-convention icons, for an app that ships them.
        "icon-favicon",
        "icon-apple",
        "og",
        ...GDG,
      ],
      why: `${brand.name}: its mark as an icon, and its card as a link.`,
      render: (format) =>
        format.family === "icon"
          ? AppIcon({ app, size: format.width })
          : PageCard({
              width: format.width,
              height: format.height,
              title: brand.name,
              description: brand.blurb,
              eyebrow: brand.tagline,
              accent: brand.ground,
              footer: brand.host,
              cobrand: true,
            }),
    };
  });
}

/** Everything that does not depend on the schedule. */
export function staticBrandGraphics(): BrandGraphic[] {
  return [...brandGraphics(), ...appGraphics()];
}
