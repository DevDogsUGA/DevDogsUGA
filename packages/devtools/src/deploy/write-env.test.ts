/**
 * `devtools deploy write-env`, over a registry this file controls.
 *
 * Two things make a synthetic registry the right instrument here rather than
 * the real manifests:
 *
 *   * The rules that matter are about SHAPES of declaration: a `scope:
 *     "developer"` key, a `secrecy: "never-store"` one smuggled into the
 *     GitHub context, a derivation whose input is missing, a value that begins
 *     with a quote. The real registry contains an example of some of those and
 *     no example of the rest, so a suite built on it would pass vacuously
 *     exactly where the consequence is highest.
 *   * The command's success path WRITES A FILE, and its real destinations are
 *     `.env.staging` and `.env.production`, which on a maintainer's machine
 *     are the files being filled in with live credentials. `root` is a
 *     parameter for that reason, and every test here points it at a fresh
 *     mkdtemp.
 *
 * ⚠️ The environment is injected too. Nothing in this file mutates
 * `process.env`, so a test that got the DEPLOY_ENV wrong fails instead of
 * leaking a deploy environment into whatever vitest runs next in the worker.
 */
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { declare, define, resetRegistry } from "@devdogsuga/env";
import { DeployError } from "./report.js";
import { renderWriteEnvReport, runDeployWriteEnv } from "./write-env.js";

function root(): string {
  return mkdtempSync(join(tmpdir(), "write-env-test-"));
}

/**
 * One declaration per rule the composer applies, using real section names.
 *
 * `LOCALHOST_DEFAULT` and `DEVELOPER_ONLY` exist only to be ABSENT from the
 * output: each is a way a wrong value reached a deployed environment before
 * the rule that excludes it existed.
 */
beforeEach(() => {
  resetRegistry();

  declare({
    source: "platform",
    server: {
      REQUIRED_SECRET: define(z.string(), {
        doc: "A secret the schema will not boot without.",
        scope: "environment",
        secrecy: "secret",
      }),
      OPTIONAL_SECRET: define(z.string().optional(), {
        doc: "A secret an app boots fine without.",
        scope: "environment",
        secrecy: "secret",
      }),
      ANCHOR: define(z.string(), {
        doc: "A per-environment public value other lines derive from.",
        scope: "environment",
        secrecy: "public",
      }),
      DERIVED: define(z.string(), {
        doc: "Built from ANCHOR, everywhere, always.",
        scope: "environment",
        secrecy: "public",
        example: "https://$ANCHOR.example.com",
      }),
      LOCALHOST_DEFAULT: define(z.string().optional(), {
        doc: "A development default. NOT a deploy fallback.",
        scope: "environment",
        secrecy: "public",
        example: "http://localhost:3000",
      }),
      COMMITTED: define(z.string(), {
        doc: "Identical in every environment; the registry carries it.",
        scope: "default",
        secrecy: "public",
        example: "devdogsuga",
      }),
      DEVELOPER_ONLY: define(z.string(), {
        doc: "One contributor's own value, meaningless anywhere else.",
        scope: "developer",
        secrecy: "secret",
      }),
    },
  });

  declare({
    source: "devtools",
    server: {
      NEVER_STORE_ME: define(z.string().optional(), {
        doc: "The one that must never be in a GitHub store.",
        scope: "environment",
        secrecy: "never-store",
      }),
    },
  });

  declare({
    source: "supabase",
    server: {
      SUPABASE_PROVIDER_SECRET: define(z.string().optional(), {
        doc: "Optional in the schema; config.toml still needs it.",
        scope: "environment",
        secrecy: "secret",
      }),
    },
  });
});

const HAPPY = {
  DEPLOY_ENV: "staging",
  DEPLOY_GITHUB_SECRETS: JSON.stringify({
    REQUIRED_SECRET: "s3cret",
    SUPABASE_PROVIDER_SECRET: "provider-secret",
  }),
  DEPLOY_GITHUB_VARS: JSON.stringify({ ANCHOR: "abcdefgh" }),
};

