/**
 * `import`'s place in the command tree: member data coming in, the mirror of
 * `export`. Each subcommand is declared beside its handler, in its domain.
 */
import type { CommandNode } from "@devdogsuga/cli-core/catalog";
import { attendanceImport } from "../attendance/catalog.js";
import { badgesImport } from "../badges/catalog.js";
import { involvementImport } from "../involvement/catalog.js";

export const importCommand: CommandNode = {
  name: "import",
  summary:
    "Member data in: the Involvement roster, a meeting's sign-in sheet, badges for old evidence.",
  hint: "production database; previews, then asks",
  subcommands: [involvementImport, attendanceImport, badgesImport],
};
