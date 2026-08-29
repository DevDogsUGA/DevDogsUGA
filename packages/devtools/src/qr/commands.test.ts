import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jsQRModule from "jsqr";
import sharp from "sharp";

// jsqr ships CommonJS with `module.exports = jsQR`; under NodeNext its types
// describe the module object rather than the function that is actually there.
const jsQR = jsQRModule as unknown as typeof jsQRModule.default;
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearedModules } from "./logo.js";
import { generateQr, logoModules, parseQrArgs, REFERENCE } from "./commands.js";

const CWD = "/work";

describe("parseQrArgs", () => {
  it("takes the first bare word as the text and writes svg and png by default", () => {
    const opts = parseQrArgs(["https://devdogsuga.org/attendance"], CWD);
    expect(opts).not.toBeInstanceOf(Error);
    if (opts instanceof Error) return;
    expect(opts.text).toBe("https://devdogsuga.org/attendance");
    expect(opts.formats).toEqual(["svg", "png"]);
    expect(opts.stem).toBe("/work/qr");
    expect(opts.exactPath).toBeUndefined();
    expect(opts.size).toBe(999);
    expect(opts.color).toBe("#ffffff");
    expect(opts.errorLevel).toBe("H");
    expect(opts.logo).toMatch(/brand\/devdog\.svg$/);
  });

  it("reads the text after a value flag rather than the flag's value", () => {
    const opts = parseQrArgs(["--out", "poster.png", "https://x.test"], CWD);
    if (opts instanceof Error) throw opts;
    expect(opts.text).toBe("https://x.test");
    expect(opts.formats).toEqual(["png"]);
    expect(opts.exactPath).toBe("/work/poster.png");
  });

  it("uses --out's extension as the format when no --format is given", () => {
    const opts = parseQrArgs(["hi", "--out", "out/code.jpg"], CWD);
    if (opts instanceof Error) throw opts;
    expect(opts.formats).toEqual(["jpeg"]);
    expect(opts.exactPath).toBe("/work/out/code.jpg");
    expect(opts.stem).toBe("/work/out/code");
  });

  it("treats --out as a stem when --format lists several", () => {
    const opts = parseQrArgs(
      ["hi", "--out", "poster.png", "--format", "svg,webp,jpg,webp"],
      CWD,
    );
    if (opts instanceof Error) throw opts;
    expect(opts.formats).toEqual(["svg", "webp", "jpeg"]);
    expect(opts.exactPath).toBeUndefined();
    expect(opts.stem).toBe("/work/poster");
  });

  it("refuses formats and extensions it cannot write", () => {
    expect(parseQrArgs(["hi", "--format", "png,bmp"], CWD)).toBeInstanceOf(
      Error,
    );
    expect(parseQrArgs(["hi", "--out", "code.gif"], CWD)).toBeInstanceOf(Error);
    expect(parseQrArgs(["hi", "--ecl", "X"], CWD)).toBeInstanceOf(Error);
    expect(parseQrArgs(["hi", "--size", "big"], CWD)).toBeInstanceOf(Error);
    expect(parseQrArgs(["hi", "--version", "41"], CWD)).toBeInstanceOf(Error);
    expect(parseQrArgs([], CWD)).toBeInstanceOf(Error);
  });

  it("turns --logo none into no logo and resolves a path against cwd", () => {
    const none = parseQrArgs(["hi", "--logo", "none"], CWD);
    if (none instanceof Error) throw none;
    expect(none.logo).toBeNull();
    const own = parseQrArgs(["hi", "--logo", "art/mark.png"], CWD);
    if (own instanceof Error) throw own;
    expect(own.logo).toBe("/work/art/mark.png");
  });
});

describe("logoModules", () => {
  it("is 9 for the reference's 33-module grid", () => {
    expect(logoModules(33, REFERENCE.logoFraction)).toBe(9);
  });

  it("keeps the box's parity equal to the grid's so it centres on whole modules", () => {
    expect(logoModules(37, REFERENCE.logoFraction)).toBe(11);
    expect(logoModules(21, 0.3)).toBe(7);
  });
});

describe("clearedModules", () => {
  it("clears exactly the reference's 9×9 box", () => {
    const cleared = clearedModules({ modules: 9, padding: 0, gridSize: 33 });
    expect(cleared.size).toBe(81);
    for (const y of [12, 16, 20]) {
      expect(cleared.has(y * 33 + 12)).toBe(true);
      expect(cleared.has(y * 33 + 20)).toBe(true);
      expect(cleared.has(y * 33 + 11)).toBe(false);
      expect(cleared.has(y * 33 + 21)).toBe(false);
    }
  });

  it("grows the box by the padding", () => {
    const cleared = clearedModules({ modules: 9, padding: 1, gridSize: 33 });
    expect(cleared.size).toBe(121);
    expect(cleared.has(11 * 33 + 11)).toBe(true);
  });
});

describe("generateQr", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "devtools-qr-"));
    // A stand-in logo, so the test does not depend on the brand kit being
    // checked out: a solid disc.
    await sharp({
      create: { width: 200, height: 200, channels: 4, background: "#ba0c2f" },
    })
      .png()
      .toFile(join(dir, "logo.png"));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  async function decode(path: string): Promise<string | null> {
    const { data, info } = await sharp(path)
      .flatten({ background: "#000000" })
      .negate({ alpha: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const result = jsQR(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
      info.width,
      info.height,
    );
    return result?.data ?? null;
  }

  it("writes every format and each one scans back to the text", async () => {
    const text = "https://devdogsuga.org/attendance";
    const opts = parseQrArgs(
      [
        text,
        "--out",
        join(dir, "code"),
        "--format",
        "svg,png,jpg,webp,avif,tiff",
        "--logo",
        join(dir, "logo.png"),
      ],
      dir,
    );
    if (opts instanceof Error) throw opts;

    const written = await generateQr(opts);
    expect(written.map((w) => w.path.slice(dir.length + 1))).toEqual([
      "code.svg",
      "code.png",
      "code.jpg",
      "code.webp",
      "code.avif",
      "code.tiff",
    ]);

    const svg = await readFile(join(dir, "code.svg"), "utf8");
    expect(svg).toContain('<image href="data:image/png;base64,');
    const png = await sharp(join(dir, "code.png")).metadata();
    expect([png.width, png.height, png.hasAlpha]).toEqual([999, 999, true]);
    const jpg = await sharp(join(dir, "code.jpg")).metadata();
    expect(jpg.hasAlpha).toBe(false);

    for (const file of written) {
      expect(await decode(file.path), file.path).toBe(text);
    }
  }, 60_000);

  it("writes to the exact path --out names", async () => {
    const opts = parseQrArgs(
      [
        "hello",
        "--out",
        join(dir, "one.webp"),
        "--logo",
        "none",
        "--size",
        "300",
      ],
      dir,
    );
    if (opts instanceof Error) throw opts;
    const written = await generateQr(opts);
    expect(written).toHaveLength(1);
    expect(written[0]!.path).toBe(join(dir, "one.webp"));
    const meta = await sharp(written[0]!.path).metadata();
    expect([meta.format, meta.width]).toEqual(["webp", 300]);
  }, 30_000);
});
