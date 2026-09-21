/**
 * Unit tests for the session-database resolver.
 *
 * Everything is injected through `env`, and refusals are asserted through a
 * captured stderr: the resolver's contract is "reason on stderr, `null`
 * back", so a test that only checked `null` would pass while the reason —
 * the part a human acts on — regressed to noise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeDbTarget,
  isLocalConnection,
  isLocalDbUrl,
  resolveDbConnection,
} from "./connection.js";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const POOLER_URL =
  "postgresql://user:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

let stderr: string;
let write: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stderr = "";
  write = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown) => {
      stderr += String(chunk);
      return true;
    });
});

afterEach(() => {
  write.mockRestore();
});

describe("isLocalDbUrl", () => {
  it("recognises the loopback spellings and rejects hosted ones", () => {
    expect(isLocalDbUrl(LOCAL_URL)).toBe(true);
    expect(isLocalDbUrl("postgresql://u:p@localhost:5432/db")).toBe(true);
    expect(isLocalDbUrl(POOLER_URL)).toBe(false);
    expect(isLocalDbUrl("not a url")).toBe(false);
  });
});

describe("resolveDbConnection: development", () => {
  it("resolves the local stack from an entered overlay", () => {
    const conn = resolveDbConnection({
      env: { DEPLOY_ENV: "development", DB_URL: LOCAL_URL },
    });
    expect(conn).toEqual({
      tier: "development",
      devDatabase: undefined,
      dbUrl: LOCAL_URL,
      projectRef: undefined,
    });
    expect(isLocalConnection(conn!)).toBe(true);
    expect(describeDbTarget(conn!)).toBe("your local database");
  });

  it("treats an unset DEPLOY_ENV as development", () => {
    const conn = resolveDbConnection({ env: { DB_URL: LOCAL_URL } });
    expect(conn?.tier).toBe("development");
  });

  it("refuses a missing DB_URL, pointing at db start and the session vocabulary", () => {
    expect(
      resolveDbConnection({ env: { DEPLOY_ENV: "development" } }),
    ).toBeNull();
    expect(stderr).toMatch(/devtools db start/);
    expect(stderr).toMatch(/--tier development:remote/);
  });

  /**
   * ⚠️ The guard this module exists for: a developer's `.env` may carry a
   * HOSTED DB_URL (a real machine in this repo does), and with the stack
   * down that value is what a raw `process.env.DB_URL` read would hand to
   * `db reset`. A local-meaning session must refuse it, never use it.
   */
  it("refuses a hosted DB_URL when the session means the local stack", () => {
    for (const devDb of [undefined, "local"]) {
      stderr = "";
      const conn = resolveDbConnection({
        env: {
          DEPLOY_ENV: "development",
          ...(devDb === undefined ? {} : { DEV_DB: devDb }),
          DB_URL: POOLER_URL,
        },
      });
      expect(conn, `DEV_DB=${devDb ?? "(unset)"}`).toBeNull();
      expect(stderr).toMatch(/aws-1-us-east-1\.pooler\.supabase\.com/);
      expect(stderr).toMatch(/--tier development:remote/);
      // The reason names the host, never the URL — it carries the password.
      expect(stderr).not.toContain("secret");
    }
  });

  it("accepts a hosted DB_URL when the session says development:remote", () => {
    const conn = resolveDbConnection({
      env: {
        DEPLOY_ENV: "development",
        DEV_DB: "remote",
        DB_URL: POOLER_URL,
        PROJECT_REF: "abc123",
      },
    });
    expect(conn).toEqual({
      tier: "development",
      devDatabase: "remote",
      dbUrl: POOLER_URL,
      projectRef: "abc123",
    });
    expect(isLocalConnection(conn!)).toBe(false);
    expect(describeDbTarget(conn!)).toBe(
      "the remote development database at aws-1-us-east-1.pooler.supabase.com",
    );
  });

  it("refuses an unrecognised DEV_DB by name", () => {
    expect(
      resolveDbConnection({
        env: { DEPLOY_ENV: "development", DEV_DB: "docker", DB_URL: LOCAL_URL },
      }),
    ).toBeNull();
    expect(stderr).toMatch(/DEV_DB="docker"/);
  });
});

describe("resolveDbConnection: deployed tiers", () => {
  it("resolves a deployed tier's DB_URL and PROJECT_REF", () => {
    const conn = resolveDbConnection({
      env: { DEPLOY_ENV: "staging", DB_URL: POOLER_URL, PROJECT_REF: "ref-1" },
    });
    expect(conn).toEqual({
      tier: "staging",
      devDatabase: undefined,
      dbUrl: POOLER_URL,
      projectRef: "ref-1",
    });
    expect(describeDbTarget(conn!)).toBe("the staging database");
  });

  it("refuses a missing DB_URL, naming the tier's file", () => {
    expect(
      resolveDbConnection({ env: { DEPLOY_ENV: "production" } }),
    ).toBeNull();
    expect(stderr).toMatch(/\.env\.production has no DB_URL/);
  });

  /**
   * The `override: false` inheritance case `launch.ts` documents: a session
   * that entered staging from inside a development `with-env` can keep the
   * parent's loopback DB_URL. "Migrate staging" against a local container
   * would report success against the wrong database.
   */
  it("refuses a loopback DB_URL under a deployed tier as inherited values", () => {
    expect(
      resolveDbConnection({
        env: { DEPLOY_ENV: "staging", DB_URL: LOCAL_URL },
      }),
    ).toBeNull();
    expect(stderr).toMatch(/inherited development values/);
    expect(stderr).toMatch(/--tier staging/);
  });

  it("refuses an unrecognised DEPLOY_ENV rather than guessing", () => {
    expect(
      resolveDbConnection({
        env: { DEPLOY_ENV: "prod", DB_URL: POOLER_URL },
      }),
    ).toBeNull();
    expect(stderr).toMatch(/DEPLOY_ENV="prod"/);
  });

  it("ignores DEV_DB outside development — the propagated variable is dev-only", () => {
    const conn = resolveDbConnection({
      env: { DEPLOY_ENV: "staging", DEV_DB: "local", DB_URL: POOLER_URL },
    });
    expect(conn?.devDatabase).toBeUndefined();
  });
});

describe("resolveDbConnection: quiet mode", () => {
  it("suppresses the stderr reason but still returns null", () => {
    expect(
      resolveDbConnection({
        env: { DEPLOY_ENV: "development" },
        quiet: true,
      }),
    ).toBeNull();
    expect(stderr).toBe("");
  });
});
