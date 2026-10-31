/**
 * `pnpm backstage qr <text> [options]`
 *
 * The QR generator from `/dashboard/qr`, on the command line, with every option
 * the page has: content, size and margin, ink colour, background, a two-colour
 * gradient, module shape, error-correction level, QR version, a centre logo
 * (a brand preset, or an image file with size, padding and crop) and every
 * output format at once. The page stays, deprecated; new options are
 * CLI-only.
 *
 * Both read one request schema from `@devdogsuga/sdk/brand/qr`, so what a request
 * means cannot differ between them. The scannability warning is the page's
 * too: `qrVersionIssue`.
 *
 * No credentials, no checkout.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { log, text as askText } from "@clack/prompts";
import {
  QR_LOGO_PRESETS,
  qrRequestSchema,
  qrVersionIssue,
  resolveQrRequest,
  type QrRequest,
} from "@devdogsuga/sdk/brand/qr";
import { renderQr } from "@devdogsuga/sdk/brand/render";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { isDryRun } from "@devdogsuga/cli-core/dry-run";
import { isNonInteractive } from "@devdogsuga/cli-core/mode";
import { explainError, unwrap, UsageError } from "@devdogsuga/cli-core/ui";
import { QR_EXTRA_FLAGS, QR_FLAGS, qrParseOptions } from "./options.js";

/** A logo that is a file rather than a preset, with its optional crop. */
export interface LogoFile {
  path: string;
  crop?: { x: number; y: number; width: number; height: number };
}

export interface QrInvocation {
  request: QrRequest;
  logoFile?: LogoFile;
  out: string;
  name: string;
  /** List the files and write nothing. */
  dryRun: boolean;
}

const MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/")
    ? resolve(homedir(), path.slice(2))
    : path;
}

function number(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (value.trim() === "" || Number.isNaN(parsed)) {
    throw new UsageError(`--${flag} takes a number, not "${value}".`);
  }
  return parsed;
}

/** An empty flag value counts as absent. */
function nonBlank(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

function list(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCrop(value: string): NonNullable<LogoFile["crop"]> {
  const parts = list(value).map(Number);
  const [x, y, width, height] = parts;
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0) ||
    !width ||
    !height
  ) {
    throw new UsageError(
      `--${QR_EXTRA_FLAGS.logoCrop.name} takes four whole numbers: x,y,width,height (source pixels).`,
    );
  }
  return { x: x!, y: y!, width, height };
}

/**
 * Reads the command line into a request the shared schema accepts.
 *
 * Throws {@link UsageError} for anything it can name: a bad number, a logo
 * that is neither a preset nor a file, or a value the schema refuses (reported
 * against the flag that carries it).
 */
/** The parsed flags by name: all string-valued, bar `--dry-run`. */
function flagValues(values: object): Record<string, string | undefined> {
  return values as Record<string, string | undefined>;
}

function readArgs(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      options: {
        ...qrParseOptions(),
        // Consumed by the launcher and the dispatcher, ignored here.
        "dry-run": { type: "boolean" },
      },
      allowPositionals: true,
    });
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }
}

/** The text on the command line, if it carries any. */
export function textGiven(argv: readonly string[]): string | undefined {
  const { values, positionals } = readArgs(argv);
  return positionals[0] ?? flagValues(values)[QR_FLAGS.text.name];
}

export function parseQrArgs(
  argv: readonly string[],
  cwd: string,
  /** The text, when it came from a prompt rather than the command line. */
  asked?: string,
): QrInvocation {
  const parsed = readArgs(argv);
  const { positionals } = parsed;
  const values = flagValues(parsed.values);
  const get = (flag: { name: string }): string | undefined => values[flag.name];

  if (positionals.length > 1) {
    throw new UsageError(
      `Give the text to encode as one argument (quote it); got ${positionals.length}.`,
    );
  }
  const text = positionals[0] ?? get(QR_FLAGS.text) ?? asked;

  const gradient = get(QR_FLAGS.gradient);
  const gradientColours = gradient === undefined ? undefined : list(gradient);
  if (gradientColours && gradientColours.length !== 2) {
    throw new UsageError("--gradient takes two colours: from,to.");
  }

  // A logo is a preset name, `none`, or the path of an image file.
  const logo = get(QR_FLAGS.logo);
  const isPreset = logo !== undefined && logo in QR_LOGO_PRESETS;
  const logoPath =
    logo !== undefined && !isPreset && logo !== "none"
      ? resolve(cwd, expandHome(logo))
      : undefined;
  const cropValue = get(QR_EXTRA_FLAGS.logoCrop);
  if (cropValue !== undefined && !logoPath) {
    throw new UsageError("--logo-crop crops a logo file; pass --logo <file>.");
  }

  const background = get(QR_FLAGS.background);
  const formats = get(QR_FLAGS.formats);

  const request = {
    text: text ?? "",
    theme: get(QR_FLAGS.theme),
    size: number("size", get(QR_FLAGS.size)),
    margin: number("margin", get(QR_FLAGS.margin)),
    color: get(QR_FLAGS.color),
    // The console's "transparent" is an empty background.
    background:
      background === "transparent" || background === "none" ? "" : background,
    gradient: gradientColours as [string, string] | undefined,
    shape: get(QR_FLAGS.shape),
    // A file is supplied to the renderer as the logo href, as the console
    // does for its custom image; the schema is told there is no preset.
    logo: logoPath ? "none" : logo,
    logoSize: number("logo-size", get(QR_FLAGS.logoSize)),
    logoPadding: number("logo-padding", get(QR_FLAGS.logoPadding)),
    errorLevel: get(QR_FLAGS.errorLevel),
    version: number("qr-version", get(QR_FLAGS.version)),
    formats: formats === undefined ? undefined : list(formats),
  };
  // `undefined` fields are dropped so the schema's own defaults apply.
  const defined = Object.fromEntries(
    Object.entries(request).filter(([, value]) => value !== undefined),
  );

  const checked = qrRequestSchema.safeParse(defined);
  if (!checked.success) {
    const names = new Map(
      Object.entries(QR_FLAGS).map(([key, flag]) => [key, flag.name]),
    );
    throw new UsageError(
      checked.error.issues
        .map((issue) => {
          const key = String(issue.path[0] ?? "");
          const flag = names.get(key);
          return key === "text" || !flag
            ? issue.message
            : `--${flag}: ${issue.message}`;
        })
        .join("\n"),
    );
  }

  return {
    request: defined as QrRequest,
    logoFile: logoPath
      ? {
          path: logoPath,
          crop: cropValue === undefined ? undefined : parseCrop(cropValue),
        }
      : undefined,
    out: resolve(cwd, expandHome(nonBlank(get(QR_EXTRA_FLAGS.out)) ?? ".")),
    name: nonBlank(get(QR_EXTRA_FLAGS.name)) ?? "qr",
    dryRun: parsed.values["dry-run"] === true || isDryRun(),
  };
}

