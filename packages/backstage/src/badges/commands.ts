/**
 * `backstage import badges [--dry-run] [--yes]`: award the badges the triggers
 * would have, for evidence that existed before they did.
 *
 * 1. read submitted meeting reflections (with attendance and the workshops the
 *    meeting ran), matched contributions, and the awards that exist;
 * 2. plan (`plan.ts`): Workshop completed for a member who attended and
 *    submitted a reflection for a workshop the meeting ran; a reflection with
 *    no workshop chosen counts only when the meeting ran exactly one workshop
 *    (what the reflection picker defaults to), and is otherwise skipped and
 *    counted, never guessed; First Merge for a member with a matched
 *    contribution and no First Merge row;
 * 3. print the plan per badge, then ask;
 * 4. apply it in one transaction through `platform.sync_workshop_badge` and
 *    `platform.award_first_merge` (the triggers' own functions) and write one
 *    `badge.backfill` audit event.
 *
 * Idempotent: a second run finds everything held and changes nothing.
 * Officer-awarded badges and withdrawals are never touched. Streaks and the
 * weekly art are computed on read, so there is nothing to backfill for them,
 * and no stars or pull-request counts ever become EL hours.
 *
 * Production's `DB_URL` comes from the checkout's `.env.production`, else
 * Secrets Manager.
 */
import { parseArgs } from "node:util";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { isDryRun } from "@devdogsuga/cli-core/dry-run";
import { errorMessage, UsageError } from "@devdogsuga/cli-core/ui";
import { requireProductionKey } from "../production/access.js";
import {
  canPrompt,
  confirmWrite,
  plural,
  reportFailure,
  say,
} from "../production/cli.js";
import {
  describePlan,
  planFirstMerge,
  planWorkshops,
  type BadgesPlan,
} from "./plan.js";
import {
  applyBadgesFor,
  readEvidenceFor,
  type ApplyBadges,
  type Evidence,
  type ReadEvidence,
} from "./store.js";

export { describePlan };

/** Seams for tests. Everything defaults to production. */
export interface BadgesDeps {
  evidence?: ReadEvidence;
  apply?: ApplyBadges;
  interactive?: boolean;
}

interface Values {
  yes?: boolean;
  "dry-run"?: boolean;
}

function parse(argv: readonly string[]): Values {
  try {
    return parseArgs({
      args: [...argv],
      options: { yes: { type: "boolean" }, "dry-run": { type: "boolean" } },
      allowPositionals: false,
      strict: true,
    }).values;
  } catch (err) {
    throw new UsageError(errorMessage(err));
  }
}

export function planBadges(evidence: Evidence): BadgesPlan {
  return {
    workshop: planWorkshops(evidence.reflections, evidence.liveWorkshopAwards),
    firstMerge: planFirstMerge(
      evidence.contributors,
      evidence.firstMergeHolders,
    ),
  };
}

export async function runBadges(
  argv: readonly string[],
  deps: BadgesDeps = {},
): Promise<void> {
  const interactive = deps.interactive ?? canPrompt();
  try {
    const values = parse(argv);
    const dryRun = values["dry-run"] === true || isDryRun();
    const dbUrl =
      deps.evidence && deps.apply
        ? undefined
        : await requireProductionKey("DB_URL");
    const plan = planBadges(await (deps.evidence ?? readEvidenceFor(dbUrl!))());
    process.stderr.write(`${describePlan(plan)}\n`);

    if (dryRun) {
      say("Dry run: nothing written.");
      return;
    }
    const total = plan.workshop.awards.length + plan.firstMerge.userIds.length;
    if (total === 0) {
      say("Nothing to award.");
      return;
    }
    if (
      !(await confirmWrite(`Award ${plural(total, "badge")} in production?`, {
        yes: values.yes === true,
        interactive,
      }))
    ) {
      say("Nothing written.");
      return;
    }
    const done = await (deps.apply ?? applyBadgesFor(dbUrl!))(plan);
    say(
      `Awarded ${plural(done.workshopAwarded, "Workshop completed badge")} and ${plural(done.firstMergeAwarded, "First Merge badge")}.`,
      "success",
    );
  } catch (err) {
    reportFailure("import badges", err);
  }
}

export const handleBadges: CommandHandler = async (rest) => {
  await runBadges(rest);
  return process.exitCode ? null : DONE;
};
