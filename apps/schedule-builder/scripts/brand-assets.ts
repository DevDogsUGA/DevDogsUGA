import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GDGC_UGA_LIGHT } from "@devdogsuga/brand";

/**
 * Writes the logos the home page links to (`/brand/*.svg`) into `public/`.
 *
 * They used to be committed copies of artwork that also lives in
 * `@devdogsuga/brand`, which is how the two drifted. Now `codegen` copies them
 * from the package, so a re-exported logo reaches this app on the next
 * install and there is one place to change it. The directory is gitignored.
 *
 * The light chapter lockup has no file in the package, only the embedded copy
 * the templates use (`GDGC_UGA_LIGHT`, a base64 SVG data URI), so that one is
 * decoded instead of copied.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "brand");
const artwork = join(
  dirname(
    createRequire(import.meta.url).resolve("@devdogsuga/brand/package.json"),
  ),
  "artwork",
);

mkdirSync(out, { recursive: true });

for (const file of [
  "devdogs-logo.svg",
  "devdogs-logo-dark.svg",
  "gdgc-uga-lockup-dark.svg",
]) {
  copyFileSync(join(artwork, file), join(out, file));
}

const prefix = "data:image/svg+xml;base64,";
if (!GDGC_UGA_LIGHT.src.startsWith(prefix)) {
  throw new Error("GDGC_UGA_LIGHT is no longer a base64 SVG data URI.");
}
writeFileSync(
  join(out, "gdgc-uga-lockup.svg"),
  Buffer.from(GDGC_UGA_LIGHT.src.slice(prefix.length), "base64"),
);
