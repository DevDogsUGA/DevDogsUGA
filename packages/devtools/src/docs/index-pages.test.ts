/**
 * `devtools docs index`, which used to be `apps/platform/scripts/index-docs.ts`.
 *
 * The predecessor had no tests — it was a top-level `await main()` in a file
 * with a `process.exit(0)` at the bottom, which is most of why moving it was
 * worth doing. The properties that matter are the two the deploy depends on:
 * it refuses a non-local database unless told, and the delete that makes that
 * refusal necessary is inside the same transaction as the upsert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  indexPages,
  isLocalDatabase,
  runDocsIndex,
  type DocsDb,
  type DocsPage,
} from "./index-pages.js";

const PAGES: DocsPage[] = [
  {
    path: "platform/getting-started",
    title: "Getting started",
    description: "How to begin",
    plainText: "Install the things.",
  },
  {
    path: "platform/env",
    title: "Environment",
    description: null,
    plainText: "One file per target.",
  },
];

/** Records every statement, so the test can assert on transaction shape. */
function recordingDb(fail?: Error): DocsDb & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    async run(query, params) {
      const head = query.trim().split(/\s+/)[0]!.toLowerCase();
      log.push(head);
      if (fail && head === "insert") throw fail;
      // Proves nothing is interpolated: every value arrives as a parameter.
      if (head === "insert") expect(params.length).toBe(PAGES.length * 4);
      return [];
    },
    async end() {
      log.push("end");
    },
  };
}

describe("isLocalDatabase", () => {
  it("recognises the four local hosts", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "[::1]",
      "host.docker.internal",
    ]) {
      expect(
        isLocalDatabase(`postgresql://u:p@${host}:5432/postgres`),
        host,
      ).toBe(true);
    }
  });

  it("treats a real project, and an unparseable string, as non-local", () => {
    expect(
      isLocalDatabase("postgresql://u:p@db.abc.supabase.co:5432/postgres"),
    ).toBe(false);
    expect(isLocalDatabase("not a url")).toBe(false);
  });
});

describe("indexPages", () => {
  it("upserts and deletes inside one transaction", () => {
    const db = recordingDb();
    return indexPages(db, PAGES).then((count) => {
      expect(count).toBe(PAGES.length);
      expect(db.log).toEqual(["begin", "insert", "delete", "commit"]);
    });
  });

  it("rolls back rather than leaving the delete half-applied", async () => {
    const db = recordingDb(new Error("nope"));
    await expect(indexPages(db, PAGES)).rejects.toThrow("nope");
    // No `delete` and no `commit`: the index is left exactly as it was.
    expect(db.log).toEqual(["begin", "insert", "rollback"]);
  });
});

describe("runDocsIndex", () => {
  const DB_URL = process.env.DB_URL;

  // Several of these set a non-zero exit code, which would otherwise fail the
  // whole vitest process on the way out.
  let exitCode: typeof process.exitCode;

  beforeEach(() => {
    exitCode = process.exitCode;
  });

  afterEach(() => {
    if (DB_URL === undefined) delete process.env.DB_URL;
    else process.env.DB_URL = DB_URL;
    process.exitCode = exitCode;
    vi.restoreAllMocks();
  });

  it("writes to a local database without being asked twice", async () => {
    process.env.DB_URL =
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    const db = recordingDb();

    await runDocsIndex({
      connect: () => db,
      load: () => Promise.resolve(PAGES),
    });

    expect(db.log).toEqual(["begin", "insert", "delete", "commit", "end"]);
  });

  /**
   * The property both deploy scripts rely on. Without `--force` and with
   * nobody to ask, a non-local URL must not be written to at all — this is
   * what stands between a contributor's working copy and the live search
   * index, since the delete removes every path the copy does not have.
   */
  it("refuses a non-local database when it cannot ask and was not forced", async () => {
    process.env.DB_URL = "postgresql://u:p@db.abc.supabase.co:5432/postgres";
    const db = recordingDb();
    const wasTty = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });

    try {
      await runDocsIndex({
        connect: () => db,
        load: () => Promise.resolve(PAGES),
      });
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        value: wasTty,
        configurable: true,
      });
    }

    expect(db.log).toEqual([]);
  });

  it("writes to a non-local database when forced", async () => {
    process.env.DB_URL = "postgresql://u:p@db.abc.supabase.co:5432/postgres";
    const db = recordingDb();

    await runDocsIndex({
      force: true,
      connect: () => db,
      load: () => Promise.resolve(PAGES),
    });

    expect(db.log).toEqual(["begin", "insert", "delete", "commit", "end"]);
  });

  it("refuses an empty artifact rather than deleting every row", async () => {
    // The delete is `where path <> all($1)`, so indexing an empty artifact
    // would empty the table. The predecessor guarded this too; it is the one
    // check worth keeping verbatim.
    process.env.DB_URL =
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    const db = recordingDb();

    await runDocsIndex({
      connect: () => db,
      load: () => Promise.resolve([]),
    });

    expect(db.log).toEqual([]);
  });

  it("says what to run when DB_URL is unset", async () => {
    delete process.env.DB_URL;
    const db = recordingDb();

    await runDocsIndex({
      connect: () => db,
      load: () => Promise.resolve(PAGES),
    });

    expect(db.log).toEqual([]);
  });
});
