/**
 * The three Airtable base commands: apply, verify, check.
 *
 * They used to be four — `scaffold`, `pull-ids`, `verify`, `snapshot` — one per
 * function in `@devdogsuga/airtable`. That split was the library's shape rather
 * than the operator's: three of the four were a single errand typed in three
 * parts, always in the same order, and always in a state between them where the
 * repository was wrong. `scaffold` created fields the registry knew only as
 * `todo("slug")`; until `pull-ids` ran, `verify` was fatal by construction and
 * the sync refused every pass with `schema_invalid`. Nobody ever wanted to stop
 * there, and the second command re-read the base to recompute a value the first
 * had already computed and thrown away.
 *
 * So the errand is one command now:
 *
 *   apply    make the base match the registry, then write back what that
 *            produced — the discovered ids into `registry.ts`, the live schema
 *            into `schema-snapshot.json`. `--dry-run` is the read-only plan.
 *   verify   diff the live base against the registry. Reads only.
 *   check    diff the registry against the COMMITTED snapshot. Reads nothing
 *            but two files, which is why it is the one CI can run on a pull
 *            request. Named apart from `verify` for that reason: the two ask
 *            almost the same question, and only one of them needs a token.
 *
 * Everything they know how to do lives in `@devdogsuga/airtable`; what is here
 * is prompting, file I/O and exit codes.
 *
 * No spinners, unlike the rest of devtools. `check` is a CI gate as well as a
 * contributor command, and a spinner redrawing itself into a log file is worse
 * than no progress indication at all.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { log, note } from "@clack/prompts";
import { format, resolveConfig } from "prettier";
import {
  applyDiscoveredIds,
  discoverIds,
  formatVerifyResult,
  planScaffold,
  platformOwnedFields,
  readSnapshot,
  registry,
  scaffoldBase,
  snapshotDrift,
  undeclaredFields,
  verifyBase,
  writeSnapshot,
  type LiveTable,
} from "@devdogsuga/airtable";
import { PROJECT_ROOT } from "../instance.js";
import { errorMessage, explain } from "../ui.js";
import { airtableClient } from "./client.js";

const REGISTRY = join(PROJECT_ROOT, "packages/airtable/src/registry.ts");

/**
 * Where the runbook goes next, printed at the end of `apply`.
 *
 * This used to print the `pnpm airtable:*` root aliases, on the grounds that
 * one spelling everywhere beats a shorter one here. The runbook, the registry
 * header and the sync panel's error text all said the short form, and a tool
 * that prints a fourth spelling of its own name is a tool people stop trusting
 * the output of.
 *
 * That argument survives the aliases being removed; it just picks the other
 * spelling now. `pnpm devtools airtable …` is the only one that exists, so it
 * is the one every caller says.
 *
 * Both written files are named, because `apply` edits two committed files and a
 * commit that carries one without the other fails `check` on the next pull
 * request for a reason that looks unrelated to whoever opened it.
 */
const NEXT_STEPS = [
  "pnpm devtools airtable verify",
  "git add packages/airtable/src/registry.ts packages/airtable/schema-snapshot.json",
].join("\n");

/** Format generated registry source with the repository's Prettier config. */
export async function formatRegistry(source: string): Promise<string> {
  const config = await resolveConfig(REGISTRY);
  return format(source, { ...config, filepath: REGISTRY });
}

/**
 * Make the base match the registry, and write back what that produced.
 *
 * Three steps that were three commands: create whatever the registry declares
 * and the base does not have, write the discovered ids into `registry.ts`, and
 * refresh the committed schema snapshot. `scaffoldBase` re-reads the base after
 * creating, so all three run off ONE schema read — the id discovery and the
 * snapshot both consume `result.schema` rather than fetching it again.
 *
 * Idempotent, and worth running when nothing is missing: it creates nothing,
 * rewrites no ids, and refreshes the snapshot from the base as it stands.
 *
 * ⚠️ Refuses to write a partial result. If the base still lacks something after
 * scaffolding, this stops BEFORE touching `registry.ts` — a registry half in
 * placeholders and half in real ids verifies as fatal anyway, but it also looks
 * finished at a glance, which is worse than looking untouched.
 */
export async function runApply(dryRun: boolean): Promise<void> {
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
    log.info("Nothing was written. Drop --dry-run to apply this.");
    return;
  }

  log.step(`Applying the registry to ${baseId}`);

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
        "Nothing was written to registry.ts or the snapshot — half-resolved",
        "versions of either look finished and are not.",
      ],
    );
    process.exitCode = 1;
    return;
  }

  const before = await readFile(REGISTRY, "utf8");
  const { source, replaced, warnings } = applyDiscoveredIds(before, found);
  for (const warning of warnings) log.warn(warning);
  const formatted = await formatRegistry(source);

  if (formatted === before) {
    log.success(`registry.ts already matches ${baseId} — no ids to write.`);
  } else {
    await writeFile(REGISTRY, formatted);
    log.success(
      `Wrote and formatted packages/airtable/src/registry.ts (${replaced} ID(s)).`,
    );
  }

  // From the same schema the ids came out of, so the two committed files
  // cannot disagree about which base run produced them.
  writeSnapshot(result.schema);
  log.success(
    `Wrote ${String(result.schema.length)} table(s) to schema-snapshot.json.`,
  );

  reportWhatNoApiCanDo(result.schema);

  note(NEXT_STEPS, "Next");
}

/**
 * The two jobs `apply` cannot finish for you, printed where they are needed.
 *
 * Both are Airtable UI work, and both are most needed immediately after a
 * scaffold — before the base has ever been verified — so printing them from
 * `verify` alone would put them behind a command nobody has reached yet.
 */
