/**
 * `devtools qr <text>` — a QR code in the DevDogs style.
 *
 * The style is the one `apps/platform/public/attendance/qr.svg` was made in,
 * by hand, in a web generator. Making the next one the same way means
 * re-finding the settings; this makes the settings the defaults, so
 *
 *     pnpm devtools qr https://devdogsuga.org/attendance
 *
 * writes `qr.svg` and `qr.png` that match it. Every flag is a departure from
 * the reference, and the help text says what the reference value is.
 *
 * Output is one render written in as many formats as asked for: `--out`
 * names the file (its extension picks the format) or the stem when
 * `--format` lists several.
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { log, text as askText } from "@clack/prompts";
import { positionals } from "../args.js";
import { explain, unwrap } from "../ui.js";
import { DEFAULT_LOGO, loadLogo } from "./logo.js";
import { encode, isErrorLevel, type ErrorLevel } from "./matrix.js";
import {
  contrastingBackground,
  extensionOf,
  needsBackground,
  parseFormat,
  rasterize,
  type Format,
} from "./raster.js";
import { renderSvg } from "./style.js";

/** The reference's settings, each one a default here. */
export const REFERENCE = {
  size: 999,
  margin: 2,
  color: "#ffffff",
  errorLevel: "H" as ErrorLevel,
  /** 9 of 33 modules. */
  logoFraction: 9 / 33,
  logoPadding: 0,
  formats: ["svg", "png"] as const satisfies readonly Format[],
  stem: "qr",
};

export interface QrOptions {
  text: string;
  formats: readonly Format[];
  /** Absolute path without extension. */
  stem: string;
  /** Set when `--out` named one file with its own extension. */
  exactPath?: string;
  size: number;
  margin: number;
  color: string;
  background?: string;
  /** `null` means no logo. */
  logo: string | null;
  logoFraction: number;
  logoPadding: number;
  errorLevel: ErrorLevel;
  version?: number;
}

/** The value after a flag, or `undefined` when absent or valueless. */
function flagValue(rest: readonly string[], flag: string): string | undefined {
  const index = rest.indexOf(flag);
  if (index === -1) return undefined;
  const value = rest[index + 1];
  return value !== undefined && !value.startsWith("--") ? value : undefined;
}

function numberFlag(
  rest: readonly string[],
  flag: string,
  fallback: number,
  check: (n: number) => boolean,
): number | Error {
  const raw = flagValue(rest, flag);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && check(n)
    ? n
    : new Error(`${flag} ${raw} is not a value it accepts.`);
}

/**
 * Turns the argv into options, or an explanation of what it could not read.
 *
 * Pure so the shapes are testable: the only thing it cannot decide alone is
 * whether `--out` names a directory, which `runQr` checks on disk.
 */
export function parseQrArgs(
  rest: readonly string[],
  cwd: string,
): QrOptions | Error {
  const text = flagValue(rest, "--text") ?? positionals(rest)[0];
  if (!text) return new Error("Nothing to encode.");

  const formatList = flagValue(rest, "--format");
  const out = flagValue(rest, "--out");
  const outExt = out ? extname(out) : "";
  const outFormat = outExt ? parseFormat(outExt) : null;

  let formats: Format[];
  if (formatList) {
    formats = [];
    for (const item of formatList.split(",")) {
      const format = parseFormat(item.trim());
      if (!format)
        return new Error(
          `--format: "${item.trim()}" is not one of svg, png, jpg, webp, avif, tiff.`,
        );
      if (!formats.includes(format)) formats.push(format);
    }
  } else if (outExt) {
    if (!outFormat)
      return new Error(`--out: "${outExt}" is not an extension this writes.`);
    formats = [outFormat];
  } else {
    formats = [...REFERENCE.formats];
  }

  let stem: string;
  let exactPath: string | undefined;
  if (out && outExt && !formatList) {
    exactPath = resolve(cwd, out);
    stem = exactPath.slice(0, -outExt.length);
  } else if (out && outExt) {
    stem = resolve(cwd, out).slice(0, -outExt.length);
  } else {
    stem = resolve(cwd, out ?? REFERENCE.stem);
  }

  const size = numberFlag(
    rest,
    "--size",
    REFERENCE.size,
    (n) => n >= 21 && Number.isInteger(n),
  );
  if (size instanceof Error) return size;
  const margin = numberFlag(rest, "--margin", REFERENCE.margin, (n) => n >= 0);
  if (margin instanceof Error) return margin;
  const logoFraction = numberFlag(
    rest,
    "--logo-size",
    REFERENCE.logoFraction,
    (n) => n > 0 && n < 1,
  );
  if (logoFraction instanceof Error) return logoFraction;
  const logoPadding = numberFlag(
    rest,
    "--logo-padding",
    REFERENCE.logoPadding,
    (n) => n >= 0,
  );
  if (logoPadding instanceof Error) return logoPadding;
  const version = numberFlag(
    rest,
    "--version",
    0,
    (n) => Number.isInteger(n) && n >= 1 && n <= 40,
  );
  if (version instanceof Error) return version;

  const errorLevel = (
    flagValue(rest, "--ecl") ?? REFERENCE.errorLevel
  ).toUpperCase();
  if (!isErrorLevel(errorLevel))
    return new Error(`--ecl ${errorLevel} is not L, M, Q or H.`);

  const logoFlag = flagValue(rest, "--logo");
  const logo =
    logoFlag === undefined
      ? DEFAULT_LOGO
      : logoFlag === "none"
        ? null
        : resolve(cwd, logoFlag);

  return {
    text,
    formats,
    stem,
    exactPath,
    size,
    margin,
    color: flagValue(rest, "--color") ?? REFERENCE.color,
    background: flagValue(rest, "--background"),
    logo,
    logoFraction,
    logoPadding,
    errorLevel,
    version: version || undefined,
  };
}

