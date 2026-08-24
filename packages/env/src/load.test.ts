import { describe, expect, it, vi } from "vitest";
import { UnknownEnvironmentError } from "./targets.js";
import {
  GENERATED_FILE,
  MissingEnvFileError,
  selectEnvFiles,
  type SelectionContext,
} from "./load.js";

/**
 * A context where every file exists and the probe answer is injected. Tests
 * override per case; none of them touches a socket or the filesystem.
 */
function ctx(overrides: Partial<SelectionContext> = {}): SelectionContext {
  return {
    deployEnv: undefined,
    exists: () => true,
    probeLocalStack: () => false,
    ...overrides,
  };
}

describe("environment selection", () => {
  it("treats unset DEPLOY_ENV as development, loading .env", async () => {
    const s = await selectEnvFiles(ctx({ exists: (f) => f === ".env" }));
    expect(s.environment).toBe("development");
    expect(s.files).toEqual([".env"]);
  });

  it("treats empty DEPLOY_ENV as development", async () => {
    const s = await selectEnvFiles(
      ctx({ deployEnv: "", exists: (f) => f === ".env" }),
    );
    expect(s.environment).toBe("development");
  });

  it("maps staging and production to their suffixed files", async () => {
    for (const env of ["staging", "production"] as const) {
      const s = await selectEnvFiles(ctx({ deployEnv: env }));
      expect(s.environment).toBe(env);
      expect(s.files).toEqual([`.env.${env}`]);
    }
  });

  it("rejects DEPLOY_ENV=preflight, which HAS a file and is not an environment", async () => {
    // `preflight` is a real row in the target table — `.env.preflight` exists
    // as a staging area for pushing credentials — and is deliberately NOT a
    // deploy environment. Unifying the vocabularies must not have quietly
    // made it one: the preflight credentials are read-only by construction, so
    // an app booted on them fails feature-by-feature rather than at startup.
    await expect(
      selectEnvFiles(ctx({ deployEnv: "preflight" })),
    ).rejects.toThrow(UnknownEnvironmentError);
  });

  it("rejects an unknown DEPLOY_ENV naming the allowlist, never a suffix", async () => {
    // The hazard is DEPLOY_ENV=example resolving to .env.example — a real,
    // committed file whose placeholders largely pass validation. It must be
    // an allowlist error, not a file lookup.
    await expect(selectEnvFiles(ctx({ deployEnv: "example" }))).rejects.toThrow(
      UnknownEnvironmentError,
    );
    await expect(selectEnvFiles(ctx({ deployEnv: "example" }))).rejects.toThrow(
      /development, staging, production/,
    );
  });
});

describe("missing env files", () => {
  it("fails for staging/production naming the file and a pull that creates it", async () => {
    // The command in the message has to produce the file in the message. It
    // said `secrets pull --env staging`, whose `--env` was the vault
    // vocabulary: that wrote into `.env`, left `.env.staging` missing, and so
    // reprinted this same error. `--target` defaults its file from the table.
    for (const env of ["staging", "production"] as const) {
      const attempt = selectEnvFiles(
        ctx({ deployEnv: env, exists: () => false }),
      );
      await expect(attempt).rejects.toThrow(MissingEnvFileError);
      await expect(
        selectEnvFiles(ctx({ deployEnv: env, exists: () => false })),
      ).rejects.toThrow(
        new RegExp(`\\.env\\.${env}.*env pull --target ${env}`),
      );
    }
  });

  it("never advises the retired --env flag", async () => {
    // A positive control on the rename. Asserting only that SOME command is
    // named would have passed before the fix, when the named command wrote to
    // the wrong file; this pins the flag that makes the advice work.
    const thrown: unknown = await selectEnvFiles(
      ctx({ deployEnv: "staging", exists: () => false }),
    ).catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(MissingEnvFileError);
    expect((thrown as Error).message).toContain("env pull --target staging");
    expect((thrown as Error).message).not.toContain("--env ");
  });

  it("fails for development pointing at pnpm setup", async () => {
    const attempt = selectEnvFiles(ctx({ exists: () => false }));
    await expect(attempt).rejects.toThrow(MissingEnvFileError);
    await expect(selectEnvFiles(ctx({ exists: () => false }))).rejects.toThrow(
      /\.env does not exist.*pnpm setup/,
    );
  });
});

describe("the probe table (development)", () => {
  it("generated exists + port listening: prepends .env.generated before .env", async () => {
    const s = await selectEnvFiles(ctx({ probeLocalStack: () => true }));
    // Order is load-bearing: dotenvx is first-file-wins, so the local-stack
    // overlay only takes effect ahead of .env.
    expect(s.files).toEqual([GENERATED_FILE, ".env"]);
    expect(s.warnings).toEqual([]);
  });

  it("generated exists + port refused: ignores it and warns stale", async () => {
    const s = await selectEnvFiles(ctx({ probeLocalStack: () => false }));
    expect(s.files).toEqual([".env"]);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]).toMatch(/stale/);
    expect(s.warnings[0]).toMatch(/54321/);
  });

  it("generated missing + port listening: warns to regenerate it", async () => {
    const s = await selectEnvFiles(
      ctx({ exists: (f) => f === ".env", probeLocalStack: () => true }),
    );
    expect(s.files).toEqual([".env"]);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]).toMatch(/supabase status -o env/);
  });

  it("generated missing + port refused: silent — the hosted-project normal case", async () => {
    const s = await selectEnvFiles(
      ctx({ exists: (f) => f === ".env", probeLocalStack: () => false }),
    );
    expect(s.files).toEqual([".env"]);
    expect(s.warnings).toEqual([]);
  });

  it("accepts an async probe", async () => {
    const s = await selectEnvFiles(
      ctx({ probeLocalStack: () => Promise.resolve(true) }),
    );
    expect(s.files).toEqual([GENERATED_FILE, ".env"]);
  });
});

describe(".env.generated is development-only", () => {
  it("never probes nor loads the overlay for staging/production", async () => {
    // A running local Docker container must never shadow the deployed
    // connection values: under first-file-wins, prepending the overlay would
    // silently point a staging build at localhost.
    for (const env of ["staging", "production"] as const) {
      const probe = vi.fn(() => true);
      const s = await selectEnvFiles(
        ctx({ deployEnv: env, probeLocalStack: probe }),
      );
      expect(s.files).toEqual([`.env.${env}`]);
      expect(s.warnings).toEqual([]);
      expect(probe).not.toHaveBeenCalled();
    }
  });
});
