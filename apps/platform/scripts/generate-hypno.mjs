/**
 * Bakes the hero's spiral into a pre-blurred raster.
 *
 * Why this exists: the spiral used to be an inline 24-path SVG, ~3,530 CSS px
 * square, rotating forever under a `blur-sm` filter. Measured on a production
 * build, that single element held the page to 36.8 FPS at idle; hiding it
 * restored 60.4. The cost is the live filter, not the geometry — shrinking the
 * surface 6x bought 3 FPS, removing the blur at full size bought 25. Rotating a
 * texture that already has the blur painted into it is free by comparison, and
 * it keeps both the motion and the exact hazy look.
 *
 * Two details make the bake match the original:
 *
 * 1. The source sets `vector-effect: non-scaling-stroke`, so its 2px stroke is
 *    2 *device* px no matter how far the SVG is scaled up. A raster does not
 *    work that way — its stroke scales with the image. So the stroke is
 *    converted into viewBox units for the size the element actually renders at
 *    (2 * 1926.25 / RENDER_PX), which reproduces the same apparent weight.
 * 2. At the raster sizes worth shipping, both the stroke and the blur land
 *    below one pixel, and Skia's box-approximated blur is inaccurate at
 *    sub-pixel sigma. Everything is therefore drawn at SS x the target and
 *    downsampled, which resolves both correctly.
 *
 * Run: node scripts/generate-hypno.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

// Playwright is not a dependency of this app — it arrives transitively, and this
// script is a one-off that regenerates a committed asset. Resolve it from the
// workspace root if the bare specifier is not reachable, and say so plainly if
// it is missing rather than failing with a stack trace.
const require_ = createRequire(import.meta.url);
async function loadChromium() {
  for (const spec of [
    "playwright",
    "playwright-core",
    "/home/sloan/code/DevDogsUGA/DevDogsUGA/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright",
  ]) {
    try {
      // CJS interop: named exports may sit on the namespace or under `default`.
      const mod = await import(require_.resolve(spec));
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return chromium;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    "playwright not resolvable. Run `pnpm dlx playwright@1.62 install chromium` " +
      "or run this script from a workspace where playwright is installed.",
  );
}
const chromium = await loadChromium();

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../src/components/HeroSection/Hypno.tsx");
const OUT = join(HERE, "../src/assets/hypno.webp");

/** Width the element resolves to on a 1440x900 viewport, measured in-page. */
const RENDER_PX = 3536;
/** viewBox of the source SVG. */
const VIEWBOX = 1926.25;
/** `blur-sm` is blur(8px), applied at RENDER_PX. */
const BLUR_CSS_PX = 8;
/** Supersample factor — drawn at TARGET * SS, then downsampled. */
const SS = 3;

// Tailwind purple-300 (#d8b4fe) at /75, which is what `*:stroke-purple-300/75`
// resolves to. Read from the class rather than guessed.
const STROKE = "rgba(216,180,254,0.75)";

const src = readFileSync(SRC, "utf8");
const paths = [...src.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
if (paths.length !== 24) {
  throw new Error(`expected 24 paths in Hypno.tsx, found ${paths.length}`);
}

/** Stroke in viewBox units that reads as 2 device px at RENDER_PX. */
const strokeW = (2 * VIEWBOX) / RENDER_PX;

const svg = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"
 viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">
<g fill="none" stroke="${STROKE}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round">
${paths.map((d) => `<path d="${d}"/>`).join("\n")}
</g></svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("data:text/html,<html><body></body></html>");

/** Draws at target*SS with a proportionally scaled blur, then downsamples. */
async function bake(target, quality) {
  return page.evaluate(
    async ({ markup, target, ss, blur, quality }) => {
      const big = target * ss;
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
      await new Promise((r) => {
        img.onload = r;
        img.onerror = r;
      });

      const hi = document.createElement("canvas");
      hi.width = hi.height = big;
      const hx = hi.getContext("2d");
      hx.filter = `blur(${blur * ss}px)`;
      hx.drawImage(img, 0, 0, big, big);

      const lo = document.createElement("canvas");
      lo.width = lo.height = target;
      const lx = lo.getContext("2d");
      lx.imageSmoothingEnabled = true;
      lx.imageSmoothingQuality = "high";
      lx.drawImage(hi, 0, 0, target, target);

      const url = lo.toDataURL("image/webp", quality);
      return url;
    },
    {
      markup: svg(target * SS),
      target,
      ss: SS,
      blur: (BLUR_CSS_PX * target) / RENDER_PX,
      quality,
    },
  );
}

const bytes = (dataUrl) =>
  Buffer.from(dataUrl.split(",")[1], "base64").byteLength;

// Sweep: the image is blurred, so resolution and quality are both cheap to give
// up. Pick the smallest that still carries the spiral's structure.
console.log("size  quality   bytes");
const results = [];
for (const target of [512, 768, 1024]) {
  for (const q of [0.5, 0.65, 0.8]) {
    const url = await bake(target, q);
    const b = bytes(url);
    results.push({ target, q, b, url });
    console.log(`${String(target).padStart(4)}  ${q.toFixed(2)}   ${String(b).padStart(7)}`);
  }
}

// Largest option that still fits the budget — resolution matters more than
// quality for a blurred gradient-like image, so prefer size over q.
const BUDGET = 60_000;
const pick =
  results
    .filter((r) => r.b <= BUDGET)
    .sort((a, b) => b.target - a.target || b.q - a.q)[0] ??
  results.sort((a, b) => a.b - b.b)[0];

writeFileSync(OUT, Buffer.from(pick.url.split(",")[1], "base64"));
console.log(
  `\nwrote ${OUT}\n  ${pick.target}px @ q=${pick.q} -> ${pick.b} bytes (budget ${BUDGET})`,
);

await browser.close();
