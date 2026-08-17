/**
 * The three Airtable base commands: scaffold, pull-ids, verify.
 *
 * They are the runbook in docs/platform/airtable-setup.md, in order — create
 * what the registry declares, write the discovered ids back, then diff the two
 * forever after. Everything they know how to do lives in `@devdogsuga/airtable`;
 * what is here is prompting, file I/O and exit codes.
 *
 * No spinners, unlike the rest of devtools. `verify` is a CI gate as well as a
 * contributor command, and a spinner redrawing itself into a log file is worse
 * than no progress indication at all.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { log, note } from "@clack/prompts";
import {
  applyDiscoveredIds,
  discoverIds,
  formatVerifyResult,
  planScaffold,
  readSnapshot,
  scaffoldBase,
  snapshotDrift,
  undeclaredFields,
  verifyBase,
  writeSnapshot,
} from "@devdogsuga/airtable";
import { PROJECT_ROOT } from "../instance.js";
import { errorMessage, explain } from "../ui.js";
import { airtableClient } from "./client.js";

const REGISTRY = join(PROJECT_ROOT, "packages/airtable/src/registry.ts");

/**
 * Where the runbook goes next, printed at the end of each step.
 *
 * The `pnpm airtable:*` aliases rather than `pnpm devtools airtable *`: both
 * work, but the short form is what the runbook, the registry header and the
 * sync panel's error text all say, and a tool that prints a fourth spelling of
 * its own name is a tool people stop trusting the output of.
 */
const NEXT_STEPS = {
  scaffold: "Next: `pnpm airtable:pull-ids`, then commit registry.ts.",
  pullIds: [
    "pnpm prettier --write packages/airtable/src/registry.ts",
    "pnpm airtable:verify",
    "git add packages/airtable/src/registry.ts && git commit",
  ].join("\n"),
};

/**
 * Create whatever the registry declares and the base does not have.
 *
 * Idempotent: run it again after adding a field to the registry and it creates
 * that one field. Run it against a finished base and it does nothing.
 */
export async function runScaffold(dryRun: boolean): Promise<void> {
  // ⚠️ The ONE call site in this file where the capability is not a constant,
  // and both directions of getting it wrong are bad: `write` under `--dry-run`
  // authenticates the §3.5 plan step with a token that can restructure the
  // base, and `read` without it fails 403 partway through creating tables.
  const credentials = airtableClient({ need: dryRun ? "read" : "write" });
  if (!credentials) {
    process.exitCode = 1;
    return;
  }
  const { client, baseId } = credentials;

  if (dryRun) {
    const { tables } = await client.getBaseSchema();
    const plan = planScaffold(tables);

    const lines = plan.map((entry) => {
      if (!entry.exists) {
        return `+ table ${entry.table} (${entry.declared} fields)`;
      }
      if (entry.missing.length === 0) return `  ${entry.table} — up to date`;
      return [
        `  ${entry.table} — ${entry.missing.length} field(s) to add`,
        ...entry.missing.map((f) => `    + ${f.name} (${f.type})`),
      ].join("\n");
    });

    note(lines.join("\n"), `Base ${baseId} — ${tables.length} table(s)`);
    log.info("Nothing was written. Drop --dry-run to create these.");
    return;
  }

  log.step(`Scaffolding ${baseId}`);

  const result = await scaffoldBase(client, { log: (m) => log.message(m) });

  const tables = result.created.filter((c) => c.kind === "table").length;
  const fields = result.created.filter((c) => c.kind === "field").length;
  log.success(`Created ${tables} table(s) and ${fields} field(s).`);

  const found = discoverIds(result.schema);
  if (found.missing.length > 0) {
    explain(
      "Some declared tables or fields are still missing.",
      found.missing.join("\n"),
      [
        "This is a bug in the scaffolder, or a field Airtable refused.",
        "Do NOT run pull-ids — it would write a half-resolved registry.",
      ],
    );
    process.exitCode = 1;
    return;
  }

  const extra = undeclaredFields(result.schema);
  if (extra.length > 0) {
    note(
      extra.map((f) => `${f.table}.${f.field} (${f.type})`).join("\n") +
        "\n\nExpected for link fields — Airtable creates the reverse side of\n" +
        "every link automatically. `verify` reports these rather than failing.",
      "Fields the registry does not declare",
    );
  }

  log.info(NEXT_STEPS.scaffold);
}

/**
 * Read the live base and write the discovered ids into `registry.ts`.
 *
 * Refuses to write a partial result. A registry half in placeholders and half
 * in real ids verifies as fatal anyway, but it also looks finished at a glance,
 * which is worse than looking untouched.
 */
