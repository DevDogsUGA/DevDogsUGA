/// <reference lib="dom" />

/**
 * `devtools gen hypno`
 *
 * Bakes the hero's spiral into a pre-blurred raster at
 * `apps/platform/src/assets/hypno.webp`.
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
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { PROJECT_ROOT } from "../environment.js";

const SRC = join(
  PROJECT_ROOT,
  "apps",
  "platform",
  "src",
  "components",
  "HeroSection",
  "Hypno.tsx",
);
const OUT = join(
  PROJECT_ROOT,
  "apps",
  "platform",
  "src",
  "assets",
  "hypno.webp",
);

const RENDER_PX = 3536;
const VIEWBOX = 1926.25;
const BLUR_CSS_PX = 8;
const SS = 3;
const STROKE = "rgba(216,180,254,0.75)";
const BUDGET = 60_000;

async function loadChromium() {
  const require_ = createRequire(import.meta.url);
  for (const spec of [
    "playwright",
    "playwright-core",
    join(
      PROJECT_ROOT,
      "node_modules/.pnpm/playwright@1.62.1/node_modules/playwright",
    ),
  ]) {
    try {
      const mod = await import(require_.resolve(spec));
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return chromium;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    "playwright not resolvable. Run `pnpm dlx playwright@1.62 install chromium` " +
      "or run this command from a workspace where playwright is installed.",
  );
}

export async function runGenHypno(): Promise<number> {
  const src = readFileSync(SRC, "utf8");
  const paths = [...src.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  if (paths.length !== 24) {
    process.stderr.write(
      `expected 24 paths in Hypno.tsx, found ${paths.length}\n`,
    );
    return 1;
  }

  const strokeW = (2 * VIEWBOX) / RENDER_PX;

  const svg = (
    px: number,
  ) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"
 viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">
<g fill="none" stroke="${STROKE}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round">
${paths.map((d) => `<path d="${d}"/>`).join("\n")}
</g></svg>`;

  const chromium = await loadChromium();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("data:text/html,<html><body></body></html>");

  const bake = async (target: number, quality: number) =>
    page.evaluate(
      async ({
        markup,
        target,
        ss,
        blur,
        quality,
      }: {
        markup: string;
        target: number;
        ss: number;
        blur: number;
        quality: number;
      }) => {
        const big = target * ss;
        const img = new Image();
        img.src =
          "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
        await new Promise((r) => {
          img.onload = r;
          img.onerror = r;
        });
        const hi = document.createElement("canvas");
        hi.width = hi.height = big;
        const hx = hi.getContext("2d")!;
        hx.filter = `blur(${blur * ss}px)`;
        hx.drawImage(img, 0, 0, big, big);
        const lo = document.createElement("canvas");
        lo.width = lo.height = target;
        const lx = lo.getContext("2d")!;
        lx.imageSmoothingEnabled = true;
        lx.imageSmoothingQuality = "high";
        lx.drawImage(hi, 0, 0, target, target);
        return lo.toDataURL("image/webp", quality);
      },
      {
        markup: svg(target * SS),
        target,
        ss: SS,
        blur: (BLUR_CSS_PX * target) / RENDER_PX,
        quality,
      },
    );

  const bytes = (dataUrl: string) =>
    Buffer.from(dataUrl.split(",")[1]!, "base64").byteLength;

  console.log("size  quality   bytes");
  const results: { target: number; q: number; b: number; url: string }[] = [];
  for (const target of [512, 768, 1024]) {
    for (const q of [0.5, 0.65, 0.8]) {
      const url = await bake(target, q);
      const b = bytes(url);
      results.push({ target, q, b, url });
      console.log(
        `${String(target).padStart(4)}  ${q.toFixed(2)}   ${String(b).padStart(7)}`,
      );
    }
  }

  const pick =
    results
      .filter((r) => r.b <= BUDGET)
      .sort((a, b) => b.target - a.target || b.q - a.q)[0] ??
    results.sort((a, b) => a.b - b.b)[0]!;

  writeFileSync(OUT, Buffer.from(pick.url.split(",")[1]!, "base64"));
  console.log(
    `\nwrote ${OUT}\n  ${pick.target}px @ q=${pick.q} -> ${pick.b} bytes (budget ${BUDGET})`,
  );

  await browser.close();
  return 0;
}
