/**
 * The QR command's flags, one per field of the shared request schema.
 *
 * `/dashboard/qr` and `backstage qr` both read their options from
 * `qrRequestSchema` in `@devdogsuga/sdk/brand/qr`. The table here is typed as a
 * record over the schema's own keys, so a field added to the schema fails to
 * compile until it has a flag, and `options.test.ts` checks the same thing at
 * runtime. That is what stops a new option reaching one front end and not the
 * other.
 *
 * The command tree is inert data that the launcher reads without running anything,
 * so this file imports the schema's TYPE only. The lists it prints (themes,
 * presets, formats) are spelled out here, and `options.test.ts` checks each
 * against the schema's own constants.
 */
import type { QrRequest } from "@devdogsuga/sdk/brand/qr";
import type { CommandOption } from "@devdogsuga/cli-core/catalog";

export type QrRequestKey = keyof QrRequest;

export interface QrFlag {
  /** The flag as typed, without the leading dashes (the `parseArgs` name). */
  name: string;
  value: string;
  summary: string;
}

export const THEMES = [
  "devdogs-light",
  "devdogs-dark",
  "acm-light",
  "acm-dark",
] as const;
export const LOGO_PRESETS = [
  "devdogs",
  "acm",
  "discord-white",
  "discord-black",
  "discord-blurple",
] as const;
export const ERROR_LEVEL_NAMES = ["L", "M", "Q", "H"] as const;
export const FORMAT_NAMES = [
  "svg",
  "png",
  "jpg",
  "webp",
  "avif",
  "tiff",
] as const;

export const QR_FLAGS: Record<QrRequestKey, QrFlag> = {
  text: {
    name: "text",
    value: "<text>",
    summary: "What to encode: a URL or any text. May be given as the argument.",
  },
  theme: {
    name: "theme",
    value: `<${THEMES.join("|")}>`,
    summary:
      "Logo, shape and ink colour in one go, as the console's theme buttons.",
  },
  size: {
    name: "size",
    value: "<px>",
    summary: "Width and height of the image in pixels. Defaults to 999.",
  },
  margin: {
    name: "margin",
    value: "<modules>",
    summary: "Quiet zone around the code, in modules. Defaults to 2.",
  },
  color: {
    name: "color",
    value: "<css colour>",
    summary: "Ink colour. Defaults to the theme's.",
  },
  background: {
    name: "background",
    value: "<css colour|transparent>",
    summary: "Background colour. Transparent by default.",
  },
  gradient: {
    name: "gradient",
    value: "<from,to>",
    summary: "Two-colour diagonal gradient for the ink, instead of --color.",
  },
  shape: {
    name: "shape",
    value: "<rounded|square>",
    summary: "Module shape. Defaults to the theme's.",
  },
  logo: {
    name: "logo",
    value: "<preset|none|file>",
    summary: `Centre logo: a preset (${LOGO_PRESETS.join(", ")}), none, or an image file path.`,
  },
  logoSize: {
    name: "logo-size",
    value: "<modules>",
    summary: "Logo width in modules. Defaults to 9.",
  },
  logoPadding: {
    name: "logo-padding",
    value: "<modules>",
    summary: "Clear space around the logo, in modules. Defaults to 1.",
  },
  errorLevel: {
    name: "error-level",
    value: `<${ERROR_LEVEL_NAMES.join("|")}>`,
    summary: "Error-correction level. Defaults to H.",
  },
  version: {
    name: "qr-version",
    value: "<1-40>",
    summary:
      "Force a QR version (grid size). Defaults to the smallest that fits.",
  },
  formats: {
    name: "format",
    value: `<${FORMAT_NAMES.join(",")}>`,
    summary:
      "Output formats, comma-separated, several at once. Defaults to svg,png.",
  },
};

/** CLI-only flags: the crop of a logo file, and where the files go. */
export const QR_EXTRA_FLAGS = {
  logoCrop: {
    name: "logo-crop",
    value: "<x,y,width,height>",
    summary:
      "Crop a logo file to this region (source pixels) before it goes in the code.",
  },
  out: {
    name: "out",
    value: "<dir>",
    summary: "Directory for the files. Defaults to the current directory.",
  },
  name: {
    name: "name",
    value: "<stem>",
    summary: "File name without extension. Defaults to qr.",
  },
} as const satisfies Record<string, QrFlag>;

/** The flags as the command catalog declares them (help, completions, menu). */
export function qrCatalogOptions(): CommandOption[] {
  return [...Object.values(QR_FLAGS), ...Object.values(QR_EXTRA_FLAGS)].map(
    (flag) => ({
      flag: `--${flag.name}`,
      value: flag.value,
      summary: flag.summary,
    }),
  );
}

/** Every flag name `parseArgs` should accept, all string-valued. */
export function qrParseOptions(): Record<string, { type: "string" }> {
  return Object.fromEntries(
    [...Object.values(QR_FLAGS), ...Object.values(QR_EXTRA_FLAGS)].map(
      (flag) => [flag.name, { type: "string" as const }],
    ),
  );
}