export async function runPullIds(): Promise<void> {
  // Reads the base schema and writes a COMMITTED SOURCE FILE. The write is
  // local, so nothing here needs a token that can change anything remote.
  const credentials = airtableClient({ need: "read" });
  if (!credentials) {
    process.exitCode = 1;
    return;
  }
  const { client, baseId } = credentials;

  const { tables } = await client.getBaseSchema();
  const found = discoverIds(tables);

  if (found.missing.length > 0) {
    explain(`Base ${baseId} is missing:`, found.missing.join("\n"), [
      "Run `pnpm airtable:scaffold` first.",
    ]);
    process.exitCode = 1;
    return;
  }

  const before = await readFile(REGISTRY, "utf8");
  const { source, replaced, warnings } = applyDiscoveredIds(before, found);

  for (const warning of warnings) log.warn(warning);

  if (source === before) {
    log.success(`registry.ts already matches ${baseId} — nothing to write.`);
    return;
  }

  await writeFile(REGISTRY, source);
  log.success(
    `Wrote ${replaced} ID(s) into packages/airtable/src/registry.ts from ${baseId}.`,
  );
  note(NEXT_STEPS.pullIds, "Next");
}

/**
 * Diff the live base against the registry.
 *
 * Step 7 of the runbook, and a CI gate afterwards. Sets a non-zero exit code on
 * any fatal finding, so a base that has drifted fails the build rather than
 * failing the next sync quietly.
 */
export async function runVerify(checkDuplicates: boolean): Promise<void> {
  // ⚠️ `read` covers the schema half only. Duplicate detection also reads
  // RECORDS (`data.records:read`), which `AIRTABLE_PLAN_PAT` deliberately
  // cannot do — so on a machine holding both tokens, `verify` with duplicate
  // checking on needs `AIRTABLE_PAT` and says so through `runAirtable`'s hint
  // rather than through a bare 403.
  const credentials = airtableClient({ need: "read" });
  if (!credentials) {
    process.exitCode = 1;
    return;
  }
  const { client, baseId } = credentials;

  const result = await verifyBase(client, { checkDuplicates });

  log.step(`Base ${baseId}`);
  log.message(formatVerifyResult(result));

  // The one protection nothing can verify for us: the base schema response
  // carries no permission data at all, so whether each `⚙️` field is actually
  // locked can only be checked by a human walking the UI.
  if (result.pushChecklist.length > 0) {
    note(
      result.pushChecklist
        .map((item) => `[ ] ${item.table} → ${item.field}`)
        .join("\n") +
        "\n\nSet each of these to officer-only in the Airtable UI. There is no\n" +
        "API for this and no way to verify it.",
      "Field editing permissions",
    );
  }

  if (result.ok) log.success("The base matches the registry.");
  else {
    log.error("The base has drifted from the registry.");
    process.exitCode = 1;
  }
}

/**
 * Refresh the committed schema snapshot, or check the registry against it.
 *
 * `--check` is the half that runs in pull-request CI: it reads the committed
 * file and touches no network, so it needs no credential — which is the whole
 * point, since a token in a PR-triggered workflow is readable by whoever opened
 * the pull request.
 *
 * Writing is deliberately manual. Refreshing on a schedule would rewrite the
 * snapshot to match a drifted base, which turns every subsequent pull request
 * red for a cause no pull request created and none can fix.
 */
export async function runSnapshot(check: boolean): Promise<void> {
  if (check) {
    let snapshot;
    try {
      snapshot = readSnapshot();
    } catch (err) {
      explain("No schema snapshot to check against.", errorMessage(err), [
        "Create one with `pnpm airtable:snapshot` and commit it.",
      ]);
      process.exitCode = 1;
      return;
    }

    const drift = snapshotDrift(snapshot);
    log.step(`${snapshot.tables.length} table(s) in the snapshot`);

    if (drift.length === 0) {
      log.success("The registry agrees with the committed snapshot.");
      return;
    }

    note(
      drift
        .map((d) =>
          d.absent
            ? `${d.table} — no such table in the snapshot`
            : `${d.table} — missing ${d.missing.join(", ")}`,
        )
        .join("\n"),
      "Registry declares what the snapshot does not have",
    );
    explain("The registry and the snapshot disagree.", "", [
      "If you edited registry.ts by hand, check the ids against the base.",
      "If the base genuinely changed, run `pnpm airtable:snapshot` and",
      "commit the result alongside the registry change.",
    ]);
    process.exitCode = 1;
    return;
  }

  // Schema only, into a committed file. Same shape as pull-ids.
  const credentials = airtableClient({ need: "read" });
  if (!credentials) {
    process.exitCode = 1;
    return;
  }
  const { client, baseId } = credentials;

  const schema = await client.getBaseSchema();
  writeSnapshot(schema.tables);

  log.step(`Base ${baseId}`);
  log.success(
    `Wrote ${String(schema.tables.length)} table(s) to schema-snapshot.json.`,
  );
  log.info(
    "Commit it alongside whatever registry change prompted the refresh.",
  );
}

/** Shared error path, so a thrown Airtable error is never a stack trace. */
export async function runAirtable(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (err) {
    explain("The Airtable command failed.", errorMessage(err), [
      "A 401 or 403 means the token is missing a scope — see",
      "docs/platform/airtable-setup.md for the three tokens and their scopes.",
      "",
      "Note WHICH token these commands pick: the reading ones prefer",
      "AIRTABLE_PLAN_PAT over AIRTABLE_PAT, and the plan token carries",
      "schema.bases:read ALONE. So a 403 on a records read means both are set",
      "and the narrow one won — `verify --no-duplicates` reads no records, or",
      "unset AIRTABLE_PLAN_PAT in .env, where it does not belong anyway.",
    ]);
    process.exitCode = 1;
  }
}
