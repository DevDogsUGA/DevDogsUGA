import QRCode from "qrcode";

export const ERROR_LEVELS = ["L", "M", "Q", "H"] as const;
export type ErrorLevel = (typeof ERROR_LEVELS)[number];
export const QR_FORMATS = [
  "svg",
  "png",
  "jpg",
  "webp",
  "avif",
  "tiff",
] as const;
export type QrFormat = (typeof QR_FORMATS)[number];

export const QR_DEFAULTS = {
  size: 999,
  margin: 2,
  color: "#ffffff",
  background: "",
  logoSize: 9,
  logoPadding: 1,
  errorLevel: "H" as ErrorLevel,
  shape: "rounded" as QrShape,
  formats: ["svg", "png"] as readonly QrFormat[],
};

export type QrShape = "rounded" | "square";

export interface QrOptions {
  size: number;
  margin: number;
  color: string;
  background?: string;
  logoSize: number;
  logoPadding: number;
  errorLevel: ErrorLevel;
  shape: QrShape;
  gradient?: readonly [string, string];
  logoCrop?: {
    x: number;
    y: number;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
  };
  version?: number;
}

const RECOVERY_BUDGET: Record<ErrorLevel, number> = {
  L: 0.07,
  M: 0.15,
  Q: 0.25,
  H: 0.3,
};

export function qrVersionIssue(
  text: string,
  errorLevel: ErrorLevel,
  version: number | undefined,
  logoSize: number,
  logoPadding: number,
  hasLogo: boolean,
): string | undefined {
  try {
    const code = QRCode.create(text, {
      errorCorrectionLevel: errorLevel,
      version,
    });
    if (!hasLogo) return;
    const gridSize = code.modules.size;
    const logoStart = (gridSize - logoSize) / 2;
    const first = Math.floor(logoStart - logoPadding);
    const last = Math.ceil(logoStart + logoSize + logoPadding) - 1;
    const coveredSide = last - first + 1;
    const coveredFraction =
      (coveredSide * coveredSide) / code.modules.data.length;
    if (coveredFraction > RECOVERY_BUDGET[errorLevel])
      return "Logo exceeds the nominal error-correction budget";
  } catch {
    return "Content does not fit at this error-correction level";
  }
}