describe("composing the file", () => {
  it("writes every resolvable key, single-quoted and fully expanded", async () => {
    const dir = root();
    const result = await runDeployWriteEnv({ root: dir, env: HAPPY });

    expect(result.file).toBe(".env.staging");
    const body = readFileSync(join(dir, ".env.staging"), "utf8");

    expect(body).toContain("REQUIRED_SECRET='s3cret'");
    expect(body).toContain("ANCHOR='abcdefgh'");
    // Expanded here, not left as a formula for dotenvx to resolve at load.
    expect(body).toContain("DERIVED='https://abcdefgh.example.com'");
    expect(body).not.toContain("$ANCHOR");
    expect(body).toContain("COMMITTED='devdogsuga'");
    expect(body).toContain("SUPABASE_PROVIDER_SECRET='provider-secret'");
  });

  it("names the command that composed it in the header", async () => {
    const dir = root();
    await runDeployWriteEnv({ root: dir, env: HAPPY });
    expect(readFileSync(join(dir, ".env.staging"), "utf8")).toContain(
      "devtools deploy write-env",
    );
  });

  it("writes the file 0600", async () => {
    const dir = root();
    await runDeployWriteEnv({ root: dir, env: HAPPY });
    // The permission bits are the point, so they are read directly.
    expect(statSync(join(dir, ".env.staging")).mode & 0o777).toBe(0o600);
  });

  it("reports provenance by name, and never a value", async () => {
    const dir = root();
    const result = await runDeployWriteEnv({ root: dir, env: HAPPY });
    const lines = renderWriteEnvReport(result).join("\n");

    expect(lines).toContain("5 variables");
    expect(lines).toContain("2 secret");
    expect(lines).toContain("1 variable");
    expect(lines).toContain("1 derived");
    expect(lines).toContain("1 committed");
    expect(lines).toContain("secret    REQUIRED_SECRET");
    expect(lines).not.toContain("s3cret");
    expect(lines).not.toContain("provider-secret");
  });

  it("writes DEPLOY_ENV's own file, not another target's", async () => {
    const dir = root();
    const result = await runDeployWriteEnv({
      root: dir,
      env: { ...HAPPY, DEPLOY_ENV: "production" },
    });
    expect(result.file).toBe(".env.production");
    expect(() => statSync(join(dir, ".env.staging"))).toThrow();
  });
});

describe("what is deliberately left out", () => {
  it("omits a scope:developer key even though its schema requires one", async () => {
    const dir = root();
    const result = await runDeployWriteEnv({ root: dir, env: HAPPY });

    // Both halves matter: the key is absent AND the run did not fail for it.
    // `DEVELOPER_ONLY` is `z.string()`, so without the scope rule it would be
    // in `missing` and the whole job would stop.
    expect(result.provenance.has("DEVELOPER_ONLY")).toBe(false);
    expect(readFileSync(join(dir, ".env.staging"), "utf8")).not.toContain(
      "DEVELOPER_ONLY",
    );
  });

  it("does not treat a localhost example as a deploy fallback", async () => {
    const dir = root();
    await runDeployWriteEnv({ root: dir, env: HAPPY });
    const body = readFileSync(join(dir, ".env.staging"), "utf8");

    expect(body).not.toContain("LOCALHOST_DEFAULT");
    expect(body).not.toContain("localhost");
  });

  it("omits an optional secret with no value rather than writing an empty one", async () => {
    const dir = root();
    await runDeployWriteEnv({ root: dir, env: HAPPY });
    const body = readFileSync(join(dir, ".env.staging"), "utf8");

    expect(body).not.toContain("OPTIONAL_SECRET");
    expect(body).not.toContain("=''");
  });

  it("treats an empty context value as absent", async () => {
    const dir = root();
    await expect(
      runDeployWriteEnv({
        root: dir,
        env: {
          ...HAPPY,
          DEPLOY_GITHUB_SECRETS: JSON.stringify({
            REQUIRED_SECRET: "",
            SUPABASE_PROVIDER_SECRET: "x",
          }),
        },
      }),
      // GitHub hands a missing secret to a workflow as "" rather than an
      // error, so the empty string has to fail the same way absence does.
    ).rejects.toThrow(/1 required variable\(s\) have no value/);
  });

  it("drops a non-string context member instead of coercing it", async () => {
    const dir = root();
    const result = await runDeployWriteEnv({
      root: dir,
      env: {
        ...HAPPY,
        DEPLOY_GITHUB_VARS: JSON.stringify({
          ANCHOR: "abcdefgh",
          COMMITTED: { nested: true },
        }),
      },
    });
    // Falls back to the registry's committed constant rather than writing
    // "[object Object]" into a Worker.
    expect(result.provenance.get("COMMITTED")).toBe("committed");
  });
});

