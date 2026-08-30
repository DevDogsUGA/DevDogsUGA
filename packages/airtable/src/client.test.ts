import { describe, expect, it, vi } from "vitest";
import { AirtableClient, AirtableError, BATCH_SIZE } from "./client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function client(fetchImpl: typeof globalThis.fetch) {
  return new AirtableClient({
    baseId: "appX",
    token: "patTEST",
    fetch: fetchImpl,
    // So the backoff test does not actually sleep.
    sleep: async () => {},
  });
}

describe("listRecords", () => {
  it("asks for field IDs, not field names", async () => {
    // returnFieldsByFieldId is response-only. It does NOT make a request body
    // ID-keyed, that is simply allowed. A client that sets the flag and then
    // writes by name reads one way and writes the other, and only notices on
    // the first rename.
    const fetchMock = vi.fn(async () => jsonResponse({ records: [] }));
    await client(fetchMock).listRecords("tbl1");

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("returnFieldsByFieldId=true");
  });

  it("follows pagination to the end", async () => {
    const pages = [
      { records: [{ id: "rec1", fields: {} }], offset: "off1" },
      { records: [{ id: "rec2", fields: {} }] },
    ];
    let call = 0;
    const fetchMock = vi.fn(async () => jsonResponse(pages[call++]!));

    const records = await client(fetchMock).listRecords("tbl1");
    expect(records.map((r) => r.id)).toEqual(["rec1", "rec2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toContain("offset=off1");
  });

  it("sends the token as a bearer credential", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ records: [] }));
    await client(fetchMock).listRecords("tbl1");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer patTEST",
    );
  });
});

describe("upsertRecords", () => {
  it("batches at 10, which is the API's cap rather than a tunable", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ createdRecords: [], updatedRecords: [] }),
    );
    const records = Array.from({ length: 23 }, (_, i) => ({
      fields: { fldId: `u${i}` },
    }));

    await client(fetchMock).upsertRecords("tbl1", ["fldId"], records);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(firstBody.records).toHaveLength(BATCH_SIZE);
  });

  it("sends fieldsToMergeOn, which is what makes it an upsert", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ createdRecords: ["rec1"], updatedRecords: [] }),
    );
    await client(fetchMock).upsertRecords(
      "tbl1",
      ["fldId"],
      [{ fields: { fldId: "u1" } }],
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.performUpsert).toEqual({ fieldsToMergeOn: ["fldId"] });
    // typecast would let Airtable coerce a mistyped value into the column
    // rather than rejecting it, which is exactly the silent failure verify.ts
    // exists to catch at deploy time.
    expect(body.typecast).toBe(false);
  });

  it("counts creates and updates across batches", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        call++ === 0
          ? { createdRecords: ["r1", "r2"], updatedRecords: ["r3"] }
          : { createdRecords: [], updatedRecords: ["r4"] },
      ),
    );
    const records = Array.from({ length: 11 }, (_, i) => ({
      fields: { fldId: `u${i}` },
    }));

    const result = await client(fetchMock).upsertRecords(
      "tbl1",
      ["fldId"],
      records,
    );
    expect(result).toEqual({ created: 2, updated: 2 });
  });
});

describe("rate limiting", () => {
  it("backs off and retries a 429", async () => {
    // The 5 requests/second per-base limit is universal: it does not lift
    // with the plan, so backoff is required at every tier.
    let call = 0;
    const fetchMock = vi.fn(async () =>
      call++ === 0
        ? jsonResponse({ error: "RATE_LIMIT" }, 429)
        : jsonResponse({ records: [] }),
    );

    const records = await client(fetchMock).listRecords("tbl1");
    expect(records).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget rather than looping forever", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: "RATE_LIMIT" }, 429),
    );
    const limited = new AirtableClient({
      baseId: "appX",
      token: "t",
      fetch: fetchMock,
      sleep: async () => {},
      maxRetries: 2,
    });

    await expect(limited.listRecords("tbl1")).rejects.toThrow(AirtableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 422, which retrying cannot fix", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: "INVALID_REQUEST" }, 422),
    );
    await expect(client(fetchMock).listRecords("tbl1")).rejects.toThrow(
      AirtableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