function escaped(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

const EYE_FRAME =
  "M4.5,14h5.1C12,14,14,12,14,9.6V4.5C14,2,12,0,9.5,0H4.4C2,0,0,2,0,4.4v5.1C0,12,2,14,4.5,14z M12,4.8v4.4 c0,1.5-1.3,2.8-2.8,2.8H4.8C3.2,12,2,10.8,2,9.2V4.8C2,3.3,3.3,2,4.8,2h4.4C10.8,2,12,3.2,12,4.8z";
const EYE_BALL =
  "M6,1.7v2.7C6,5.2,5.2,6,4.3,6H1.7C0.7,6,0,5.3,0,4.3V1.7C0,0.8,0.8,0,1.7,0h2.7C5.3,0,6,0.7,6,1.7z";
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

export function renderQrSvg(
  text: string,
  options: QrOptions,
  logoHref?: string,
): string {
  if (!text.trim()) throw new Error("Enter something to encode.");
  if (!Number.isInteger(options.size) || options.size < 21)
    throw new Error("Size must be a whole number of at least 21 px.");
  if (!Number.isFinite(options.margin) || options.margin < 0)
    throw new Error("Margin cannot be negative.");
  if (!Number.isInteger(options.logoSize) || options.logoSize < 1)
    throw new Error("Logo size must be a whole number of modules.");
  if (!Number.isFinite(options.logoPadding) || options.logoPadding < 0)
    throw new Error("Logo padding cannot be negative.");

  const code = QRCode.create(text, {
    errorCorrectionLevel: options.errorLevel,
    version: options.version,
  });
  const n = code.modules.size;
  const data = code.modules.data;
  if (logoHref && options.logoSize >= n)
    throw new Error(`Logo size must be fewer than ${n} modules.`);
  const logoSide = logoHref ? options.logoSize : 0;
  const logoStart = (n - logoSide) / 2;
  const first = Math.floor(logoStart - options.logoPadding);
  const last = Math.ceil(logoStart + logoSide + options.logoPadding) - 1;
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const dark = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < n &&
    y < n &&
    !(options.shape === "rounded" && finder(x, y)) &&
    !(logoHref && x >= first && x <= last && y >= first && y <= last) &&
    data[y * n + x] === 1;
  const tile = (tl: boolean, tr: boolean, br: boolean, bl: boolean) => {
    if (tl && tr && br && bl) return '<circle cx="3" cy="3" r="3"></circle>';
    if (!tl && !tr && !br && !bl) return '<rect width="6" height="6"></rect>';
    let d = tl ? "M0,3A3,3 0 0 1 3,0" : "M0,0";
    d += tr ? "H3A3,3 0 0 1 6,3" : "H6";
    d += br ? "V3A3,3 0 0 1 3,6" : "V6";
    d += bl ? "H3A3,3 0 0 1 0,3" : "H0";
    return `<path d="${d}Z"></path>`;
  };
  const moduleSize = options.size / (n + 2 * options.margin);
  const origin = options.margin * moduleSize;
  const scale = fmt(
    (moduleSize / 6) * (options.shape === "rounded" ? 1.03 : 1),
  );
  const modules: string[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (dark(x, y)) {
        modules.push(
          `<g transform="translate(${fmt(origin + x * moduleSize)},${fmt(origin + y * moduleSize)}) scale(${scale})">${options.shape === "square" ? '<rect width="6" height="6"></rect>' : tile(!dark(x, y - 1) && !dark(x - 1, y), !dark(x, y - 1) && !dark(x + 1, y), !dark(x, y + 1) && !dark(x + 1, y), !dark(x, y + 1) && !dark(x - 1, y))}</g>`,
        );
      }
  const color = escaped(options.color);
  const fill = options.gradient ? "url(#qr-gradient)" : color;
  const definitions = options.gradient
    ? `<defs><linearGradient id="qr-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${fmt(options.size)}" y2="${fmt(options.size)}"><stop offset="0" stop-color="${escaped(options.gradient[0])}"></stop><stop offset="1" stop-color="${escaped(options.gradient[1])}"></stop></linearGradient></defs>\n`
    : "";
  const eye = (x: number, y: number, path: string) =>
    `<g transform="translate(${fmt(origin + x * moduleSize)},${fmt(origin + y * moduleSize)})" fill="${fill}"><g transform="scale(${fmt(moduleSize / 2)})"><path d="${path}"></path></g></g>`;
  const eyes = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ] as const;
  const side = fmt(options.size);
  const background = options.background
    ? `<rect width="${side}" height="${side}" fill="${escaped(options.background)}"></rect>\n`
    : "";
  const logoSize = fmt(logoSide * moduleSize);
  const logoX = fmt(origin + logoStart * moduleSize);
  const logoY = fmt(origin + logoStart * moduleSize);
  const logo = logoHref
    ? options.logoCrop
      ? `<svg x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" viewBox="${options.logoCrop.x} ${options.logoCrop.y} ${options.logoCrop.width} ${options.logoCrop.height}" overflow="hidden"><image href="${escaped(logoHref)}" width="${options.logoCrop.sourceWidth}" height="${options.logoCrop.sourceHeight}"></image></svg>\n`
      : `<image href="${escaped(logoHref)}" width="${logoSize}" height="${logoSize}" x="${logoX}" y="${logoY}"></image>\n`
    : "";
  const eyeMarkup =
    options.shape === "rounded"
      ? `<g>${eyes.map(([x, y]) => eye(x, y, EYE_FRAME)).join("\n")}\n${eyes.map(([x, y]) => eye(x + 2, y + 2, EYE_BALL)).join("\n")}</g>\n`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">\n${definitions}${background}<g fill="${fill}">\n${modules.join("\n")}\n</g>\n${eyeMarkup}${logo}</svg>\n`;
}

export function contrastingBackground(color: string): string {
  const hex = /^#?([0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return "#000000";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 128 ? "#000000" : "#ffffff";
}
