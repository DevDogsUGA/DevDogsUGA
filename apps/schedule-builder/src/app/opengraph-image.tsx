import { APPS, OG_SIZE, PageCard } from "@devdogsuga/open-graph";
import { imageResponse } from "~/lib/ogImage";

/**
 * The card a DogDays link unfurls as.
 *
 * The copy is `APPS.dogdays` rather than a second set of strings here, so this
 * and `pnpm devtools images app/dogdays --format og` render the same card. The
 * platform serves its own cards per request and has a file per route; this app
 * has one card for the whole site, which is why it sits at the root and nothing
 * below it overrides.
 */
export const alt = `${APPS.dogdays.name} — ${APPS.dogdays.tagline}`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return imageResponse(
    PageCard({
      ...size,
      title: APPS.dogdays.name,
      description: APPS.dogdays.blurb,
      eyebrow: APPS.dogdays.tagline,
      accent: APPS.dogdays.ground,
      footer: APPS.dogdays.host,
      cobrand: true,
    }),
    size,
  );
}
