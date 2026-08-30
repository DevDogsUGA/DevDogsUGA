/**
 * The QR symbol itself: which modules are dark.
 *
 * Everything visual lives in `style.ts`; this file is the one place the
 * `qrcode` package is imported, and it hands back a grid the styler can read
 * without knowing where it came from.
 */
import QRCode from "qrcode";

export const ERROR_LEVELS = ["L", "M", "Q", "H"] as const;
export type ErrorLevel = (typeof ERROR_LEVELS)[number];

export function isErrorLevel(value: string): value is ErrorLevel {
  return (ERROR_LEVELS as readonly string[]).includes(value);
}

export interface Grid {
  /** Modules per side. */
  size: number;
  /** 1–40. */
  version: number;
  errorLevel: ErrorLevel;
  isDark(x: number, y: number): boolean;
}

export interface EncodeOptions {
  errorLevel: ErrorLevel;
  /**
   * Fix the version (1–40) instead of taking the smallest that fits. The
   * reference `attendance/qr.svg` uses the smallest, version 4 for its URL at
   * level H, so this is only for making room under a bigger logo.
   */
  version?: number;
}

export function encode(text: string, options: EncodeOptions): Grid {
  const code = QRCode.create(text, {
    errorCorrectionLevel: options.errorLevel,
    version: options.version,
  });
  const { size, data } = code.modules;
  return {
    size,
    version: code.version,
    errorLevel: options.errorLevel,
    isDark: (x, y) => data[y * size + x] === 1,
  };
}
