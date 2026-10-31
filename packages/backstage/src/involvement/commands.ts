/**
 * `backstage import involvement --file <OrganizationRoster.csv>`: verify the
 * members on the UGA Involvement Network roster.
 *
 * Replaces the platform's retired roster upload. Officers export the
 * roster from the Involvement Network (Roster → Export → Organization Roster)
 * and run this against production:
 *
 * 1. read and check the export (`csv.ts`): its organization must be DevDogs;
 * 2. read every account and plan the import (`plan.ts`);
 * 3. print who is newly verified, who loses verification, and how many
 *    accounts would be created, then ask;
 * 4. create the missing accounts and write the profiles (`store.ts`).
 *
 * `--dry-run` stops after the preview. Production's `DB_URL`, `API_URL` and
 * `SECRET_KEY` come from the checkout's `.env.production`, else Secrets
 * Manager, so it runs under `pnpm dlx` with no checkout.
 *
 * Preferred names are never changed, so the homepage's officer board (which
 * caches them) needs no invalidation.
 */
import { parseArgs } from "node:util";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { isDryRun } from "@devdogsuga/cli-core/dry-run";
import { errorMessage, UsageError } from "@devdogsuga/cli-core/ui";
import { requireProductionKey } from "../production/access.js";
import {
  createAccountFor,
  createAccounts,
  readAccounts,
  type CreateAccount,
} from "../production/accounts.js";
import {
  canPrompt,
  confirmWrite,
  plural,
  readInputFile,
  reportFailure,
  say,
} from "../production/cli.js";
import {
  matches,
  parseRoster,
  planImport,
  RosterFormatError,
  type AccountRow,
  type ImportPlan,
} from "@devdogsuga/events/imports";
import {
  applyImportFor,
  type ApplyImport,
  type ProfileWrite,
} from "./store.js";

/** The organization a roster must be for. Compared case-insensitively. */
export const ORGANIZATION = "DevDogs";

/** Seams for tests. Everything defaults to production. */
export interface InvolvementDeps {
  readFile?: (path: string) => Promise<string>;
  accounts?: () => Promise<AccountRow[]>;
  createAccount?: CreateAccount;
  apply?: ApplyImport;
  /** Whether a terminal can answer. Defaults to a real TTY check. */
  interactive?: boolean;
}

interface Values {
  file?: string;
  yes?: boolean;
  "dry-run"?: boolean;
}

