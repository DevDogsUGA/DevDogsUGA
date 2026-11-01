/**
 * `qr`'s place in the command tree: declaration only, nothing here runs. The
 * handler lives in `commands.ts` beside it, and the options come from
 * `options.ts`, which is typed against the shared request schema.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";
import { qrCatalogOptions } from "./options.js";

export const qrCommand: CommandNode = {
  name: "qr",
  dryRun: "handled",
  envFree: true,
  summary: "Make a QR code: any size, colour, logo and format.",
  hint: "same options as /dashboard/qr; svg, png, jpg, webp, avif, tiff",
  // The command asks for the text itself when it is missing, so the outer
  // wizard dispatches bare `qr`; the options remain for help and scripts.
  options: [
    ...qrCatalogOptions(),
    {
      flag: "--dry-run",
      summary: "List the files that would be written, and write nothing.",
    },
  ],
};
