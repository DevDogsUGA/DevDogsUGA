/**
 * Unit tests for `refreshSessionEnv`, the fix for BUG 2: `process.env` used
 * to keep whatever it held at launch for the rest of a wizard session, even
 * after `db start`/`stop`/`restart` wrote or deleted `.env.generated` out
 * from under it. See `session-refresh.ts`'s header.
 *
 * `deployEnv`/`enterEnvironment` are both injectable, so no test here
 * touches the real `process.env` or loads a real env file.
 */
import { describe, expect, it, vi } from "vitest";
import { refreshSessionEnv } from "./session-refresh.js";

describe("refreshSessionEnv", () => {
  it("re-enters development and reports it when the process is on development", async () => {
    const enterEnvironment = vi.fn().mockResolvedValue({
      files: [".env.generated", ".env"],
      warnings: [],
      environment: { DB_URL: "postgresql://fresh-local-stack" },
    });

    const lines = await refreshSessionEnv({
      deployEnv: "development",
      enterEnvironment,
    });

    expect(enterEnvironment).toHaveBeenCalledWith("development", {
      override: true,
    });
    expect(lines).toEqual([expect.stringContaining(".env.generated")]);
  });

  it("treats an unset DEPLOY_ENV the same as development", async () => {
    const enterEnvironment = vi.fn().mockResolvedValue({
      files: [],
      warnings: [],
      environment: {},
    });

    const lines = await refreshSessionEnv({
      deployEnv: undefined,
      enterEnvironment,
    });

    expect(enterEnvironment).toHaveBeenCalledWith("development", {
      override: true,
    });
    expect(lines).toHaveLength(1);
  });

  it("never re-enters when the process is on a deployed tier", async () => {
    const enterEnvironment = vi.fn();

    const lines = await refreshSessionEnv({
      deployEnv: "production",
      enterEnvironment,
    });

    expect(enterEnvironment).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });

  it("never re-enters for staging either", async () => {
    const enterEnvironment = vi.fn();

    const lines = await refreshSessionEnv({
      deployEnv: "staging",
      enterEnvironment,
    });

    expect(enterEnvironment).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });
});
