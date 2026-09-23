/**
 * `devtools deploy secrets-file`, the credential-handling command.
 *
 * Three properties here are the reason a secret does not leak out of a public
 * repository's Actions log, and each of them is a one-character edit away from
 * being gone with every other test still green:
 *
 *   * the temp directory is 0700 and the file inside it 0600;
 *   * `$GITHUB_OUTPUT` is APPENDED to, because GitHub's own writes and any
 *     earlier step's outputs share that file and a truncating write eats them;
 *   * the job summary and the log carry NAMES, never values.
 *
 * So each is asserted directly rather than inferred.
 *
 * The registry is synthetic for the reason `write-env.test.ts` gives at
 * length: the exclusions that matter (`:tooling`, `client: true`, another
 * app's keys, a public key) need a declaration of each shape, and the real
 * manifests happen to contain some of them and not others.
 */
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { declare, define, resetRegistry } from "@devdogsuga/env";
import { runDeploySecretsFile } from "./secrets-file.js";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "secrets-file-test-"));
}

/** A captured run: what reached stdout, and what the command returned. */
async function compose(
  overrides: { app?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const dir = scratch();
  const stdout: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });

  try {
    const result = await runDeploySecretsFile({
      app: overrides.app ?? "sandbox",
      env: {
        RUNNER_TEMP: dir,
        SANDBOX_STORED: "stored-secret-value",
        ...overrides.env,
      },
    });
    return { result, stdout: stdout.join(""), scratchDir: dir };
  } finally {
    spy.mockRestore();
  }
}

beforeEach(() => {
  resetRegistry();

  declare({
    source: "sandbox",
    server: {
      SANDBOX_STORED: define(z.string(), {
        doc: "A stored secret the Worker reads.",
        scope: "environment",
        secrecy: "secret",
      }),
      SANDBOX_OPTIONAL: define(z.string().optional(), {
        doc: "Optional; omitted when the environment has no value for it.",
        scope: "environment",
        secrecy: "secret",
      }),
      SANDBOX_PUBLIC: define(z.string(), {
        doc: "Not a secret, so not a Worker secret.",
        scope: "environment",
        secrecy: "public",
      }),
    },
    client: {
      SANDBOX_CLIENT_SECRET: define(z.string(), {
        doc: "Inlined into a browser bundle at build time (§A.6.3).",
        scope: "environment",
        secrecy: "secret",
      }),
    },
  });

  declare({
    source: "sandbox:tooling",
    server: {
      SANDBOX_TOOLING_KEY: define(z.string(), {
        doc: "Declared here, read on a laptop. The Worker never asks for it.",
        scope: "environment",
        secrecy: "secret",
      }),
    },
  });

  declare({
    source: "platform",
    server: {
      PLATFORM_SECRET: define(z.string(), {
        doc: "Another app's. Never goes to this Worker.",
        scope: "environment",
        secrecy: "secret",
      }),
    },
  });
});

describe("which keys are sent", () => {
  it("sends the app's own stored secrets and public server keys, nothing else", async () => {
    const { result } = await compose({
      env: {
        SANDBOX_TOOLING_KEY: "laptop-only",
        SANDBOX_CLIENT_SECRET: "in-the-bundle",
        SANDBOX_PUBLIC: "not-a-secret",
        PLATFORM_SECRET: "another-app",
      },
    });

    // Public server keys ride along since 2026-08-20: the Worker's runtime
    // env is the only process.env it has, and the first staging deploy
    // booted a Worker whose schema rejected the environment on every
    // request. See the selection comment in secrets-file.ts.
    expect(result.keys.sort()).toEqual(["SANDBOX_PUBLIC", "SANDBOX_STORED"]);

    const body = readFileSync(result.file, "utf8");
    // Each exclusion is a separate rule, and each has its own way of going
    // wrong. A `:tooling` key sent anyway hands an internet-facing Worker a
    // credential it never asks for.
    expect(body).not.toContain("SANDBOX_TOOLING_KEY");
    expect(body).not.toContain("SANDBOX_CLIENT_SECRET");
    expect(body).not.toContain("PLATFORM_SECRET");
  });

  it("writes valid JSON of key to value", async () => {
    const { result } = await compose();
    expect(JSON.parse(readFileSync(result.file, "utf8"))).toEqual({
      SANDBOX_STORED: "stored-secret-value",
    });
  });

  it("omits an optional secret with no value rather than sending an empty one", async () => {
    const { result } = await compose();

    expect(result.omitted).toEqual(["SANDBOX_OPTIONAL", "SANDBOX_PUBLIC"]);
    // Sending "" would read as configured to every consumer that checks for
    // presence, which is worse than the key being absent.
    expect(
      Object.values(JSON.parse(readFileSync(result.file, "utf8"))),
    ).not.toContain("");
  });

  it("treats an empty environment value as absent", async () => {
    const { result } = await compose({ env: { SANDBOX_OPTIONAL: "" } });
    expect(result.omitted).toEqual(["SANDBOX_OPTIONAL", "SANDBOX_PUBLIC"]);
  });

  it("puts NOTHING on stdout", async () => {
    // The omission notice, the key list and the destination path all go to
    // stderr, because GitHub reads this stream and `cli.ts` suppresses its
    // banner for the same reason.
    const { stdout, result } = await compose({
      app: "platform",
      env: { PLATFORM_SECRET: "another-app" },
    });
    expect(result.keys).toEqual(["PLATFORM_SECRET"]);
    expect(stdout).toBe("");
  });
});

