/**
 * Unit tests for `resolveRemoteConnection`, the resolver that decides which
 * hosted database `--target remote` means.
 *
 * ⚠️ SAFETY-CRITICAL surface: this backs `db reset --target remote`, which
 * drops and re-migrates whatever it resolves to. Every seam
 * (`available`/`deployEnv`/`isTTY`/`prompt`/`loadEnvironment`) is injectable
 * for exactly this file, mirroring `tier.test.ts`: no test here touches the
 * real filesystem, `process.stdin`, a real terminal, or the real `DEPLOY_ENV`
 * — except deliberately, and always restored, for `process.env` itself,
 * because entering the resolved tier into `process.env` is part of the
 * contract under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MissingEnvFileError,
  type LoadedEnvironment,
} from "@devdogsuga/env/load";
import { resolveRemoteConnection } from "./remote.js";

/** A `loadEnvironment` double keyed by tier, standing in for real env files. */
function fakeLoadEnvironment(
  envByTier: Record<string, Record<string, string>>,
) {
  return vi.fn(async (tier?: string): Promise<LoadedEnvironment> => {
    const env = tier ? envByTier[tier] : undefined;
    if (!env) {
      throw new MissingEnvFileError(
        tier as never,
        `.env.${tier ?? "development"}`,
      );
    }
    return { environment: tier as never, files: [], env, warnings: [] };
  });
}

