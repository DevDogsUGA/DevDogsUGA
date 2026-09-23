import {
  applyPull,
  platformSettingsTable as settingsSpec,
  type AirtableRecord,
} from "@devdogsuga/airtable";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { reflectionSettings } from "~/server/db/schema";
import type { Refusal } from "./refusals";

/**
 * The pull half of the sync: Airtable is the CMS for what remains, so this is
 * where officer edits become platform rows.
 *
 * Meetings, workshops and projects lost their pulls with the config-as-code
 * cutover, and competitions lost theirs with the git-native competitions
 * rework -- see `server/config/reconcile.ts` and `server/github/competitions.ts`,
 * which replaced them. `server/config/reconcile.ts` ports the same two
 * properties this file used to carry for all four tables:
 *
 *   * **Identity is a stable id, never the name or slug.** For config it is
 *     the authored `configId`; a competition's is its GitHub issue node id.
 *
 *   * **A missing record is an archive, never a delete.** Attendance is a
 *     record of who was in a room on a Tuesday, and no amount of "I deleted
 *     the wrong row" erases that.
 *
 * This file is now scoped to the one settings singleton Airtable still
 * authors.
 */

export interface PullCounts {
  upserted: number;
  archived: number;
  skipped: number;
}

export interface PullOutcome extends PullCounts {
  refusals: Refusal[];
  /** Airtable record id → platform uuid, for the tables downstream of this one. */
  idMap: Map<string, string>;
}

/** Pulls the one globally configurable reflection policy row. */
export async function pullReflectionSettings(
  records: AirtableRecord[],
): Promise<PullOutcome> {
  const out = emptyOutcome();
  const parsed = applyPull<{
    minimumWordCount: number | null;
    submissionWindowDays: number | null;
  }>(settingsSpec, records).find(
    (record) => record.platformId === "reflection-policy",
  );
  if (!parsed) {
    out.skipped += 1;
    return out;
  }
  out.idMap.set(parsed.airtableRecordId, "reflection-policy");
  const invalid = [
    parsed.values.minimumWordCount === null ? "Minimum words" : null,
    parsed.values.submissionWindowDays === null
      ? "Submission window days"
      : null,
  ].filter((value): value is string => value !== null);
  if (invalid.length > 0) {
    out.skipped += 1;
    out.refusals.push({
      table: "platformSettings",
      airtableRecordId: parsed.airtableRecordId,
      code: "reflection_settings_invalid",
      message: `${invalid.join(" and ")} must be positive whole numbers. The previous global reflection policy is still active.`,
    });
    return out;
  }
  await db
    .update(reflectionSettings)
    .set({
      minimumWordCount: parsed.values.minimumWordCount!,
      submissionWindowDays: parsed.values.submissionWindowDays!,
      airtableRecordId: parsed.airtableRecordId,
      updatedAt: new Date(),
    })
    .where(eq(reflectionSettings.id, true));
  out.upserted += 1;
  return out;
}

function emptyOutcome(): PullOutcome {
  return {
    upserted: 0,
    archived: 0,
    skipped: 0,
    refusals: [],
    idMap: new Map(),
  };
}
