import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  auditEvents,
  projectOwners,
  projectReports,
  projects,
} from "~/server/db/schema";

/**
 * A scripted stand-in for the transaction the project store and the report
 * writes use, so their orchestration can be unit-tested without a database.
 * The real constraints and triggers are proved in `projects.db-test.ts`.
 *
 * `execute` answers by substring of the SQL text (first match wins); the typed
 * `select` chains answer from `project`, `owners` and `report`. Every write is
 * recorded in `calls`.
 */
export type Row = Record<string, unknown>;

export interface Fixture {
  project: Row | null;
  owners: string[];
  report: Row | null;
  /** `[needle, rows]`: the rows `execute` returns for SQL containing the needle. */
  execute: [string, Row[]][];
  /** Throw this from the first insert into `projects` or `projectReportCommits`. */
  failInsert?: Error;
}

export interface Call {
  kind: "insert" | "update" | "delete" | "execute";
  table?: string;
  values?: Row;
  text?: string;
  params?: unknown[];
}

const dialect = new PgDialect();

const tableName = (table: unknown) =>
  table === projects
    ? "projects"
    : table === projectOwners
      ? "projectOwners"
      : table === projectReports
        ? "projectReports"
        : table === auditEvents
          ? "auditEvents"
          : "other";

export function fakeDb(fixture: Fixture) {
  const calls: Call[] = [];
  let failed = false;
  const tx = {
    select: () => ({
      from: (table: unknown) => {
        const name = tableName(table);
        const rows = () =>
          name === "projects"
            ? fixture.project
              ? [fixture.project]
              : []
            : name === "projectOwners"
              ? fixture.owners.map((userId) => ({ userId }))
              : name === "projectReports"
                ? fixture.report
                  ? [fixture.report]
                  : []
                : [];
        const chain = {
          where: () => chain,
          for: () => chain,
          then: (
            resolve: (rows: Row[]) => unknown,
            reject: (error: unknown) => unknown,
          ) => Promise.resolve(rows()).then(resolve, reject),
        };
        return chain;
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Row) => {
        const name = tableName(table);
        if (fixture.failInsert && !failed && name === "projects") {
          failed = true;
          const error = fixture.failInsert;
          const boom = () => Promise.reject(error);
          return {
            returning: boom,
            then: (
              resolve: (rows: Row[]) => unknown,
              reject: (error: unknown) => unknown,
            ) => boom().then(resolve, reject),
          };
        }
        calls.push({ kind: "insert", table: name, values });
        return Object.assign(Promise.resolve([]), {
          returning: () => Promise.resolve([{ id: "new-id" }]),
        });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Row) => ({
        where: () => {
          calls.push({ kind: "update", table: tableName(table), values });
          return Promise.resolve([]);
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        calls.push({ kind: "delete", table: tableName(table) });
        return Promise.resolve([]);
      },
    }),
    execute: (query: SQL) => {
      const { sql, params } = dialect.sqlToQuery(query);
      calls.push({ kind: "execute", text: sql, params });
      if (
        fixture.failInsert &&
        !failed &&
        sql.includes('insert into platform."projectReportCommits"')
      ) {
        failed = true;
        return Promise.reject(fixture.failInsert);
      }
      const hit = fixture.execute.find(([needle]) => sql.includes(needle));
      return Promise.resolve(hit ? hit[1] : []);
    },
  };
  const db = {
    transaction: <T>(work: (tx: unknown) => Promise<T>) => work(tx),
    execute: tx.execute,
  };
  return {
    db,
    calls,
    /** The audit actions written, in order. */
    audits: () =>
      calls
        .filter((c) => c.kind === "insert" && c.table === "auditEvents")
        .map((c) => c.values?.action),
    /** Writes to one table, of one kind. */
    writes: (kind: Call["kind"], table: string) =>
      calls.filter((c) => c.kind === kind && c.table === table),
    /** `execute` calls whose SQL contains the text. */
    ran: (needle: string) =>
      calls.filter((c) => c.kind === "execute" && c.text?.includes(needle)),
  };
}
