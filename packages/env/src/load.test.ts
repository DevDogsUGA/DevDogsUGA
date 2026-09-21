import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { UnknownEnvironmentError } from "./targets.js";
import {
  applyWranglerLocalDatabaseAlias,
  GENERATED_FILE,
  HYPERDRIVE_LOCAL_CONNECTION_ENV,
  loadEnvironment,
  LocalStackOfflineError,
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
    // `preflight` is a real row in the target table, with `.env.preflight` as a
    // staging area for pushing credentials, and is deliberately NOT a deploy
    // environment. Unifying the vocabularies must not have quietly made it one:
    // preflight credentials are read-only by construction, so an app booted on
    // them fails feature-by-feature rather than at startup.
    await expect(
      selectEnvFiles(ctx({ deployEnv: "preflight" })),
    ).rejects.toThrow(UnknownEnvironmentError);
  });

  it("rejects an unknown DEPLOY_ENV naming the allowlist, never a suffix", async () => {
    // The hazard is DEPLOY_ENV=example resolving to .env.example, a committed
    // file whose placeholders largely pass validation. It must be an allowlist
    // error, not a file lookup.
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

  // Selection still throws. `with-env` is what now reports the absence and
  // carries on, so this stays the one place that decides a file is missing, and
  // the advice it carries is the first thing a clean clone reads.
  it("fails for development pointing at pnpm devtools setup", async () => {
    const attempt = selectEnvFiles(ctx({ exists: () => false }));
    await expect(attempt).rejects.toThrow(MissingEnvFileError);
    await expect(selectEnvFiles(ctx({ exists: () => false }))).rejects.toThrow(
      /\.env does not exist.*pnpm devtools setup/,
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

/**
 * The explicit answers that OVERRIDE the probe table. `local` escalates the
 * table's quiet fallbacks into refusals — "I asked for the Docker stack"
 * must never quietly become "`.env`'s hosted DB_URL answered" — and
 * `remote` skips both the overlay and the probe outright.
 */
describe("an explicit development database (devDatabase)", () => {
  it("local + port listening: prepends the overlay, exactly like the probe row", async () => {
    const s = await selectEnvFiles(
      ctx({ devDatabase: "local", probeLocalStack: () => true }),
    );
    expect(s.files).toEqual([GENERATED_FILE, ".env"]);
    expect(s.warnings).toEqual([]);
  });

  it("local + port refused: throws offline advice instead of falling back to .env", async () => {
    const attempt = selectEnvFiles(
      ctx({ devDatabase: "local", probeLocalStack: () => false }),
    );
    await expect(attempt).rejects.toThrow(LocalStackOfflineError);
    await expect(
      selectEnvFiles(
        ctx({ devDatabase: "local", probeLocalStack: () => false }),
      ),
    ).rejects.toThrow(/devtools db start.*--dev-db remote|db start/);
  });

  it("local + port listening + overlay missing: throws regenerate advice, not db start", async () => {
    const attempt = selectEnvFiles(
      ctx({
        devDatabase: "local",
        exists: (f) => f === ".env",
        probeLocalStack: () => true,
      }),
    );
    await expect(attempt).rejects.toThrow(LocalStackOfflineError);
    await expect(
      selectEnvFiles(
        ctx({
          devDatabase: "local",
          exists: (f) => f === ".env",
          probeLocalStack: () => true,
        }),
      ),
    ).rejects.toThrow(/supabase status -o env/);
  });

  it("remote: loads .env alone, warns about the ignored overlay, and never probes", async () => {
    const probe = vi.fn(() => true);
    const s = await selectEnvFiles(
      ctx({ devDatabase: "remote", probeLocalStack: probe }),
    );
    expect(s.files).toEqual([".env"]);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]).toMatch(/ignoring \.env\.generated/);
    expect(probe).not.toHaveBeenCalled();
  });

  it("remote with no overlay file: silent — nothing to ignore", async () => {
    const s = await selectEnvFiles(
      ctx({ devDatabase: "remote", exists: (f) => f === ".env" }),
    );
    expect(s.files).toEqual([".env"]);
    expect(s.warnings).toEqual([]);
  });

  it("is ignored outside development, so a propagated DEV_DB cannot break staging", async () => {
    // The launcher exports DEV_DB for its children; a child that explicitly
    // loads staging (deploy scripts do) must not throw or warn over it.
    const probe = vi.fn(() => false);
    const s = await selectEnvFiles(
      ctx({
        deployEnv: "staging",
        devDatabase: "local",
        probeLocalStack: probe,
      }),
    );
    expect(s.files).toEqual([".env.staging"]);
    expect(s.warnings).toEqual([]);
    expect(probe).not.toHaveBeenCalled();
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

describe("Wrangler local binding aliases", () => {
  it("derives the Hyperdrive connection from DB_URL", () => {
    const environment = { DB_URL: "postgres://local/database" };
    applyWranglerLocalDatabaseAlias(environment);
    expect(environment[HYPERDRIVE_LOCAL_CONNECTION_ENV]).toBe(
      environment.DB_URL,
    );
  });

  it("preserves an explicit Hyperdrive override", () => {
    const environment = {
      DB_URL: "postgres://default/database",
      [HYPERDRIVE_LOCAL_CONNECTION_ENV]: "postgres://override/database",
    };
    applyWranglerLocalDatabaseAlias(environment);
    expect(environment[HYPERDRIVE_LOCAL_CONNECTION_ENV]).toBe(
      "postgres://override/database",
    );
  });

  it("does not invent an empty connection when DB_URL is absent", () => {
    const environment: Record<string, string> = {};
    applyWranglerLocalDatabaseAlias(environment);
    expect(environment).not.toHaveProperty(HYPERDRIVE_LOCAL_CONNECTION_ENV);
  });
});

describe("loadEnvironment", () => {
  /**
   * A context where every file exists, the probe answers false, and applying
   * files is a no-op — so a test that doesn't override `applyEnvFiles` never
   * touches the real filesystem, a socket, or an actual dotenvx install.
   * `root` is a fake path: supplying it is what lets `loadEnvironment` skip
   * its own pnpm-workspace.yaml walk (real `node:fs`) entirely.
   */
  function loadCtx(
    overrides: {
      root?: string;
      exists?: (file: string) => boolean;
      probeLocalStack?: () => boolean | Promise<boolean>;
      applyEnvFiles?: (
        paths: string[],
        target: Record<string, string>,
        override: boolean,
      ) => void | Promise<void>;
      baseEnv?: NodeJS.ProcessEnv;
    } = {},
  ) {
    return {
      root: "/fake/root",
      exists: () => true,
      probeLocalStack: () => false,
      applyEnvFiles: () => {},
      baseEnv: {},
      ...overrides,
    };
  }

  it("honours DEV_DB from the base snapshot when no devDatabase option is given", async () => {
    // The propagation path: the devtools launcher exports DEV_DB once, and
    // every later in-process reload (session refresh, a nested with-env)
    // applies the same answer without naming the variable.
    const probe = vi.fn(() => true);
    const loaded = await loadEnvironment(
      "development",
      undefined,
      loadCtx({ baseEnv: { DEV_DB: "remote" }, probeLocalStack: probe }),
    );
    expect(loaded.files).toEqual([".env"]);
    expect(probe).not.toHaveBeenCalled();
  });

  it("lets an explicit devDatabase option beat DEV_DB", async () => {
    const loaded = await loadEnvironment(
      "development",
      { devDatabase: "local" },
      loadCtx({ baseEnv: { DEV_DB: "remote" }, probeLocalStack: () => true }),
    );
    expect(loaded.files).toEqual([GENERATED_FILE, ".env"]);
  });

  it("refuses an unrecognised DEV_DB instead of falling back to the probe", async () => {
    await expect(
      loadEnvironment(
        "development",
        undefined,
        loadCtx({ baseEnv: { DEV_DB: "docker" } }),
      ),
    ).rejects.toThrow('DEV_DB="docker" is not one of: local, remote.');
  });

  it("returns the environment and files selectEnvFiles chose, plus a populated env map", async () => {
    const loaded = await loadEnvironment(
      "staging",
      undefined,
      loadCtx({ baseEnv: { EXISTING: "value" } }),
    );
    expect(loaded.environment).toBe("staging");
    expect(loaded.files).toEqual([".env.staging"]);
    expect(loaded.env).toEqual({ EXISTING: "value" });
  });

  it("passes selectEnvFiles's warnings through unchanged", async () => {
    // Every file "exists" (loadCtx's default) and the probe is refused, so
    // this reproduces the probe table's "stale .env.generated" row — the
    // same case `selectEnvFiles` covers above — to prove the warning survives
    // the trip through `loadEnvironment` rather than being swallowed.
    const loaded = await loadEnvironment(undefined, undefined, loadCtx());
    expect(loaded.warnings).toHaveLength(1);
    expect(loaded.warnings[0]).toMatch(/stale/);
  });

  it("does not mutate the provided base env, and returns a different object", async () => {
    const baseEnv = { FOO: "bar" };
    const snapshot = { ...baseEnv };
    const loaded = await loadEnvironment(
      "staging",
      undefined,
      loadCtx({ baseEnv }),
    );
    expect(baseEnv).toEqual(snapshot);
    expect(loaded.env).not.toBe(baseEnv);
  });

  describe("override precedence", () => {
    // A fake dotenvx: only sets the key if told to override, or if the base
    // snapshot didn't already have it — the same rule the real dotenvx.config
    // applies under first-file-wins.
    function fakeApplyEnvFiles() {
      return vi.fn(
        (
          _paths: string[],
          target: Record<string, string>,
          override: boolean,
        ) => {
          if (override || target.KEY === undefined) target.KEY = "from-file";
        },
      );
    }

    it("keeps an existing base value when override is false (with-env's own precedence)", async () => {
      const applyEnvFiles = fakeApplyEnvFiles();
      const loaded = await loadEnvironment(
        "staging",
        { override: false },
        loadCtx({ baseEnv: { KEY: "from-shell" }, applyEnvFiles }),
      );
      expect(loaded.env.KEY).toBe("from-shell");
      expect(applyEnvFiles).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        false,
      );
    });

    it("replaces an existing base value when override is true (re-entrant different-tier loads)", async () => {
      const applyEnvFiles = fakeApplyEnvFiles();
      const loaded = await loadEnvironment(
        "staging",
        { override: true },
        loadCtx({ baseEnv: { KEY: "from-shell" }, applyEnvFiles }),
      );
      expect(loaded.env.KEY).toBe("from-file");
      expect(applyEnvFiles).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        true,
      );
    });
  });

  it("propagates MissingEnvFileError instead of swallowing it", async () => {
    // Unlike with-env, loadEnvironment is not the one place that knows how to
    // survive a missing file — that decision belongs to whichever caller asked
    // for this tier, so the error must reach it.
    await expect(
      loadEnvironment("staging", undefined, loadCtx({ exists: () => false })),
    ).rejects.toThrow(MissingEnvFileError);
  });

  it("propagates UnknownEnvironmentError for preflight and other non-deploy values", async () => {
    await expect(
      loadEnvironment("preflight", undefined, loadCtx()),
    ).rejects.toThrow(UnknownEnvironmentError);
    await expect(
      loadEnvironment("example", undefined, loadCtx()),
    ).rejects.toThrow(UnknownEnvironmentError);
  });

  it("derives the Wrangler Hyperdrive alias on the returned env", async () => {
    const loaded = await loadEnvironment(
      "staging",
      undefined,
      loadCtx({ baseEnv: { DB_URL: "postgres://x" } }),
    );
    expect(loaded.env[HYPERDRIVE_LOCAL_CONNECTION_ENV]).toBe("postgres://x");
  });
});

/**
 * A regression guard against a real shipped bug, run through the REAL dotenvx
 * (no injected `applyEnvFiles`) against two temp files, because the failure was
 * specific to dotenvx's own multi-file semantics.
 *
 * dotenvx's `overload` (which `override: true` uses) is LAST-file-wins, but the
 * file list is FIRST-file-wins: `selectEnvFiles` puts `.env.generated` — the
 * running local stack's connection overlay — AHEAD of `.env`. A re-entrant
 * development load with `override: true` therefore let `.env` (the hosted
 * connection) clobber the local overlay, and `workflows serve`/`run` handed a
 * local wrangler session the HOSTED `DB_URL`. `loadEnvironment` reverses the
 * list under overload so the first file wins regardless; these assert the
 * overlay survives override, and that a base value still wins without it.
 */
describe("loadEnvironment file precedence, through real dotenvx", () => {
  // `await run` before the finally, not `return run`: `loadEnvironment` reads
  // the files asynchronously (after selection yields at the probe), so a
  // synchronous cleanup would delete them mid-read — dotenvx would then load
  // nothing while `selection.files`, computed synchronously, still looked right.
  async function withTwoEnvFiles<T>(
    run: (dir: string) => Promise<T>,
  ): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), "load-order-"));
    try {
      // `.env.generated` (the overlay) precedes `.env`, so it must win.
      writeFileSync(join(dir, ".env.generated"), 'DB_URL="local"\n');
      writeFileSync(join(dir, ".env"), 'DB_URL="hosted"\nONLY_BASE="base"\n');
      return await run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  function realCtx(dir: string, baseEnv: NodeJS.ProcessEnv) {
    return {
      root: dir,
      exists: (file: string) => existsSync(join(dir, file)),
      // Selecting development with the probe up prepends `.env.generated`.
      probeLocalStack: () => true,
      baseEnv,
    };
  }

  it("keeps the overlay file winning under override (dotenvx overload is last-file-wins)", async () => {
    await withTwoEnvFiles(async (dir) => {
      const loaded = await loadEnvironment(
        undefined,
        { override: true },
        realCtx(dir, {}),
      );
      expect(loaded.files).toEqual([GENERATED_FILE, ".env"]);
      // The bug returned "hosted" here — `.env` clobbering the overlay.
      expect(loaded.env.DB_URL).toBe("local");
      // A key only `.env` declares still survives the reversed application.
      expect(loaded.env.ONLY_BASE).toBe("base");
    });
  });

  it("lets a base value win without override (with-env's shell-beats-file)", async () => {
    await withTwoEnvFiles(async (dir) => {
      const loaded = await loadEnvironment(
        undefined,
        { override: false },
        realCtx(dir, { DB_URL: "from-shell" }),
      );
      expect(loaded.env.DB_URL).toBe("from-shell");
    });
  });
});
