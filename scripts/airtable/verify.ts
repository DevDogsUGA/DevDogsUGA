#!/usr/bin/env tsx
/**
 * `pnpm airtable:verify`
 *
 * Diffs the live base against the registry. Step 7 of the runbook, and a CI
 * gate afterwards. Exits non-zero on any fatal finding, so a base that has
 * drifted fails the build rather than failing the next sync quietly.
 *
 * Also prints the field-lockdown checklist, which is the one protection
 * nothing can verify for us: the base schema response carries no permission
 * data at all, so whether each `⚙️` field is actually locked can only be
 * checked by a human walking the UI.
 */
import { formatVerifyResult, verifyBase } from "@devdogsuga/airtable";
import { baseId, scaffoldClient } from "./client.js";

const skipDuplicates = process.argv.includes("--no-duplicates");

const result = await verifyBase(scaffoldClient(), {
  // Duplicate detection reads every record in every table, which is the
  // expensive part of a verify and pointless on a base with no rows yet.
  checkDuplicates: !skipDuplicates,
});

console.log(`Base ${baseId()}\n`);
console.log(formatVerifyResult(result));

if (result.pushChecklist.length > 0) {
  console.log(
    "\nField editing permissions — set each of these to officer-only in the\n" +
      "Airtable UI. There is no API for this and no way to verify it:\n",
  );
  for (const item of result.pushChecklist) {
    console.log(`  [ ] ${item.table} → ${item.field}`);
  }
}

process.exit(result.ok ? 0 : 1);
