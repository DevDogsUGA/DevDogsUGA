/**
 * Unit tests for `resolveLocalToolingEnv`, the fix for BUG 1: `db introspect`
 * and `db migration generate` used to parse `.env` directly with raw
 * `dotenv` and merge it OVER `process.env`, bypassing `.env.generated` and
 * inverting precedence against whatever tier `launch.ts` had already
 * entered. See `local-env.ts`'s header.
 *
 * `processEnv`/`loadEnvironment` are both injectable, so no test here
 * touches the real filesystem, the real `process.env`, or opens a real TCP
 * probe.
 */
import { describe, expect, it, vi } from "vitest";
import {
  MissingEnvFileError,
  type LoadedEnvironment,
} from "@devdogsuga/env/load";
import { resolveLocalToolingEnv } from "./local-env.js";

describe("resolveLocalToolingEnv", () => {
  it("returns process.env unchanged when a tier was already entered", async () => {
    const loadEnvironment = vi.fn();
    const processEnv = {
      DEPLOY_ENV: "development",
      DB_URL: "postgresql://local-stack",
      PATH: "/usr/bin",
    };

    const env = await resolveLocalToolingEnv({ processEnv, loadEnvironment });

    expect(env).toBe(processEnv);
    expect(loadEnvironment).not.toHaveBeenCalled();
  });

  it("returns process.env unchanged for an entered deployed tier too", async () => {
    const loadEnvironment = vi.fn();
    const processEnv = {
      DEPLOY_ENV: "staging",
      DB_URL: "postgresql://staging",
    };

    const env = await resolveLocalToolingEnv({ processEnv, loadEnvironment });

    expect(env).toBe(processEnv);
    expect(loadEnvironment).not.toHaveBeenCalled();
  });

  it("falls back to loadEnvironment('development') when no tier was entered", async () => {
    const processEnv = { PATH: "/usr/bin" }; // no DEPLOY_ENV: launch.ts never ran
    const loaded: LoadedEnvironment = {
      environment: "development",
      files: [".env.generated", ".env"],
      env: { DB_URL: "postgresql://local-stack", PATH: "/usr/bin" },
      warnings: [],
    };
    const loadEnvironment = vi.fn().mockResolvedValue(loaded);

    const env = await resolveLocalToolingEnv({ processEnv, loadEnvironment });

    expect(loadEnvironment).toHaveBeenCalledWith("development");
    expect(env).toBe(loaded.env);
    expect(env.DB_URL).toBe("postgresql://local-stack");
  });

  it("treats an empty DEPLOY_ENV the same as unset", async () => {
    const processEnv = { DEPLOY_ENV: "" };
    const loaded: LoadedEnvironment = {
      environment: "development",
      files: [".env"],
      env: { DB_URL: "postgresql://local-stack" },
      warnings: [],
    };
    const loadEnvironment = vi.fn().mockResolvedValue(loaded);

    const env = await resolveLocalToolingEnv({ processEnv, loadEnvironment });

    expect(loadEnvironment).toHaveBeenCalledWith("development");
    expect(env).toBe(loaded.env);
  });

  it("propagates MissingEnvFileError from the fallback rather than swallowing it", async () => {
    const processEnv = {};
    const loadEnvironment = vi
      .fn()
      .mockRejectedValue(new MissingEnvFileError("development", ".env"));

    await expect(
      resolveLocalToolingEnv({ processEnv, loadEnvironment }),
    ).rejects.toBeInstanceOf(MissingEnvFileError);
  });
});