describe("file modes", () => {
  it("puts the file in a 0700 directory", async () => {
    const { result } = await compose();
    // The permission bits are the point, so they are read directly.
    expect(statSync(result.dir).mode & 0o777).toBe(0o700);
  });

  it("writes the file itself 0600", async () => {
    const { result } = await compose();
    // The permission bits are the point, so they are read directly.
    expect(statSync(result.file).mode & 0o777).toBe(0o600);
  });

  it("puts it under RUNNER_TEMP when the runner sets one", async () => {
    const { result, scratchDir } = await compose();
    expect(result.dir.startsWith(scratchDir)).toBe(true);
  });
});

describe("a minted key", () => {
  // `minted: true` is what `SANDBOX_PROXY_TOKEN` used to carry: a secret
  // signed at deploy time rather than stored, with no minter of its own once
  // the sandbox integration it authenticated to was removed. This command has
  // nothing left that can fill one in, so declaring one is always a hard
  // failure rather than a silent omission.
  beforeEach(() => {
    declare({
      source: "sandbox",
      server: {
        SANDBOX_MINTED: define(z.string(), {
          doc: "Signed at deploy time; no stored copy anywhere.",
          scope: "environment",
          secrecy: "secret",
          minted: true,
        }),
      },
    });
  });

  it("is refused with nothing to mint it", async () => {
    await expect(compose()).rejects.toThrow(
      /declares minted secret\(s\) with nothing to mint them: SANDBOX_MINTED/,
    );
  });

  it("writes no file at all", async () => {
    const dir = scratch();
    await expect(
      runDeploySecretsFile({
        app: "sandbox",
        env: { RUNNER_TEMP: dir, SANDBOX_STORED: "stored-secret-value" },
      }),
    ).rejects.toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("$GITHUB_OUTPUT", () => {
  it("writes dir= and file=", async () => {
    const dir = scratch();
    const out = join(dir, "github-output");
    writeFileSync(out, "");

    const result = await runDeploySecretsFile({
      app: "sandbox",
      env: {
        RUNNER_TEMP: dir,
        GITHUB_OUTPUT: out,
        SANDBOX_STORED: "stored-secret-value",
      },
    });

    const written = readFileSync(out, "utf8");
    expect(written).toContain(`dir=${result.dir}\n`);
    expect(written).toContain(`file=${result.file}\n`);
  });

  it("APPENDS, leaving an earlier step's outputs intact", async () => {
    const dir = scratch();
    const out = join(dir, "github-output");
    writeFileSync(out, "paused=false\n");

    await runDeploySecretsFile({
      app: "sandbox",
      env: {
        RUNNER_TEMP: dir,
        GITHUB_OUTPUT: out,
        SANDBOX_STORED: "stored-secret-value",
      },
    });

    expect(readFileSync(out, "utf8")).toMatch(/^paused=false\n/);
  });

  it("never writes a VALUE to it", async () => {
    const dir = scratch();
    const out = join(dir, "github-output");
    writeFileSync(out, "");

    await runDeploySecretsFile({
      app: "sandbox",
      env: {
        RUNNER_TEMP: dir,
        GITHUB_OUTPUT: out,
        SANDBOX_STORED: "stored-secret-value",
      },
    });

    const written = readFileSync(out, "utf8");
    expect(written).not.toContain("stored-secret-value");
  });

  it("is optional — nothing is written when the runner sets none", async () => {
    await expect(compose()).resolves.toBeDefined();
  });
});

describe("the job summary", () => {
  it("lists names only, never values", async () => {
    const dir = scratch();
    const stepSummary = join(dir, "summary.md");

    await runDeploySecretsFile({
      app: "sandbox",
      env: {
        RUNNER_TEMP: dir,
        GITHUB_STEP_SUMMARY: stepSummary,
        SANDBOX_STORED: "stored-secret-value",
      },
    });

    const written = readFileSync(stepSummary, "utf8");
    expect(written).toContain("Worker secrets sent to `sandbox`");
    expect(written).toContain("`SANDBOX_STORED`");
    expect(written).not.toContain("stored-secret-value");
  });
});

describe("an empty secrets file", () => {
  it("is refused rather than uploaded", async () => {
    resetRegistry();
    declare({
      source: "sandbox",
      server: {
        SANDBOX_NOTHING: define(z.string().optional(), {
          doc: "Declared, but the environment has no value for it.",
          scope: "environment",
          secrecy: "secret",
        }),
      },
    });

    // `--secrets-file` preserves what it omits, so an empty one leaves every
    // previously set secret in place, unexamined. A no-op that looks like a
    // successful rotation.
    await expect(compose({ env: {} })).rejects.toThrow(
      /has no Worker secrets to send/,
    );
  });
});