describe("resolveRemoteConnection", () => {
  // `process.env` is genuinely mutated on success — that is the point of
  // "entering the tier" — so every test starts and ends from the same
  // snapshot rather than leaking into its neighbours.
  let saved: NodeJS.ProcessEnv;
  beforeEach(() => {
    saved = { ...process.env };
  });
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  });

  it("resolves an explicit --tier, loading and entering it", async () => {
    const loadEnvironment = fakeLoadEnvironment({
      staging: { DB_URL: "postgresql://staging-db", PROJECT_REF: "stg123" },
    });
    delete process.env.DEPLOY_ENV;

    const result = await resolveRemoteConnection(["--tier", "staging"], {
      label: "devtools db test",
      loadEnvironment,
    });

    expect(result).toEqual({
      tier: "staging",
      dbUrl: "postgresql://staging-db",
      projectRef: "stg123",
    });
    expect(loadEnvironment).toHaveBeenCalledWith("staging", { override: true });
    // Entered: downstream code (e.g. `db introspect`) reading process.env
    // sees the SAME database this just resolved.
    expect(process.env.DB_URL).toBe("postgresql://staging-db");
    expect(process.env.PROJECT_REF).toBe("stg123");
    expect(process.env.DEPLOY_ENV).toBe("staging");
  });

  it("rejects --tier development and never loads or prompts", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const loadEnvironment = vi.fn();
    const prompt = vi.fn();

    const result = await resolveRemoteConnection(["--tier", "development"], {
      label: "devtools db test",
      loadEnvironment,
      prompt,
    });

    expect(result).toBeNull();
    expect(loadEnvironment).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("development"));
    stderr.mockRestore();
  });

  it("rejects an unrecognised --tier", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const result = await resolveRemoteConnection(["--tier", "bogus"], {
      label: "devtools db test",
    });

    expect(result).toBeNull();
    expect(stderr).toHaveBeenCalledWith(
      "devtools db test: --tier bogus is not a deployed tier. Expected: staging, production.\n",
    );
    stderr.mockRestore();
  });

  it("honours an already-entered DEPLOY_ENV over prompting", async () => {
    const loadEnvironment = fakeLoadEnvironment({
      production: { DB_URL: "postgresql://prod-db", PROJECT_REF: "prod999" },
    });
    const prompt = vi.fn();

    const result = await resolveRemoteConnection([], {
      available: ["development", "staging", "production"],
      deployEnv: "production",
      isTTY: true,
      prompt,
      loadEnvironment,
    });

    expect(result).toEqual({
      tier: "production",
      dbUrl: "postgresql://prod-db",
      projectRef: "prod999",
    });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("errors when no deployed tier's env file is present", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    delete process.env.DEPLOY_ENV;

    const result = await resolveRemoteConnection([], {
      label: "devtools db test",
      available: ["development"],
      isTTY: true,
    });

    expect(result).toBeNull();
    expect(stderr).toHaveBeenCalledWith(
      "devtools db test --target remote needs a deployed tier's env file; run " +
        "`pnpm devtools env pull --target staging` (or production) first.\n",
    );
    stderr.mockRestore();
  });

  it("uses the one deployed tier present with no prompt", async () => {
    const loadEnvironment = fakeLoadEnvironment({
      staging: { DB_URL: "postgresql://staging-db", PROJECT_REF: "stg1" },
    });
    const prompt = vi.fn();
    delete process.env.DEPLOY_ENV;

    const result = await resolveRemoteConnection([], {
      available: ["development", "staging"],
      isTTY: true,
      prompt,
      loadEnvironment,
    });

    expect(result?.tier).toBe("staging");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("prompts among deployed tiers on a TTY, staging first and production hinted", async () => {
    const loadEnvironment = fakeLoadEnvironment({
      production: { DB_URL: "postgresql://prod-db", PROJECT_REF: "prod1" },
    });
    const prompt = vi.fn(async () => "production" as const);
    delete process.env.DEPLOY_ENV;

    const result = await resolveRemoteConnection([], {
      available: ["development", "staging", "production"],
      isTTY: true,
      prompt,
      loadEnvironment,
    });

    expect(result?.tier).toBe("production");
    expect(prompt).toHaveBeenCalledWith(expect.any(String), [
      { value: "staging", label: "staging", hint: undefined },
      { value: "production", label: "production", hint: "⚠️  live data" },
    ]);
  });

  it("refuses ambiguity outside a TTY instead of guessing", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const prompt = vi.fn();
    delete process.env.DEPLOY_ENV;

    const result = await resolveRemoteConnection([], {
      label: "devtools db test",
      available: ["development", "staging", "production"],
      isTTY: false,
      prompt,
    });

    expect(result).toBeNull();
    expect(prompt).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      "devtools db test --target remote: multiple deployed tiers present; pass --tier staging|production.\n",
    );
    stderr.mockRestore();
  });

  it("reports a missing env file (MissingEnvFileError) on stderr and returns null", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const loadEnvironment = fakeLoadEnvironment({});

    const result = await resolveRemoteConnection(["--tier", "staging"], {
      label: "devtools db test",
      loadEnvironment,
    });

    expect(result).toBeNull();
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("devtools db test: "),
    );
    stderr.mockRestore();
  });

  it("errors when the resolved tier's file has no DB_URL, and mutates nothing", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const before = process.env.DEPLOY_ENV;
    const loadEnvironment = fakeLoadEnvironment({
      staging: { PROJECT_REF: "stg1" },
    });

    const result = await resolveRemoteConnection(["--tier", "staging"], {
      label: "devtools db test",
      loadEnvironment,
    });

    expect(result).toBeNull();
    expect(stderr).toHaveBeenCalledWith(
      "devtools db test --target remote: .env.staging has no DB_URL.\n",
    );
    // No partial entry into process.env on a failure path.
    expect(process.env.DEPLOY_ENV).toBe(before);
    stderr.mockRestore();
  });

  it("tolerates a missing PROJECT_REF — only DB_URL is required here", async () => {
    const loadEnvironment = fakeLoadEnvironment({
      staging: { DB_URL: "postgresql://staging-db" },
    });

    const result = await resolveRemoteConnection(["--tier", "staging"], {
      loadEnvironment,
    });

    expect(result).toEqual({
      tier: "staging",
      dbUrl: "postgresql://staging-db",
      projectRef: undefined,
    });
  });
});