/** The logo box side in modules: the fraction of the grid, made odd so it centres on a module. */
export function logoModules(gridSize: number, fraction: number): number {
  const raw = Math.max(1, Math.round(gridSize * fraction));
  return raw % 2 === gridSize % 2 ? raw : raw + 1;
}

export interface Written {
  path: string;
  bytes: number;
}

/** Renders once and writes every format. The seam `runQr` and the tests share. */
export async function generateQr(options: QrOptions): Promise<Written[]> {
  const grid = encode(options.text, {
    errorLevel: options.errorLevel,
    version: options.version,
  });

  const logo = options.logo
    ? await loadLogo({
        path: options.logo,
        modules: logoModules(grid.size, options.logoFraction),
        padding: options.logoPadding,
        gridSize: grid.size,
      })
    : undefined;

  const svg = renderSvg(grid, {
    size: options.size,
    margin: options.margin,
    color: options.color,
    background: options.background,
    logo,
  });

  const written: Written[] = [];
  for (const format of options.formats) {
    const path = options.exactPath ?? `${options.stem}.${extensionOf(format)}`;
    await mkdir(dirname(path), { recursive: true });
    if (format === "svg") {
      await writeFile(path, svg);
      written.push({ path, bytes: Buffer.byteLength(svg) });
      continue;
    }
    const background =
      options.background ??
      (needsBackground(format)
        ? contrastingBackground(options.color)
        : undefined);
    const bytes = await rasterize(svg, format, {
      size: options.size,
      background,
    });
    await writeFile(path, bytes);
    written.push({ path, bytes: bytes.length });
  }
  return written;
}

export async function runQr(rest: string[]): Promise<void> {
  let args = rest;
  if (!flagValue(rest, "--text") && positionals(rest).length === 0) {
    const answer = unwrap(
      await askText({
        message: "What should the code open?",
        placeholder: "https://devdogsuga.org/attendance",
        validate: (value) =>
          value?.trim() ? undefined : "Something to encode.",
      }),
    ).trim();
    args = ["--text", answer, ...rest];
  }

  const parsed = parseQrArgs(args, process.cwd());
  if (parsed instanceof Error) {
    explain("Could not read that.", parsed.message, [
      "pnpm devtools qr https://example.org --out poster.png",
      "pnpm devtools qr --help",
    ]);
    process.exitCode = 1;
    return;
  }

  // `--out posters` where posters/ exists means "in there", not "posters.svg".
  let options = parsed;
  const outFlag = flagValue(args, "--out");
  if (outFlag && !extname(outFlag) && !parsed.exactPath) {
    const target = resolve(process.cwd(), outFlag);
    const info = await stat(target).catch(() => null);
    if (info?.isDirectory()) {
      options = { ...parsed, stem: join(target, REFERENCE.stem) };
    }
  }

  try {
    const written = await generateQr(options);
    for (const file of written) {
      log.success(`${file.path}  (${Math.round(file.bytes / 1024)} KB)`);
    }
    if (options.formats.some(needsBackground) && !options.background) {
      log.info(
        `JPEG has no transparency, so it was flattened onto ${contrastingBackground(options.color)}. Pass --background to choose.`,
      );
    }
    if (options.logo) {
      log.message(
        `Scan it before printing: ${basename(options.logo)} hides modules that ` +
          `${options.errorLevel}-level error correction has to recover.`,
      );
    }
  } catch (err) {
    explain(
      "The code could not be written.",
      err instanceof Error ? err.message : String(err),
      [
        options.logo
          ? `The logo is read from ${options.logo}; pass --logo <file> or --logo none.`
          : "Try a shorter text, or a lower --ecl.",
      ],
    );
    process.exitCode = 1;
  }
}
