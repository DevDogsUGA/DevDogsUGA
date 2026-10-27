/**
 * `import`'s place in the command tree: member data coming in, the mirror of
 * `export`. Each subcommand is declared beside its handler, in its domain.
 */
import type { CommandNode } from "@devdogsuga/cli-core/catalog";
import { attendanceImport } from "../attendance/catalog.js";
import { contributionsImport } from "../contributions/catalog.js";
import { involvementImport } from "../involvement/catalog.js";

export const importCommand: CommandNode = {
  name: "import",
  summary:
    "Member data in: the Involvement roster, a meeting's sign-in sheet, merged pull requests.",
  hint: "production database; previews, then asks",
  subcommands: [involvementImport, attendanceImport, contributionsImport],
};
