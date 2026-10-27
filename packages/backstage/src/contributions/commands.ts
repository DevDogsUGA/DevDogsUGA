/**
 * `backstage import contributions [--repo owner/name] [--since 2026-09-01]`:
 * backfill the merged pull requests the webhook has not seen (everything
 * before it was switched on, or while it was down).
 *
 * 1. mint an installation token for the read-only GitHub App and list the
 *    merged, human-authored pull requests in the organization's repositories
 *    (`github.ts`);
 * 2. read what `platform.contributions` already holds and which GitHub
 *    accounts are linked to members (`store.ts`);
 * 3. print how many are new, how many match a member and how many wait for
 *    their author to link GitHub, then ask;
 * 4. insert them. Matching is by GitHub user id, never the login, and a rerun
 *    is a no-op.
 *
 * `--dry-run` stops after the preview. Production's `DB_URL`, `GH_APP_ID` and
 * `GH_APP_PRIVATE_KEY` come from the checkout's `.env.production`, else
 * Secrets Manager. Nothing here runs by itself.
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
  fetchMergedPullRequests,
  GithubError,
  type MergedPullRequest,
} from "./github.js";
import {
  applyContributionsFor,
  keyOf,
  readExistingFor,
  type ApplyContributions,
  type ReadExisting,
} from "./store.js";

/** Seams for tests. Everything defaults to production. */
export interface ContributionsDeps {
  fetchPulls?: (options: {
    repo?: string | undefined;
    since?: Date | undefined;
    onRepo: (repo: string, merged: number) => void;
  }) => Promise<MergedPullRequest[]>;
  existing?: ReadExisting;
  apply?: ApplyContributions;
  interactive?: boolean;
}

interface Values {
  repo?: string;
  since?: string;
  yes?: boolean;
  "dry-run"?: boolean;
}

function parse(argv: readonly string[]): Values {
  try {
    return parseArgs({
      args: [...argv],
      options: {
        repo: { type: "string" },
        since: { type: "string" },
        yes: { type: "boolean" },
        "dry-run": { type: "boolean" },
      },
      allowPositionals: false,
      strict: true,
    }).values;
  } catch (err) {
    throw new UsageError(errorMessage(err));
  }
}

function parseSince(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new UsageError("--since takes a day, like 2026-09-01.");
  }
  const at = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) {
    throw new UsageError("--since takes a day, like 2026-09-01.");
  }
  return at;
}

export interface BackfillPlan {
  fresh: MergedPullRequest[];
  alreadyRecorded: number;
  matched: number;
  waiting: number;
}

/** What a run would add. Pure. */
export function planBackfill(
  found: readonly MergedPullRequest[],
  keys: ReadonlySet<string>,
  linkedGithubIds: ReadonlySet<string>,
): BackfillPlan {
  const fresh = found.filter((pr) => !keys.has(keyOf(pr.repo, pr.number)));
  const matched = fresh.filter((pr) =>
    linkedGithubIds.has(pr.authorGithubId),
  ).length;
  return {
    fresh,
    alreadyRecorded: found.length - fresh.length,
    matched,
    waiting: fresh.length - matched,
  };
}

export function describePlan(plan: BackfillPlan): string {
  return [
    `${plural(plan.fresh.length + plan.alreadyRecorded, "merged pull request")} found:`,
    `  ${plan.alreadyRecorded} already recorded`,
    `  ${plan.fresh.length} new: ${plan.matched} by members with GitHub linked, ${plan.waiting} waiting for their author to link`,
  ].join("\n");
}

export async function runContributions(
  argv: readonly string[],
  deps: ContributionsDeps = {},
): Promise<void> {
  const interactive = deps.interactive ?? canPrompt();
  try {
    const values = parse(argv);
    const dryRun = values["dry-run"] === true || isDryRun();
    const since = parseSince(values.since);
    if (values.repo && !/^[\w.-]+\/[\w.-]+$/.test(values.repo)) {
      throw new UsageError("--repo takes owner/name, like DevDogsUGA/site.");
    }

    const dbUrl =
      deps.existing && deps.apply
        ? undefined
        : await requireProductionKey("DB_URL");
    const fetchPulls =
      deps.fetchPulls ??
      (async (options) =>
        fetchMergedPullRequests({
          ...options,
          appId: await requireProductionKey("GH_APP_ID"),
          privateKey: await requireProductionKey("GH_APP_PRIVATE_KEY"),
        }));

    const found = await fetchPulls({
      repo: values.repo,
      since,
      onRepo: (repo, merged) =>
        process.stderr.write(`  ${repo}: ${merged} merged\n`),
    });
    const { keys, linkedGithubIds } = await (
      deps.existing ?? readExistingFor(dbUrl!)
    )();
    const plan = planBackfill(found, keys, linkedGithubIds);
    process.stderr.write(`${describePlan(plan)}\n`);

    if (dryRun) {
      say("Dry run: nothing written.");
      return;
    }
    if (plan.fresh.length === 0) {
      say("Nothing to import.");
      return;
    }
    if (
      !(await confirmWrite(
        `Record ${plural(plan.fresh.length, "pull request")} in production?`,
        { yes: values.yes === true, interactive },
      ))
    ) {
      say("Nothing written.");
      return;
    }
    const { inserted } = await (deps.apply ?? applyContributionsFor(dbUrl!))(
      plan.fresh,
    );
    say(`Recorded ${plural(inserted, "pull request")}.`, "success");
  } catch (err) {
    reportFailure("import contributions", err, [GithubError]);
  }
}

export const handleContributions: CommandHandler = async (rest) => {
  await runContributions(rest);
  return process.exitCode ? null : DONE;
};
