#!/usr/bin/env tsx
/**
 * `pnpm airtable:scaffold [--dry-run]`
 *
 * Creates whatever the registry declares and the base does not have. Step 4 of
 * the runbook in docs/platform/airtable-setup.md.
 *
 * Idempotent: run it again after adding a field to the registry and it creates
 * that one field. Run it against a finished base and it does nothing.
 */
import { discoverIds, registry, scaffoldBase } from "@devdogsuga/airtable";
import type { TableSpec } from "@devdogsuga/airtable";
import { baseId, scaffoldClient } from "./client.js";

const dryRun = process.argv.includes("--dry-run");
const client = scaffoldClient();

const specs = registry as unknown as Record<string, TableSpec>;

if (dryRun) {
  // Reads the base and reports the diff without writing. Worth having because
  // the first real run is against a base somebody cares about, and "what would
  // this do" is the question they will actually ask.
  const { tables } = await client.getBaseSchema();
  console.log(`Base ${baseId()} has ${tables.length} table(s).\n`);

  for (const spec of Object.values(specs)) {
    const live =
      tables.find((t) => t.id === spec.id) ??
      tables.find((t) => t.name === spec.name);

    if (!live) {
      const n = Object.keys(spec.fields).length;
      console.log(`+ table ${spec.name} (${n} fields)`);
      continue;
    }

    const missing = Object.values(spec.fields).filter(
      (f) => !live.fields.some((lf) => lf.id === f.id || lf.name === f.name),
    );
    console.log(
      missing.length === 0
        ? `  ${spec.name} — up to date`
        : `  ${spec.name} — ${missing.length} field(s) to add`,
    );
    for (const f of missing) console.log(`    + ${f.name} (${f.type})`);
  }
  process.exit(0);
}

console.log(`Scaffolding ${baseId()}...\n`);

const result = await scaffoldBase(client, { log: (m) => console.log(m) });

console.log(
  `\nCreated ${result.created.filter((c) => c.kind === "table").length} table(s)` +
    ` and ${result.created.filter((c) => c.kind === "field").length} field(s).`,
);

const found = discoverIds(result.schema);
if (found.missing.length > 0) {
  console.error("\nStill missing after scaffolding:");
  for (const m of found.missing) console.error(`  ${m}`);
  console.error(
    "\nThis is a bug in the scaffolder or a field Airtable refused. Do not run pull-ids.",
  );
  process.exit(1);
}

// The reverse side of every link the scaffolder made. Airtable creates these
// automatically and never mentions them in a create response, so they would
// otherwise first appear as a surprise in `verify.ts` output.
const extra = result.schema.flatMap((live) => {
  const spec = Object.values(specs).find(
    (s) => s.id === live.id || s.name === live.name,
  );
  if (!spec) return [];
  const known = new Set(Object.values(spec.fields).map((f) => f.name));
  const knownIds = new Set(Object.values(spec.fields).map((f) => f.id));
  return live.fields
    .filter((f) => !known.has(f.name) && !knownIds.has(f.id))
    .map((f) => `${live.name}.${f.name} (${f.type})`);
});

if (extra.length > 0) {
  console.log("\nFields in the base that the registry does not declare:");
  for (const e of extra) console.log(`  ${e}`);
  console.log(
    "\nExpected for link fields — Airtable creates the reverse side of every\n" +
      "link automatically. verify.ts reports these rather than failing on them.",
  );
}

console.log("\nNext: pnpm airtable:pull-ids, then commit registry.ts.");