/**
 * The logo file as a data URI, cropped first when asked.
 *
 * Cropped with sharp rather than by the renderer's own `logoCrop`, because the
 * schema takes that from a preset only; the result is the same square of
 * pixels either way.
 */
export async function logoHref({ path, crop }: LogoFile): Promise<string> {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) {
    throw new UsageError(
      `Cannot use ${path} as a logo: expected ${Object.keys(MIME).join(", ")}.`,
    );
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    throw new UsageError(
      `--logo is neither a preset (${Object.keys(QR_LOGO_PRESETS).join(", ")}, none) nor a readable file: ${path}`,
    );
  }
  if (!crop) return `data:${mime};base64,${bytes.toString("base64")}`;

  const { default: sharp } = await import("sharp");
  const image = sharp(bytes);
  const { width = 0, height = 0 } = await image.metadata();
  if (crop.x + crop.width > width || crop.y + crop.height > height) {
    throw new UsageError(
      `--logo-crop ${crop.x},${crop.y},${crop.width},${crop.height} runs outside the ${width}x${height} logo.`,
    );
  }
  const cropped = await image
    .extract({
      left: crop.x,
      top: crop.y,
      width: crop.width,
      height: crop.height,
    })
    .png()
    .toBuffer();
  return `data:image/png;base64,${cropped.toString("base64")}`;
}

export interface QrDeps {
  cwd?: string;
}

export async function runQr(argv: string[], deps: QrDeps = {}): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();
  try {
    await qr(argv, cwd);
  } catch (err) {
    explainError("Could not make that code.", err, [
      "pnpm backstage qr https://devdogsuga.org --format svg,png --out ~/codes",
      "pnpm backstage qr https://devdogsuga.org --logo ./mark.png --logo-crop 0,24,265,265",
    ]);
    process.exitCode = 1;
  }
}

async function qr(argv: string[], cwd: string): Promise<void> {
  // Nothing to encode and somebody to ask: ask, then carry on as if typed.
  let asked: string | undefined;
  if (textGiven(argv) === undefined && !isNonInteractive()) {
    asked = unwrap(
      await askText({
        message: "What should the code say?",
        placeholder: "https://devdogsuga.org",
        validate: (value) => (value?.trim() ? undefined : "Enter something."),
      }),
    );
  }

  const invocation = parseQrArgs(argv, cwd, asked);
  const { text, options, logo, formats } = resolveQrRequest(invocation.request);
  const href = invocation.logoFile
    ? await logoHref(invocation.logoFile)
    : undefined;

  const issue = qrVersionIssue(
    text,
    options.errorLevel,
    options.version,
    options.logoSize,
    options.logoPadding,
    logo !== "none" || href !== undefined,
  );
  if (issue) log.warn(`Might not scan: ${issue}.`);

  const display = (file: string): string => {
    const rel = relative(cwd, file);
    return rel.startsWith("..") ? file : rel;
  };
  const target = (format: string): string =>
    resolve(invocation.out, `${invocation.name}.${format}`);

  if (invocation.dryRun) {
    log.info(
      `Would write ${formats.map((format) => display(target(format))).join(", ")}`,
    );
    return;
  }

  const files = await renderQr(invocation.request, href);
  for (const file of files) {
    const path = target(file.format);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.data);
    log.success(
      `${display(path)}  (${Math.round(file.data.length / 1024)} KB)`,
    );
  }
}

export const handleQr: CommandHandler = async (rest) => {
  await runQr(rest);
  return process.exitCode ? null : DONE;
};