function reportWhatNoApiCanDo(schema: LiveTable[]) {
  const extra = undeclaredFields(schema);
  if (extra.length > 0) {
    note(
      extra.map((f) => `${f.table}.${f.field} (${f.type})`).join("\n") +
        "\n\nExpected for link fields — Airtable creates the reverse side of\n" +
        "every link automatically. `verify` reports these rather than failing.\n" +
        "Anything else here is a field the scaffolder cannot remove: delete it\n" +
        "by hand, or declare it.",
      "Fields the registry does not declare",
    );
  }

  // The one protection nothing can verify for us: the base schema response
  // carries no permission data at all, so whether each `⚙️` field is actually
  // locked can only be checked by a human walking the UI. Built from the
  // registry rather than from the base for exactly that reason — there is
  // nothing live to read.
  const owned = Object.values(registry).flatMap((spec) =>
    platformOwnedFields(spec).map((f) => `[ ] ${spec.name} → ${f.name}`),
  );
  if (owned.length > 0) {
    note(
      owned.join("\n") +
        "\n\nSet each of these to officer-only in the Airtable UI. There is no\n" +
        "API for this and no way to verify it.",
      "Field editing permissions",
    );
  }
}

/**
 * Diff the live base against the registry.
 *
 * Sets a non-zero exit code on any fatal finding, so a base that has drifted
 * fails the build rather than failing the next sync quietly.
 *
 * Distinct from `check`, which asks a narrower question of the committed
 * snapshot and needs no credential at all. This one is the truth; that one is
 * what a pull request can afford to ask.
 */
export async function runVerify(checkDuplicates: boolean): Promise<void> {
  // ⚠️ `read` covers the schema half only. Duplicate detection also reads
  // RECORDS (`data.records:read`), which `AIRTABLE_PLAN_PAT` deliberately
  // cannot do. So on a machine holding both tokens, `verify` with duplicate
  // checking on needs `AIRTABLE_SYNC_PAT`, the second entry in the read row,
  // and says so through `runAirtable`'s hint rather than through a bare 403.
  //
  // That second entry used to be `AIRTABLE_PAT`. Nothing about this hazard
  // changed with it: the plan token is still first because it is narrower, and
  // it still cannot see a record. Keep `AIRTABLE_PLAN_PAT`, a CI credential,
  // out of a laptop `.env` and the ordering never bites.
  const credentials = airtableClient({ need: "read" });
  if (!credentials) {
    process.exitCode = 1;
    return;
  }
  const { client, baseId } = credentials;

  const result = await verifyBase(client, { checkDuplicates });

  log.step(`Base ${baseId}`);
  log.message(formatVerifyResult(result));

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
 * Check the registry against the committed schema snapshot.
 *
 * The one Airtable command pull-request CI runs: it reads the committed file
 * and touches no network, so it needs no credential. That is the whole point,
 * since a token in a PR-triggered workflow is readable by whoever opened the
 * pull request.
 *
 * The refresh side of this lives in `apply`, and deliberately so. Refreshing on
 * a schedule — or from any command that does not first make the base match the
 * registry — would rewrite the snapshot to match a drifted base, which turns
 * every subsequent pull request red for a cause no pull request created and
 * none can fix.
 */
export function runCheck(): void {
  let snapshot;
  try {
    snapshot = readSnapshot();
  } catch (err) {
    explain("No schema snapshot to check against.", errorMessage(err), [
      "Create one with `pnpm devtools airtable apply` and commit it.",
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
      .flatMap((d) => {
        if (d.absent) return [`${d.table} — no such table in the snapshot`];

        const lines: string[] = [];
        if (d.missing.length > 0) {
          lines.push(`${d.table} — missing ${d.missing.join(", ")}`);
        }
        lines.push(
          ...d.idMismatches.map((mismatch) => {
            const subject = mismatch.field
              ? `${d.table}.${mismatch.field}`
              : d.table;
            return (
              `${subject} — registry has ${mismatch.registryId}, ` +
              `snapshot has ${mismatch.snapshotId}`
            );
          }),
        );
        return lines;
      })
      .join("\n"),
    "Registry and snapshot disagree",
  );
  explain("The registry and the snapshot disagree.", "", [
    "If you edited registry.ts by hand, check the ids against the base.",
    "If the base genuinely changed, run `pnpm devtools airtable apply` and",
    "commit both files it writes alongside the registry change.",
  ]);
  process.exitCode = 1;
}

/**
 * Shared error path, so a thrown Airtable error is never a stack trace.
 *
 * Takes a synchronous action too, for `check`: it makes no request, but a
 * malformed committed snapshot still throws out of `JSON.parse`, and a stack
 * trace is the wrong answer to "somebody hand-edited the file".
 */
export async function runAirtable(
  action: () => void | Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (err) {
    explain("The Airtable command failed.", errorMessage(err), [
      "A 401 or 403 means the token is missing a scope — see",
      "docs/platform/guides/airtable/base-setup.md for the three tokens and",
      "their scopes.",
      "",
      "Note WHICH token these commands pick: the reading ones prefer",
      "AIRTABLE_PLAN_PAT over AIRTABLE_SYNC_PAT, and the plan token carries",
      "schema.bases:read ALONE. So a 403 on a records read means both are set",
      "and the narrow one won — `verify --no-duplicates` reads no records, or",
      "unset AIRTABLE_PLAN_PAT in .env, where it does not belong anyway.",
    ]);
    process.exitCode = 1;
  }
}
