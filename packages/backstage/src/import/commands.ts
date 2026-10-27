/**
 * `backstage import <involvement|attendance|contributions>`: routes to the domain that owns
 * each import. They load on use, like every other command group.
 */
import type { CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { explain } from "@devdogsuga/cli-core/ui";

export const handleImport: CommandHandler = async (rest) => {
  const [what, ...args] = rest;
  if (what === "involvement") {
    return (await import("../involvement/commands.js")).handleInvolvement(args);
  }
  if (what === "attendance") {
    return (await import("../attendance/commands.js")).handleAttendance(args);
  }
  if (what === "contributions") {
    return (await import("../contributions/commands.js")).handleContributions(
      args,
    );
  }
  explain(
    what
      ? `Unknown import "${what}". Try involvement, attendance or contributions.`
      : "Name the import: involvement, attendance or contributions.",
    "",
  );
  process.exitCode = 1;
  return null;
};
