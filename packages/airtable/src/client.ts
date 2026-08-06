import type { AirtableValue } from "./field.js";

/**
 * A minimal typed wrapper over the Airtable Web API.
 *
 * Deliberately not the official SDK: this integration touches four endpoints,
 * and the parts that need care — the per-base rate limit, `returnFieldsByFieldId`,
 * and batching at exactly 10 records — are the parts a general client hides.
 */

export interface AirtableRecord {
  id: string;
  /** Keyed by FIELD ID, because every read passes returnFieldsByFieldId. */
  fields: Record<string, AirtableValue>;
  createdTime?: string;
}

export interface AirtableClientOptions {
  baseId: string;
  /** Personal access token. Read from Vault — never from .env. */
  token: string;
  fetch?: typeof globalThis.fetch;
  /** Overridable so tests do not sleep. */
  sleep?: (ms: number) => Promise<void>;
  apiUrl?: string;
  maxRetries?: number;
}

export class AirtableError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message?: string,
  ) {
    super(message ?? `Airtable request failed with ${status}: ${body}`);
    this.name = "AirtableError";
  }
}

/**
 * Airtable's write endpoints cap at 10 records per request. Not a tunable —
 * exceeding it is a 422, so it is a property of the API rather than a choice.
 */
export const BATCH_SIZE = 10;

const DEFAULT_API_URL = "https://api.airtable.com/v0";

export class AirtableClient {
  private readonly baseId: string;
  private readonly token: string;
  private readonly doFetch: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly apiUrl: string;
  private readonly maxRetries: number;

  constructor(options: AirtableClientOptions) {
    this.baseId = options.baseId;
    this.token = options.token;
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.apiUrl = options.apiUrl ?? DEFAULT_API_URL;
    this.maxRetries = options.maxRetries ?? 4;
  }

  /**
   * One request, with backoff on 429.
   *
   * The 5 requests/second per-base limit is universal — it does not lift with
   * the plan — so backoff is required at every tier rather than being a
   * politeness for free accounts. Airtable asks for a 30-second wait after a
   * 429; this backs off exponentially from 1s instead, because the limiter is
   * per second and a full 30s stall would make a sync pass take minutes.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let attempt = 0;

    for (;;) {
      const response = await this.doFetch(`${this.apiUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (response.status === 429 && attempt < this.maxRetries) {
        await this.sleep(2 ** attempt * 1000);
        attempt += 1;
        continue;
      }

      if (!response.ok) {
        throw new AirtableError(response.status, await response.text());
      }

      return (await response.json()) as T;
    }
  }

  /**
   * Every record in a table, following pagination.
   *
   * `returnFieldsByFieldId` is response-only — it does NOT make a request body
   * ID-keyed, that is simply allowed. A client that sets the flag and then
   * writes by name reads one way and writes the other, and only notices on the
   * first rename. This client keys both by ID.
   */
  async listRecords(tableId: string): Promise<AirtableRecord[]> {
    const records: AirtableRecord[] = [];
    let offset: string | undefined;

    do {
      const query = new URLSearchParams({ returnFieldsByFieldId: "true" });
      if (offset) query.set("offset", offset);

      const page = await this.request<{
        records: AirtableRecord[];
        offset?: string;
      }>("GET", `/${this.baseId}/${tableId}?${query}`);

      records.push(...page.records);
      offset = page.offset;
    } while (offset);

    return records;
  }

  /**
   * Upsert by a merge key, in batches of 10.
   *
   * `performUpsert.fieldsToMergeOn` is what makes this an upsert rather than a
   * create — and it accepts only a narrow set of field types, which is why the
   * registry constrains `.matchKey()` at the type level.
   */
  async upsertRecords(
    tableId: string,
    mergeOnFieldIds: string[],
    records: { fields: Record<string, AirtableValue> }[],
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const result = await this.request<{
        createdRecords?: string[];
        updatedRecords?: string[];
      }>("PATCH", `/${this.baseId}/${tableId}`, {
        performUpsert: { fieldsToMergeOn: mergeOnFieldIds },
        records: batch,
        typecast: false,
      });

      created += result.createdRecords?.length ?? 0;
      updated += result.updatedRecords?.length ?? 0;
    }

    return { created, updated };
  }

  /** Update specific records by Airtable record id, in batches of 10. */
  async updateRecords(
    tableId: string,
    records: { id: string; fields: Record<string, AirtableValue> }[],
  ): Promise<number> {
    let updated = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const result = await this.request<{ records: AirtableRecord[] }>(
        "PATCH",
        `/${this.baseId}/${tableId}`,
        { records: batch, typecast: false },
      );
      updated += result.records.length;
    }

    return updated;
  }

  /**
   * The base schema, for `verify.ts` and the scaffolder.
   *
   * Purely structural: per field it returns id, name, type, an optional
   * description and type-specific options. There is no permission or
   * editing-restriction data anywhere in it, which is why the field-lockdown
   * step of the runbook can never be verified automatically.
   */
  async getBaseSchema(): Promise<BaseSchema> {
    return this.request("GET", `/meta/bases/${this.baseId}/tables`);
  }

  /**
   * Create a table, with its fields.
   *
   * **The first entry in `fields` becomes the primary field**, which is why the
   * scaffolder passes them in registry declaration order and every table in the
   * registry declares `⚙️ Platform ID` first. Primary fields cannot be links or
   * checkboxes, so the ordering is load-bearing rather than cosmetic.
   */
  async createTable(name: string, fields: NewField[]): Promise<LiveTable> {
    return this.request("POST", `/meta/bases/${this.baseId}/tables`, {
      name,
      fields,
    });
  }

  /**
   * Add one field to an existing table.
   *
   * Separate from `createTable` because link fields cannot be created until the
   * table they point at exists — see `scaffoldBase`, which creates every table
   * without its links and then fills them in.
   */
  async createField(tableId: string, field: NewField): Promise<LiveField> {
    return this.request(
      "POST",
      `/meta/bases/${this.baseId}/tables/${tableId}/fields`,
      field,
    );
  }
}

export interface LiveField {
  id: string;
  name: string;
  type: string;
  options?: Record<string, unknown>;
}

export interface LiveTable {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: LiveField[];
}

export interface BaseSchema {
  tables: LiveTable[];
}

/** A field as the Meta API wants it created. */
export interface NewField {
  name: string;
  type: string;
  options?: Record<string, unknown>;
}
