import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AppIcon, EmailSignature, FORMATS } from "@devdogsuga/brand";
import { render } from "@devdogsuga/brand/render";

/**
 * Renders the deployed images that no route draws.
 *
 * Most of the platform's pictures are served live (`opengraph-image.tsx`,
 * `icon.tsx`). These are different in that their URLs are promised to someone
 * outside the deploy:
 *
 * - The email signatures (`/brand/email/signature-<ground>[@2x|@3x].png`) are
 *   hotlinked by every mail client that ever received one, so the paths below
 *   must never change.
 * - `/brand/icons/platform-192.png` is named in `manifest.ts`, which a route
 *   cannot serve as a file Chrome will cache against the manifest's own URL.
 *
 * They are gitignored, derived from `@devdogsuga/brand`, and written into
 * `public/` by `codegen` so they ship in the bundle like any other static
 * file. Resvg is a devDependency of this app for that reason alone: nothing
 * that runs in the Worker imports it.
 *
 * Called as functions rather than JSX because tsx would read this app's
 * `jsx: preserve` and leave the elements unrendered.
 */
const publicBrand = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "brand",
);

function write(relative: string, png: Buffer): void {
  const target = join(publicBrand, relative);
  mkdirSync(dirname(target), { recursive: true });
  // Written beside and renamed over, so a build interrupted halfway never
  // leaves a truncated PNG where a mail client will fetch it.
  const partial = `${target}.partial`;
  writeFileSync(partial, png);
  renameSync(partial, target);
}

for (const ground of ["dark", "light"] as const) {
  for (const name of ["email-1x", "email-2x", "email-3x"]) {
    const format = FORMATS[name]!;
    const { png } = await render(
      EmailSignature({ width: format.width, ground }),
      format,
    );
    const density = format.scale > 1 ? `@${format.scale}x` : "";
    write(`email/signature-${ground}${density}.png`, png);
  }
}

const icon = FORMATS["icon-192"]!;
const { png } = await render(
  AppIcon({ app: "platform", size: icon.width }),
  icon,
);
write("icons/platform-192.png", png);