describe("refusals", () => {
  it("refuses DEPLOY_ENV=development", async () => {
    await expect(
      runDeployWriteEnv({ root: root(), env: { ...HAPPY, DEPLOY_ENV: "" } }),
    ).rejects.toThrow(/must name a deployed environment/);
  });

  it("refuses a never-store key smuggled in as a secret", async () => {
    await expect(
      runDeployWriteEnv({
        root: root(),
        env: {
          ...HAPPY,
          DEPLOY_GITHUB_SECRETS: JSON.stringify({
            REQUIRED_SECRET: "s3cret",
            SUPABASE_PROVIDER_SECRET: "x",
            NEVER_STORE_ME: "leaked",
          }),
        },
      }),
    ).rejects.toThrow(/NEVER_STORE_ME must never be a GitHub secret/);
  });

  it("refuses a never-store key smuggled in as a variable", async () => {
    await expect(
      runDeployWriteEnv({
        root: root(),
        env: {
          ...HAPPY,
          DEPLOY_GITHUB_VARS: JSON.stringify({
            ANCHOR: "abcdefgh",
            NEVER_STORE_ME: "leaked",
          }),
        },
      }),
    ).rejects.toThrow(/NEVER_STORE_ME must never be a GitHub/);
  });

  it("refuses one key set as BOTH a secret and a variable", async () => {
    await expect(
      runDeployWriteEnv({
        root: root(),
        env: {
          ...HAPPY,
          DEPLOY_GITHUB_VARS: JSON.stringify({
            ANCHOR: "abcdefgh",
            REQUIRED_SECRET: "the-other-one",
          }),
        },
      }),
    ).rejects.toThrow(/REQUIRED_SECRET is set BOTH/);
  });

  it("names every missing required key and where it should come from", async () => {
    let err: unknown;
    try {
      await runDeployWriteEnv({
        root: root(),
        env: {
          ...HAPPY,
          DEPLOY_GITHUB_SECRETS: "{}",
          DEPLOY_GITHUB_VARS: "{}",
        },
      });
    } catch (caught) {
      err = caught;
    }

    expect(err).toBeInstanceOf(DeployError);
    const deployError = err as DeployError;
    expect(deployError.message).toMatch(/2 required variable\(s\)/);
    expect(deployError.detail.join("\n")).toContain(
      "REQUIRED_SECRET  — a secret",
    );
    expect(deployError.detail.join("\n")).toContain("ANCHOR  — not a secret");
  });

  it("refuses a value that begins or ends with a single quote", async () => {
    await expect(
      runDeployWriteEnv({
        root: root(),
        env: {
          ...HAPPY,
          DEPLOY_GITHUB_SECRETS: JSON.stringify({
            REQUIRED_SECRET: "'truncated",
            SUPABASE_PROVIDER_SECRET: "x",
          }),
        },
      }),
    ).rejects.toThrow(/cannot be quoted/);
  });

  it("refuses a derivation whose input has no value", async () => {
    resetRegistry();
    declare({
      source: "platform",
      server: {
        DANGLING: define(z.string(), {
          doc: "Derived from a key nothing supplies.",
          scope: "environment",
          secrecy: "public",
          example: "https://$NOWHERE.example.com",
        }),
      },
    });

    await expect(
      runDeployWriteEnv({
        root: root(),
        env: { DEPLOY_ENV: "staging" },
      }),
    ).rejects.toThrow(/DANGLING is derived from NOWHERE, which has no value/);
  });

  it("omits an OPTIONAL derivation whose input has no value", async () => {
    // The real case: STUDY_GROUP_FINDER_URL_CALLBACK derives from
    // STUDY_GROUP_FINDER_URL, both optional, declared ahead of any web
    // deployment with "leave it unset until the deploy exists" as the
    // documented contract. The first real staging deploy failed here.
    resetRegistry();
    declare({
      source: "platform",
      server: {
        FUTURE_CALLBACK: define(z.url().optional(), {
          doc: "Derived from a key declared ahead of its deployment.",
          scope: "environment",
          secrecy: "public",
          example: "$FUTURE_URL/auth/callback",
        }),
      },
    });

    const dir = root();
    await runDeployWriteEnv({
      root: dir,
      env: { DEPLOY_ENV: "staging" },
    });

    const written = readFileSync(join(dir, ".env.staging"), "utf8");
    expect(written).not.toContain("FUTURE_CALLBACK");
  });

  it("refuses a derivation cycle rather than recursing forever", async () => {
    resetRegistry();
    declare({
      source: "platform",
      server: {
        LOOP_A: define(z.string(), {
          doc: "Points at B.",
          scope: "environment",
          secrecy: "public",
          example: "$LOOP_B",
        }),
        LOOP_B: define(z.string(), {
          doc: "Points back at A.",
          scope: "environment",
          secrecy: "public",
          example: "$LOOP_A",
        }),
      },
    });

    await expect(
      runDeployWriteEnv({ root: root(), env: { DEPLOY_ENV: "staging" } }),
    ).rejects.toThrow(/derives back from it/);
  });

  it("refuses to overwrite an existing env file", async () => {
    const dir = root();
    writeFileSync(join(dir, ".env.staging"), "SOMEBODY_ELSES='real-value'\n");

    await expect(runDeployWriteEnv({ root: dir, env: HAPPY })).rejects.toThrow(
      /already exists, and this never overwrites one/,
    );

    // The point of the refusal: the existing file is untouched.
    expect(readFileSync(join(dir, ".env.staging"), "utf8")).toBe(
      "SOMEBODY_ELSES='real-value'\n",
    );
  });

  it("refuses a context that is not JSON, and one that is not an object", async () => {
    await expect(
      runDeployWriteEnv({
        root: root(),
        env: { ...HAPPY, DEPLOY_GITHUB_VARS: "{not json" },
      }),
    ).rejects.toThrow(/DEPLOY_GITHUB_VARS is not valid JSON/);

    await expect(
      runDeployWriteEnv({
        root: root(),
        env: { ...HAPPY, DEPLOY_GITHUB_VARS: "[1,2]" },
      }),
    ).rejects.toThrow(/DEPLOY_GITHUB_VARS is not a JSON object/);
  });
});

