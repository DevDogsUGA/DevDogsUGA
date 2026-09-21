import {
  officerChangesTable,
  type AirtableClient,
  type AirtableRecord,
} from "@devdogsuga/airtable";
import { processOfficerChange } from "./processOfficerChange";

const MAX_CHANGES_PER_PASS = 25;

export interface OfficerChangeProcessingCounts {
  attempted: number;
  applied: number;
  rejected: number;
  failed: number;
  deferred: number;
}

/**
 * Applies form responses the shared scheduled/manual sync already fetched.
 *
 * Blank is the normal state of a brand-new response. Pending covers a worker
 * that stopped after pinning its receipt, while Retryable covers an explicit
 * transient failure. Applied and Rejected are terminal and must never be
 * reinterpreted from their mutable Airtable cells.
 *
 * Failures are isolated per response so one unavailable dependency cannot
 * starve later commands or the rest of the sync. `processOfficerChange`
 * records the retryable receipt before throwing; the status projection later
 * in the same pass mirrors that receipt back to Airtable.
 */
export async function processPendingOfficerChanges(
  client: AirtableClient,
  records: AirtableRecord[],
): Promise<OfficerChangeProcessingCounts> {
  const candidates = records.filter(isProcessable);
  const batch = candidates.slice(0, MAX_CHANGES_PER_PASS);
  const counts: OfficerChangeProcessingCounts = {
    attempted: 0,
    applied: 0,
    rejected: 0,
    failed: 0,
    deferred: candidates.length - batch.length,
  };

  for (const record of batch) {
    counts.attempted += 1;
    try {
      const result = await processOfficerChange(client, record.id);
      if (result.status === "rejected") counts.rejected += 1;
      else counts.applied += 1;
    } catch (error) {
      counts.failed += 1;
      // Command fields can contain member data. The record id and error class
      // are enough to correlate a retry without serializing the response.
      console.error("[airtable] officer change will be retried", {
        recordId: record.id,
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  return counts;
}

function isProcessable(record: AirtableRecord): boolean {
  const status = record.fields[officerChangesTable.fields.status.id];
  return (
    status === undefined ||
    status === null ||
    status === "" ||
    status === "Pending" ||
    status === "Retryable"
  );
}
