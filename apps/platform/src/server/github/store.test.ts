// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { saveBackfillPage, saveCommitPage, type Commit } from "./store";

vi.mock("~/server/db", () => ({ db: {} }));

const dialect = new PgDialect();
const SHA = (n: number) => String(n).padStart(40, "0");
const MEMBER = "d2820000-0000-4000-a000-000000000001";

const commit = (n: number, author: Commit["author"]): Commit => ({
  sha: SHA(n),
  author,
  commit: { committer: { date: "2026-10-30T12:00:00Z" }, message: `c${n}` },
});

/**
 * A stand-in for the database: records every statement and answers the lease
 * check and the identity lookup, so the storage policy is tested without one.
 */
function fakeDatabase(members: Record<string, string>) {
  const statements: { text: string; params: unknown[] }[] = [];
  const tx = {
    execute: vi.fn((query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query);
      statements.push({ text, params });
      if (text.includes("for update")) return Promise.resolve([{ ok: 1 }]);
      if (text.includes("from auth.identities")) {
        return Promise.resolve(
          params
            .filter((p): p is string => typeof p === "string" && p in members)
            .map((providerId) => ({ providerId, userId: members[providerId] })),
        );
      }
      return Promise.resolve([]);
    }),
  };
  const database = {
    transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const inserted = (table: string) =>
    statements.filter((s) => s.text.includes(`insert into ${table}`));
  return { database: database as never, inserted, statements };
}

describe("members-only commit storage", () => {
  it("skips commits whose author is not a linked member, writing nothing about them", async () => {
    const { database, inserted, statements } = fakeDatabase({ "100": MEMBER });
    await saveCommitPage(
      "9",
      "lease",
      "main",
      [
        commit(1, { id: 100, login: "member" }),
        commit(2, { id: 200, login: "stranger" }),
        commit(3, null),
      ],
      2,
      database,
    );
    const commits = inserted("platform.commits");
    expect(commits).toHaveLength(1);
    expect(commits[0]!.params).toContain(SHA(1));
    expect(commits[0]!.params).toContain(MEMBER);
    expect(inserted('platform."repoCommits"')).toHaveLength(1);
    // The non-member's id and login never reach a write.
    const everything = JSON.stringify(statements.map((s) => s.params));
    expect(everything).not.toContain("stranger");
    expect(everything).not.toContain(SHA(2));
    expect(everything).not.toContain(SHA(3));
  });

  it("looks the author up by numeric id only, never login or email", async () => {
    const { database, statements } = fakeDatabase({ "100": MEMBER });
    await saveCommitPage(
      "9",
      "lease",
      "main",
      [commit(1, { id: 100, login: "member" })],
      2,
      database,
    );
    const lookup = statements.find((s) =>
      s.text.includes("from auth.identities"),
    )!;
    expect(lookup.text).toContain("provider_id in");
    expect(lookup.text).not.toMatch(/user_name|email/);
    expect(lookup.params).toEqual(["100"]);
  });

  it("does not look anything up for a page with no attributed authors", async () => {
    const { database, statements } = fakeDatabase({});
    await saveCommitPage("9", "lease", "main", [commit(1, null)], 2, database);
    expect(
      statements.some((s) => s.text.includes("from auth.identities")),
    ).toBe(false);
  });

  it("skips a malformed entry rather than failing the page", async () => {
    const { database, inserted } = fakeDatabase({ "100": MEMBER });
    const author = { id: 100, login: "member" };
    await saveCommitPage(
      "9",
      "lease",
      "main",
      [
        { ...commit(1, author), sha: "not-a-sha" },
        {
          ...commit(2, author),
          commit: { committer: undefined, message: "x" },
        } as never,
        commit(3, author),
      ],
      2,
      database,
    );
    expect(inserted("platform.commits")).toHaveLength(1);
  });

  it("writes commits with insert-only identity", async () => {
    const { database, inserted } = fakeDatabase({ "100": MEMBER });
    await saveCommitPage(
      "9",
      "lease",
      "main",
      [commit(1, { id: 100, login: "member" })],
      2,
      database,
    );
    expect(inserted("platform.commits")[0]!.text).toContain(
      "on conflict (sha) do nothing",
    );
    expect(inserted('platform."repoCommits"')[0]!.text).toContain(
      "on conflict do nothing",
    );
  });

  it("stores backfill pages through the same member policy", async () => {
    const { database, inserted } = fakeDatabase({ "100": MEMBER });
    const stored = await saveBackfillPage(
      {
        userId: MEMBER,
        githubId: "100",
        requestedAt: "2026-10-31 00:00:00+00",
        leaseToken: "t",
      },
      "9",
      "main",
      [
        commit(1, { id: 100, login: "member" }),
        commit(2, { id: 200, login: "stranger" }),
      ],
      database,
    );
    expect(stored).toBe(true);
    expect(inserted("platform.commits")).toHaveLength(1);
  });
});
