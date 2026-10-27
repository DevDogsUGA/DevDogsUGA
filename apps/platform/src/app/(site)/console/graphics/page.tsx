import type { Metadata } from "next";
import ConsoleShell from "~/components/Console/ConsoleShell";
import GraphicTile from "~/components/Graphics/GraphicTile";
import { canUserUseGraphics } from "~/server/graphics/access";
import {
  brandGraphics,
  formatOf,
  outputSize,
  renderableOnWorker,
} from "~/server/graphics/render";
import { requirePermission } from "~/server/auth/require";
import { PageHeading } from "~/ui/app-shell";
import { buttonVariants } from "~/ui/button";
import { Card } from "~/ui/card";

export const metadata: Metadata = {
  title: "Graphics | Console | DevDogs",
  robots: { index: false },
};

const PATH = "/console/graphics";

/** What each asset previews as: an icon where it has one, and its link card. */
const PREVIEW_FORMATS = ["icon-512", "og"];

/**
 * The club's reusable brand assets: the lockup and each app's icon and card.
 * Meeting graphics live on each meeting's page; these do not depend on the
 * schedule.
 *
 * Open to any officer (`canUserUseGraphics`). Sizes under 64px (the small
 * favicons, which need one large layout scaled down to stay crisp) are only in
 * `backstage graphics`.
 */
export default async function BrandGraphicsPage() {
  await requirePermission(canUserUseGraphics);
  const graphics = brandGraphics();
  const skipped = graphics.some((graphic) =>
    graphic.formats.some((name) => !renderableOnWorker(formatOf(name)!)),
  );

  return (
    <ConsoleShell current={PATH}>
      <PageHeading
        title="Graphics"
        description="Club logos, banners and app icons, ready to download. Meeting graphics are on each meeting's page."
      />

      {graphics.map((graphic) => {
        const formats = graphic.formats
          .map((name) => formatOf(name)!)
          .filter(renderableOnWorker);
        const previews = PREVIEW_FORMATS.map((name) =>
          formats.find((format) => format.name === name),
        ).filter((format) => format !== undefined);
        const shown = previews.length > 0 ? previews : formats.slice(0, 1);

        return (
          <Card
            as="section"
            key={graphic.name}
            aria-labelledby={`brand-${graphic.stem}`}
            style={{ marginBottom: 24 }}
          >
            <h2 id={`brand-${graphic.stem}`} className="card-title">
              {graphic.name}
            </h2>
            <p className="small muted">{graphic.why}</p>

            <div className="gfx-asset-previews">
              {shown.map((format) => {
                const { width, height } = outputSize(format);
                const small = Math.min(width, 320);

                return (
                  <div key={format.name} style={{ width: small }}>
                    <GraphicTile
                      src={`/console/graphics/brand?graphic=${encodeURIComponent(graphic.name)}&format=${format.name}`}
                      alt={`${graphic.name}, ${format.name}`}
                      name={format.name}
                      width={width}
                      height={height}
                      filename={`${graphic.stem}-${format.name}.png`}
                    />
                  </div>
                );
              })}
            </div>

            <h3 className="eyebrow">Every size</h3>
            <div className="gfx-sizes">
              {formats.map((format) => {
                const { width, height } = outputSize(format);

                return (
                  <a
                    key={format.name}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                    href={`/console/graphics/brand?graphic=${encodeURIComponent(graphic.name)}&format=${format.name}&download=1`}
                    download={`${graphic.stem}-${format.name}.png`}
                    title={format.why}
                  >
                    {format.name}
                    <span className="gfx-dims">
                      {width}×{height}
                    </span>
                  </a>
                );
              })}
            </div>
          </Card>
        );
      })}

      {skipped ? (
        <p className="small muted">
          The 16, 32 and 48px favicon sizes are not offered here. Run{" "}
          <code>pnpm backstage graphics</code> for those.
        </p>
      ) : null}
    </ConsoleShell>
  );
}