function parse(argv: readonly string[]): Values {
  try {
    return parseArgs({
      args: [...argv],
      options: {
        file: { type: "string" },
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

/** The preview: what changes, by whom. Never lists every kept member. */
export function describePlan(plan: ImportPlan, members: number): string {
  const lines = [
    `${plural(members, "member")} on the roster:`,
    `  ${plan.keep.length} already verified`,
    `  ${plan.verify.length} newly verified (have an account)`,
    `  ${plan.create.length} without an account, to be created and verified`,
    `  ${plan.drop.length} verified now but not on the roster, to lose verification`,
  ];
  if (plan.verify.length > 0) {
    lines.push(
      "",
      "Newly verified:",
      ...plan.verify.map(
        (m) =>
          `  ${m.member.firstName} ${m.member.lastName} <${m.member.email}>`,
      ),
    );
  }
  if (plan.drop.length > 0) {
    lines.push(
      "",
      "Losing verification:",
      ...plan.drop.map((d) => `  ${d.name}`),
    );
  }
  if (plan.nameDiffers.length > 0) {
    lines.push(
      "",
      "Preferred name differs from the roster (left as is):",
      ...plan.nameDiffers.map(
        (m) =>
          `  ${m.preferredName ?? "(none)"}: roster says ${m.member.firstName} ${m.member.lastName}`,
      ),
    );
  }
  if (plan.sharedAccounts.length > 0) {
    lines.push(
      "",
      "Skipped, their account already matched another roster email:",
      ...plan.sharedAccounts.map((s) => `  ${s.email}`),
    );
  }
  return lines.join("\n");
}

export async function runInvolvement(
  argv: readonly string[],
  deps: InvolvementDeps = {},
): Promise<void> {
  const interactive = deps.interactive ?? canPrompt();
  try {
    const values = parse(argv);
    const dryRun = values["dry-run"] === true || isDryRun();

    const roster = parseRoster(
      await readInputFile(values.file, {
        interactive,
        message: "Path to the Involvement Network roster export",
        placeholder: "OrganizationRoster.csv",
        read: deps.readFile,
      }),
    );
    const wrongOrg = roster.organizations.filter(
      (o) => o.toLowerCase() !== ORGANIZATION.toLowerCase(),
    );
    if (wrongOrg.length > 0) {
      throw new UsageError(
        `This roster is for ${wrongOrg.join(", ")}, not ${ORGANIZATION}.`,
      );
    }
    if (roster.members.length === 0) {
      throw new UsageError("The roster has no members with a name and email.");
    }
    if (roster.skippedLines.length > 0) {
      say(
        `Skipped ${plural(roster.skippedLines.length, "row")} missing a name or email (lines ${roster.skippedLines.join(", ")}).`,
        "warn",
      );
    }
    if (roster.conflictingNames.length > 0) {
      say(
        `Listed under two names, kept the first: ${roster.conflictingNames.join(", ")}.`,
        "warn",
      );
    }

    const dbUrl = deps.accounts
      ? undefined
      : await requireProductionKey("DB_URL");
    const accounts = await (deps.accounts ?? (() => readAccounts(dbUrl!)))();
    const plan = planImport(roster.members, accounts);
    process.stderr.write(`${describePlan(plan, roster.members.length)}\n`);

    if (dryRun) {
      say("Dry run: nothing written.");
      return;
    }
    if (
      plan.create.length === 0 &&
      plan.verify.length === 0 &&
      plan.drop.length === 0 &&
      plan.keep.length === 0
    ) {
      say("Nothing to import.");
      return;
    }

    const question = `Import into production: create ${plural(plan.create.length, "account")}, verify ${plan.verify.length}, unverify ${plan.drop.length}?`;
    if (
      !(await confirmWrite(question, { yes: values.yes === true, interactive }))
    ) {
      say("Nothing written.");
      return;
    }

    let create = deps.createAccount;
    if (!create && plan.create.length > 0) {
      create = createAccountFor(
        await requireProductionKey("API_URL"),
        await requireProductionKey("SECRET_KEY"),
      );
    }
    const { created: createdIds, failed } = create
      ? await createAccounts(
          plan.create.map((m) => m.email),
          create,
        )
      : { created: new Map<string, string>(), failed: [] };
    const created: ProfileWrite[] = plan.create.flatMap((m) => {
      const userId = createdIds.get(m.email);
      return userId
        ? [
            {
              userId,
              email: m.email,
              firstName: m.firstName,
              lastName: m.lastName,
            },
          ]
        : [];
    });
    if (failed.length > 0) {
      say(
        `Could not create ${plural(failed.length, "account")}; they stay unverified until the next import:\n${failed
          .map((f) => `  ${f.email}: ${f.reason}`)
          .join("\n")}`,
        "warn",
      );
    }

    const writes: ProfileWrite[] = [
      ...matches(plan).map((m) => ({
        userId: m.userId,
        email: m.member.email,
        firstName: m.member.firstName,
        lastName: m.member.lastName,
      })),
      ...created,
    ];
    const apply = deps.apply ?? applyImportFor(dbUrl!);
    const { written, cleared } = await apply(writes);
    say(
      `Imported: ${plural(written, "profile")} verified (${plural(created.length, "new account")}), ${cleared} unverified.`,
      "success",
    );
    if (failed.length > 0) process.exitCode = 1;
  } catch (err) {
    reportFailure("import involvement", err, [RosterFormatError]);
  }
}

export const handleInvolvement: CommandHandler = async (rest) => {
  await runInvolvement(rest);
  return process.exitCode ? null : DONE;
};