describe("--source <manifest>", () => {
  it("composes only what that manifest declares", async () => {
    const dir = root();
    const result = await runDeployWriteEnv({
      root: dir,
      source: "supabase",
      env: HAPPY,
    });

    expect([...result.provenance.keys()]).toEqual(["SUPABASE_PROVIDER_SECRET"]);
    const body = readFileSync(join(dir, ".env.staging"), "utf8");
    expect(body).not.toContain("REQUIRED_SECRET");
    expect(body).not.toContain("ANCHOR");
  });

  it("demands every secret it declares, not only the schema-required ones", async () => {
    // SUPABASE_PROVIDER_SECRET is `.optional()`: no app boots on it, only
    // config.toml reads it. Without the stricter rule this composes cleanly
    // and `supabase config push` reconfigures a provider with no secret.
    await expect(
      runDeployWriteEnv({
        root: root(),
        source: "supabase",
        env: { ...HAPPY, DEPLOY_GITHUB_SECRETS: "{}" },
      }),
    ).rejects.toThrow(/1 required variable\(s\) have no value/);
  });

  it("counts a `:tooling` suffix as the same manifest", async () => {
    declare({
      source: "supabase:tooling",
      server: {
        SUPABASE_TOOLING_VALUE: define(z.string().optional(), {
          doc: "Declared by supabase, not read by the running thing.",
          scope: "environment",
          secrecy: "public",
        }),
      },
    });

    const result = await runDeployWriteEnv({
      root: root(),
      source: "supabase",
      env: {
        ...HAPPY,
        DEPLOY_GITHUB_VARS: JSON.stringify({ SUPABASE_TOOLING_VALUE: "yes" }),
      },
    });
    expect(result.provenance.has("SUPABASE_TOOLING_VALUE")).toBe(true);
  });
});

describe("the job summary", () => {
  it("records a failure there as well as on stderr", async () => {
    const dir = root();
    const stepSummary = join(dir, "summary.md");

    await expect(
      runDeployWriteEnv({
        root: dir,
        env: {
          ...HAPPY,
          DEPLOY_GITHUB_SECRETS: "{}",
          DEPLOY_GITHUB_VARS: "{}",
          GITHUB_STEP_SUMMARY: stepSummary,
        },
      }),
    ).rejects.toThrow();

    const written = readFileSync(stepSummary, "utf8");
    expect(written).toContain("Deploy environment could not be composed");
    expect(written).toContain("REQUIRED_SECRET");
  });

  it("writes nothing anywhere when GITHUB_STEP_SUMMARY is unset", async () => {
    // The local case. A summary write that fell back to a relative path would
    // drop a file into whatever directory a contributor happened to be in.
    const dir = root();
    await expect(
      runDeployWriteEnv({
        root: dir,
        env: { ...HAPPY, DEPLOY_GITHUB_SECRETS: "{}" },
      }),
    ).rejects.toThrow();
    expect(() => statSync(join(dir, ".env.staging"))).toThrow();
  });
});
