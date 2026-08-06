#!/usr/bin/env tsx
/**
 * `pnpm airtable:pull-ids`
 *
 * Reads the live base and writes the discovered table and field IDs into
 * `registry.ts`. Step 5 of the runbook in docs/platform/airtable-setup.md.
 *
 * After this runs, the IDs are SOURCE: they are what every read and write goes
 * over the wire with, and what lets an officer rename a column without
 * breaking the sync. The file it produces is committed.
 *
 * Refuses to write a partial result. A registry half in placeholders and half
 * in real IDs verifies as fatal anyway, but it also looks finished at a glance,
 * which is worse than looking untouched.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverIds, isPlaceholder } from "@devdogsuga/airtable";
import { baseId, scaffoldClient } from "./client.js";

const REGISTRY = join(
  import.meta.dirname,
  "../../packages/airtable/src/registry.ts",
);

/**
 * The header section that describes the not-yet-scaffolded state, and what
 * replaces it once it is no longer true.
 *
 * Rewritten rather than left alone because the old text opens with "Every `id`
 * below is a PLACEHOLDER" — a comment that survives its own subject is worse
 * than no comment, since the next reader has no reason to doubt it.
 */
const HEADER_PLACEHOLDER_SECTION = ` * ## Field IDs are placeholders until the base exists
 *
 * Every \`id\` below is a PLACEHOLDER. The base has not been scaffolded yet, and
 * the bootstrapping order is deliberately circular-looking:
 *
 *   1. \`scaffold.ts\` reads the shape below — table names, field names, types —
 *      and creates what is missing through the Meta API.
 *   2. It reads the schema back and prints the real field IDs.
 *   3. \`pull-ids.ts\` writes them in here, and the result is committed.
 *
 * After that first run the IDs are source. \`verify.ts\` FAILS on any remaining
 * placeholder rather than warning, because a placeholder that reaches a live
 * sync writes into nothing and reports success.
 */`;

const HEADER_REAL_SECTION = ` * ## The IDs below are real, and are the wire format
 *
 * Written by \`pull-ids.ts\` from the live base. Every read and write goes over
 * the wire with these rather than with field NAMES, which is what lets an
 * officer rename a column without breaking the sync.
 *
 * To add a field: declare it here with a \`todo("slug")\` id, run
 * \`pnpm airtable:scaffold\` to create it, then \`pnpm airtable:pull-ids\` to fill
 * the real id in. \`verify.ts\` FAILS on any remaining placeholder rather than
 * warning, because a placeholder that reaches a live sync writes into nothing
 * and reports success.
 */`;

const client = scaffoldClient();
const { tables } = await client.getBaseSchema();
const found = discoverIds(tables);

if (found.missing.length > 0) {
  console.error(`Base ${baseId()} is missing:\n`);
  for (const m of found.missing) console.error(`  ${m}`);
  console.error("\nRun `pnpm airtable:scaffold` first.");
  process.exit(1);
}

let source = await readFile(REGISTRY, "utf8");
let replaced = 0;

/** `fldTODO_members_uga_email` -> the slug `todo()` was called with. */
function slugOf(placeholder: string): string {
  return placeholder.replace(/^(fld|tbl)TODO_/, "");
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Only the placeholders. Every already-resolved entry maps its own real id to
// itself, and warning about those made adding ONE table print six complaints
// about the six that were already fine.
for (const [placeholder, real] of Object.entries(found.fields)) {
  if (!isPlaceholder(placeholder)) continue;
  const call = new RegExp(`todo\\("${escape(slugOf(placeholder))}"\\)`, "g");
  const before = source;
  source = source.replace(call, `"${real}"`);
  if (source !== before) replaced += 1;
  else console.warn(`  no todo("${slugOf(placeholder)}") call to replace`);
}

for (const [placeholder, real] of Object.entries(found.tables)) {
  if (!isPlaceholder(placeholder)) continue;
  const call = new RegExp(
    `todoTable\\("${escape(slugOf(placeholder))}"\\)`,
    "g",
  );
  const before = source;
  source = source.replace(call, `"${real}"`);
  if (source !== before) replaced += 1;
  else console.warn(`  no todoTable("${slugOf(placeholder)}") call to replace`);
}

// The helpers stay -- adding a field later uses them again. The header does
// not: it opens by telling the reader that every ID below is fake, and a
// comment that outlives its own subject is worse than no comment at all.
if (source.includes(HEADER_PLACEHOLDER_SECTION)) {
  source = source.replace(HEADER_PLACEHOLDER_SECTION, HEADER_REAL_SECTION);
} else if (replaced > 0 && !/\btodo(Table)?\(/.test(source)) {
  console.warn(
    "\nThe registry header no longer matches the text this script rewrites.\n" +
      "Check that it does not still claim the IDs are placeholders.",
  );
}

await writeFile(REGISTRY, source);

console.log(
  `Wrote ${replaced} ID(s) into packages/airtable/src/registry.ts from ${baseId()}.`,
);
console.log("\nNext:");
console.log("  pnpm prettier --write packages/airtable/src/registry.ts");
console.log("  pnpm airtable:verify");
console.log("  git add packages/airtable/src/registry.ts && git commit");
