import { officerChangesTable, type AirtableRecord } from "@devdogsuga/airtable";
import { beforeEach, describe, expect, it, vi } from "vitest";

const processor = vi.hoisted(() => ({
  processOfficerChange: vi.fn(),
}));
vi.mock("./processOfficerChange", () => processor);

const { processPendingOfficerChanges } =
  await import("./processPendingOfficerChanges");

const statusField = officerChangesTable.fields.status.id;

function record(id: string, status?: string): AirtableRecord {
  return {
    id,
    fields: status === undefined ? {} : { [statusField]: status },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  processor.processOfficerChange.mockResolvedValue({
    status: "applied",
    auditEventId: "event-1",
    error: null,
  });
});

describe("processPendingOfficerChanges", () => {
  it("processes only new, pending, and retryable responses", async () => {
    const client = {} as Parameters<typeof processPendingOfficerChanges>[0];
    const records = [
      record("rec00000000000001"),
      record("rec00000000000002", "Pending"),
      record("rec00000000000003", "Retryable"),
      record("rec00000000000004", "Applied"),
      record("rec00000000000005", "Rejected"),
    ];

    const result = await processPendingOfficerChanges(client, records);

    expect(processor.processOfficerChange.mock.calls).toEqual([
      [client, "rec00000000000001"],
      [client, "rec00000000000002"],
      [client, "rec00000000000003"],
    ]);
    expect(result).toEqual({
      attempted: 3,
      applied: 3,
      rejected: 0,
      failed: 0,
      deferred: 0,
    });
  });

  it("isolates a retryable failure and continues with later responses", async () => {
    const client = {} as Parameters<typeof processPendingOfficerChanges>[0];
    processor.processOfficerChange
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({
        status: "rejected",
        auditEventId: null,
        error: "invalid",
      });

    const result = await processPendingOfficerChanges(client, [
      record("rec00000000000001"),
      record("rec00000000000002"),
    ]);

    expect(processor.processOfficerChange).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      attempted: 2,
      applied: 0,
      rejected: 1,
      failed: 1,
      deferred: 0,
    });
  });

  it("bounds work per pass and reports the remainder", async () => {
    const client = {} as Parameters<typeof processPendingOfficerChanges>[0];
    const records = Array.from({ length: 27 }, (_, index) =>
      record(`rec${String(index).padStart(14, "0")}`),
    );

    const result = await processPendingOfficerChanges(client, records);

    expect(processor.processOfficerChange).toHaveBeenCalledTimes(25);
    expect(result).toMatchObject({ attempted: 25, applied: 25, deferred: 2 });
  });
});
