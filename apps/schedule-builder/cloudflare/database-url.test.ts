import { describe, expect, it } from "vitest";
import { resolveWorkflowDatabaseUrl } from "./database-url";

describe("resolveWorkflowDatabaseUrl", () => {
  it("uses Hyperdrive when the binding exists", () => {
    expect(
      resolveWorkflowDatabaseUrl({
        DEPLOY_ENV: "production",
        HYPERDRIVE: { connectionString: "postgres://hyperdrive/pool" },
      }),
    ).toBe("postgres://hyperdrive/pool");
  });

  it("uses DB_URL for local wrangler development", () => {
    expect(
      resolveWorkflowDatabaseUrl({
        DEPLOY_ENV: "development",
        DB_URL: "postgres://local/database",
      }),
    ).toBe("postgres://local/database");
  });

  it("explains how to supply a missing local database URL", () => {
    expect(() =>
      resolveWorkflowDatabaseUrl({ DEPLOY_ENV: "development" }),
    ).toThrow(/devtools.*--env-file/);
  });
});
