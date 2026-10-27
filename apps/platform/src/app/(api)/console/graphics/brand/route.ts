import { canUserUseGraphics } from "~/server/graphics/access";
import {
  brandGraphics,
  formatOf,
  renderBrandGraphic,
  renderableOnWorker,
} from "~/server/graphics/render";
import { badRequest, pngResponse } from "~/server/graphics/respond";
import { requirePermission } from "~/server/auth/require";

/**
 * One reusable brand asset (a club lockup, an app icon or card) as a PNG:
 * `?graphic=app/dogdays&format=icon-512`, with `&download=1` to save it.
 *
 * Both values come from the SDK's own lists, which are also what
 * `backstage graphics` renders from, so the two always offer the same assets.
 */
export async function GET(request: Request) {
  await requirePermission(canUserUseGraphics);
  const query = new URL(request.url).searchParams;

  const graphic = brandGraphics().find(
    (candidate) => candidate.name === query.get("graphic"),
  );
  if (!graphic) return badRequest("Unknown graphic.");

  const format = formatOf(query.get("format") ?? "");
  if (
    !format ||
    !graphic.formats.includes(format.name) ||
    !renderableOnWorker(format)
  ) {
    return badRequest("Unknown size.");
  }

  return pngResponse(
    await renderBrandGraphic(graphic, format),
    `${graphic.stem}-${format.name}.png`,
    query.get("download") === "1",
  );
}
