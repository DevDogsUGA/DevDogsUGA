/**
 * `deploy mint-token`, the one command in this repository whose stdout is a
 * production credential.
 *
 * Ported from `env/mint-sandbox-token.test.ts`, which drove the standalone
 * `scripts/mint-sandbox-token.mjs` as a subprocess. The migration into the CLI
 * changed the shape of the risk, so the tests are now in three layers, and all
 * three are load-bearing:
 *
 *   1. **In-process, injected sink.** `runMintToken(env, out)` takes the
 *      credential stream as a parameter, so a collector captures EVERY byte
 *      written to it. That is more precise than reading a pipe and makes
 *      exhaustive refusal coverage cheap. Refusals throw a `DeployError`
 *      before the first write; `cli.ts` renders it to stderr.
 *   2. **Subprocess.** The contract a deploy depends on is a PROCESS contract,
 *      and layer 1 cannot see a module-load side effect: an import added to
 *      `mint-token.ts` that prints a banner at load time would leave every
 *      layer-1 test green and still corrupt the token. So a harness runs the
 *      real module in a real process and the real fds get read.
 *   3. **The wiring in `cli.ts`.** The actual trap in this migration is not in
 *      `mint-token.ts` at all. It is `intro("DevDogs devtools")`, which writes
 *      to STDOUT, running before the dispatch. No test of this module can catch
 *      that, so the last block asserts it against the text of `cli.ts`.
 *
 * ⚠️ The subprocess NEVER inherits `process.env`. Two reasons, and the second
 * is the important one: a hermetic environment makes DEPLOY_ENV and the signing
 * key explicit per test, and a developer's shell may hold the real platform
 * signing key, so an inherited environment could have a test signing a genuine
 * credential and printing it into CI logs. Every case builds its environment
 * from `PATH` upward.
 */
import { execFile } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MIN_SIGNING_KEY_LENGTH,
  MintError,
  mintSandboxToken,
  runMintToken,
  TOKEN_LIFETIME_SECONDS,
  verifySandboxToken,
  type Sink,
} from "./mint-token.js";
import { DeployError } from "./report.js";

const run = promisify(execFile);
const HERE = import.meta.dirname;

/** Both 40 characters, matching the length of Supabase's legacy JWT secret. */
const KEY = "test-signing-key-not-a-real-one-01234567";
const OTHER_KEY = "different-signing-key-also-fake-98765432";
const REF = "abcdefghijklmnopqrst";

function decode(segment: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(segment, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

/** The signature, recomputed here from first principles rather than reused. */
function sign(signingInput: string, signingKey: string): string {
  return createHmac("sha256", signingKey)
    .update(signingInput)
    .digest("base64url");
}

// ── Layer 1: in-process, with the streams injected ───────────────────────────

interface Captured {
  /** The refusal, or `null` when the command succeeded. */
  error: DeployError | null;
  stdout: string;
}

function collector(): Sink & { text: string } {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}

/** Runs the command with a hermetic environment and captures the credential channel. */
function mint(env: Record<string, string | undefined> = {}): Captured {
  const out = collector();
  // Spread last, so a test setting a key to "" overrides the default with an
  // empty value rather than being ignored.
  const child: Record<string, string | undefined> = {
    DEPLOY_ENV: "production",
    SUPABASE_JWT_SIGNING_KEY: KEY,
    ...env,
  };
  // `undefined` means genuinely ABSENT, a different input from "". It is the
  // one that reaches `signingKey.length` as undefined.
  for (const [key, value] of Object.entries(child)) {
    if (value === undefined) delete child[key];
  }
  try {
    runMintToken(child, out);
    return { error: null, stdout: out.text };
  } catch (err) {
    // A non-DeployError is a crash, not a refusal. Surfaced rather than
    // swallowed: an uncaught TypeError also produces an empty stdout, so
    // catching everything here would make the two indistinguishable.
    if (!(err instanceof DeployError)) throw err;
    return { error: err, stdout: out.text };
  }
}

function token(env: Record<string, string | undefined> = {}): string {
  const result = mint(env);
  expect(result.error?.message).toBeUndefined();
  return result.stdout.trim();
}

describe("the signature", () => {
  it("is a real HMAC-SHA256 over the header and payload", () => {
    // THE POSITIVE CONTROL. Every claim assertion below would pass just as
    // happily against a token whose third segment was a constant, a hash of
    // the wrong thing, or the empty string, because the payload is readable
    // without any key at all. This is the only test that fails if the signing
    // step stops signing.
    const [header, payload, signature] = token().split(".");
    expect(signature).toBe(sign(`${header}.${payload}`, KEY));
  });

  it("does not verify under a different key", () => {
    // The negative half of the control above: it proves the comparison there
    // discriminates. Without this, `sign()` returning a constant would make
    // both tests green.
    const [header, payload, signature] = token().split(".");
    expect(signature).not.toBe(sign(`${header}.${payload}`, OTHER_KEY));
  });

  it("changes when the signing key changes, with the same claims", () => {
    // Rotation's whole premise: two environments hold different keys, so the
    // same claims must not yield the same credential.
    const a = token({ SUPABASE_JWT_SIGNING_KEY: KEY });
    const b = token({ SUPABASE_JWT_SIGNING_KEY: OTHER_KEY });
    expect(a.split(".")[1]).toBe(b.split(".")[1]);
    expect(a.split(".")[2]).not.toBe(b.split(".")[2]);
  });

  it("is never empty, and the token is never unsigned", () => {
    const parts = token().split(".");
    expect(parts).toHaveLength(3);
    for (const part of parts) expect(part.length).toBeGreaterThan(0);
    expect(decode(parts[0]!).alg).not.toBe("none");
  });
});

describe("verifySandboxToken", () => {
  it("accepts what mintSandboxToken produced", () => {
    expect(verifySandboxToken(mintSandboxToken({ signingKey: KEY }), KEY)).toBe(
      true,
    );
  });

  it("rejects the same token under a different key", () => {
    // The positive control's counterpart: without this, a `verify` that
    // returned `true` unconditionally would pass the test above.
    expect(
      verifySandboxToken(mintSandboxToken({ signingKey: KEY }), OTHER_KEY),
    ).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const [header, , signature] = mintSandboxToken({
      signingKey: KEY,
    }).split(".");
    const forged = Buffer.from(
      JSON.stringify({ role: "service_role" }),
      "utf8",
    ).toString("base64url");
    expect(verifySandboxToken(`${header}.${forged}.${signature}`, KEY)).toBe(
      false,
    );
  });

  it("rejects a malformed token rather than throwing", () => {
    // timingSafeEqual throws on a length mismatch, so the length guard inside
    // verify is what keeps a garbage input from becoming an exception.
    for (const bad of ["", "a.b", "a.b.c.d", "a..c", `a.b.${"x".repeat(99)}`]) {
      expect(() => verifySandboxToken(bad, KEY)).not.toThrow();
      expect(verifySandboxToken(bad, KEY)).toBe(false);
    }
  });
});

describe("the claims", () => {
  it("declares HS256, and never an algorithm the caller chose", () => {
    expect(decode(token().split(".")[0]!)).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
  });

  it("carries the sandbox_proxy role", () => {
    // The role PostgREST passes to SET ROLE. It is a real cluster role granted
    // to `authenticator`, holding EXECUTE on two functions and no table grants
    // (migration 20260805000002_platform_sandbox_credentials.sql).
    expect(decode(token().split(".")[1]!).role).toBe("sandbox_proxy");
  });

  it("cannot be talked into a different role by the injected environment", () => {
    // The failure this guards is a token authorizing as the database owner.
    // The same signing key would produce one happily; the only thing stopping
    // it is that the role is a constant in the module, so the constant is what
    // gets asserted, against every name somebody might try.
    //
    // ⚠️ This covers only the env OBJECT the command was handed. A mutation
    // introducing `process.env.ROLE ?? SANDBOX_PROXY_ROLE` SURVIVES this test,
    // because vitest's own process env is not what gets injected here. The
    // subprocess test of the same name is what closes that hole; neither is
    // redundant.
    for (const key of ["ROLE", "SANDBOX_PROXY_ROLE", "PGROLE", "DB_ROLE"]) {
      const claims = decode(token({ [key]: "service_role" }).split(".")[1]!);
      expect(claims.role).toBe("sandbox_proxy");
    }
  });

  it("expires 90 days after it is issued", () => {
    const claims = decode(token().split(".")[1]!) as {
      iat: number;
      exp: number;
    };
    expect(claims.exp - claims.iat).toBe(TOKEN_LIFETIME_SECONDS);
    expect(claims.exp - claims.iat).toBe(90 * 24 * 60 * 60);
  });

  it("issues at roughly now, in seconds rather than milliseconds", () => {
    // A `Date.now()` that forgot to divide produces an `iat` 1000x too large
    // and an `exp` in the year 57000: a token that never expires, which is the
    // failure the 90-day window exists to prevent, arriving silently.
    const claims = decode(token().split(".")[1]!) as { iat: number };
    const now = Math.floor(Date.now() / 1000);
    expect(Math.abs(claims.iat - now)).toBeLessThan(60);
  });

  it("takes `now` as a parameter so the expiry is assertable", () => {
    // The reason `now` is injectable at all. Without this the 90-day window is
    // only ever checked as a difference, which a hardcoded `exp` would satisfy.
    const claims = decode(
      mintSandboxToken({ signingKey: KEY, now: 1_700_000_000_000 }).split(
        ".",
      )[1]!,
    ) as { iat: number; exp: number };
    expect(claims.iat).toBe(1_700_000_000);
    expect(claims.exp).toBe(1_700_000_000 + TOKEN_LIFETIME_SECONDS);
  });

  it("includes ref when PROJECT_REF is set", () => {
    expect(decode(token({ PROJECT_REF: REF }).split(".")[1]!).ref).toBe(REF);
  });

  it("omits ref rather than guessing when PROJECT_REF is unset", () => {
    // An absent `ref` is at worst ignored; a wrong one is rejected outright.
    expect("ref" in decode(token().split(".")[1]!)).toBe(false);
  });
});

describe("stdout is the token and nothing else", () => {
  it("writes exactly the JWT and one newline", () => {
    const result = mint();
    expect(result.error).toBeNull();
    expect(result.stdout).toMatch(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\n$/,
    );
  });

  it("makes exactly one write to the credential channel", () => {
    // A second write would still match the regex above if it happened to be
    // empty, and would corrupt the token if it did not. The count is the
    // property that actually holds.
    const writes: string[] = [];
    const out: Sink = {
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
    };
    runMintToken(
      { DEPLOY_ENV: "production", SUPABASE_JWT_SIGNING_KEY: KEY },
      out,
    );
    expect(writes).toHaveLength(1);
  });
});

describe("refusing to mint", () => {
  /** Every refusal must look identical from the caller's side. */
  function expectRefusal(env: Record<string, string | undefined>): string {
    const result = mint(env);
    // A CLEAN refusal, not a crash. `mint()` rethrows anything that is not a
    // DeployError, so reaching here at all means this was a decision rather
    // than a fall-over. Exit-code-only assertions cannot tell the two apart,
    // and a crash is a bug a passing exit code would hide forever.
    expect(result.error).toBeInstanceOf(DeployError);
    // The one that matters: a caller piping stdout into `wrangler secret put`
    // must receive NOTHING on a failing run. A token signed with an empty or
    // undefined key would be perfectly well-formed and forgeable by anyone.
    expect(result.stdout).toBe("");
    expect(result.error!.message.trim().length).toBeGreaterThan(0);
    return `${result.error!.message}\n${result.error!.detail.join("\n")}`;
  }

  it("refuses an ABSENT signing key cleanly, naming it", () => {
    // Absent, not empty: this is the input that reaches the guard as
    // `undefined` and would throw on `.length` if the type check were dropped.
    expect(expectRefusal({ SUPABASE_JWT_SIGNING_KEY: undefined })).toContain(
      "SUPABASE_JWT_SIGNING_KEY",
    );
  });

  it("refuses an empty signing key, naming it", () => {
    expect(expectRefusal({ SUPABASE_JWT_SIGNING_KEY: "" })).toContain(
      "SUPABASE_JWT_SIGNING_KEY",
    );
  });

  it("refuses a whitespace-only key LONG ENOUGH to clear the length floor", () => {
    // Isolates the emptiness guard from the length guard, which is not
    // pedantry: a mutation run found that deleting the emptiness check broke
    // no test, because every short blank value was being caught by the length
    // floor instead. 32 spaces is a legal HMAC key that would sign a
    // real-looking token, and only the trim() check refuses it.
    expectRefusal({ SUPABASE_JWT_SIGNING_KEY: " ".repeat(32) });
  });

  it("refuses a signing key shorter than 32 characters", () => {
    expect(expectRefusal({ SUPABASE_JWT_SIGNING_KEY: "too-short" })).toContain(
      "32",
    );
  });

  it("accepts exactly 32 characters — the floor is not off by one", () => {
    // The counterpart to the test above, so "refuses everything" cannot pass
    // for "enforces a floor".
    expect(
      token({
        SUPABASE_JWT_SIGNING_KEY: "x".repeat(MIN_SIGNING_KEY_LENGTH),
      }).split("."),
    ).toHaveLength(3);
  });

  it("refuses 31 characters — the floor is enforced at the boundary", () => {
    expectRefusal({
      SUPABASE_JWT_SIGNING_KEY: "x".repeat(MIN_SIGNING_KEY_LENGTH - 1),
    });
  });

  it("refuses an unset DEPLOY_ENV rather than defaulting", () => {
    // A default would sign a production credential with whatever key the
    // development env file holds. apps/sandbox's deploy scripts shipped
    // without DEPLOY_ENV once already.
    expect(expectRefusal({ DEPLOY_ENV: "" })).toContain("DEPLOY_ENV");
  });

  it("refuses a genuinely absent DEPLOY_ENV, not just an empty one", () => {
    expect(expectRefusal({ DEPLOY_ENV: undefined })).toContain("unset");
  });

  it("refuses development — this token only exists for a deployed Worker", () => {
    expectRefusal({ DEPLOY_ENV: "development" });
  });

  it("refuses an unrecognised DEPLOY_ENV instead of treating it as deployed", () => {
    // `production-apply` is a real GitHub environment name and not a deploy
    // target; an allowlist is what keeps it from being read as one.
    expectRefusal({ DEPLOY_ENV: "production-apply" });
    expectRefusal({ DEPLOY_ENV: "preflight" });
    expectRefusal({ DEPLOY_ENV: "PRODUCTION" });
  });

  it("checks DEPLOY_ENV BEFORE the signing key", () => {
    // Ordering matters for the diagnosis: with both wrong, the environment is
    // the one to fix first, because it is what decides which key gets read.
    expect(
      expectRefusal({
        DEPLOY_ENV: "development",
        SUPABASE_JWT_SIGNING_KEY: "",
      }),
    ).toContain("DEPLOY_ENV");
  });

  it("mints for staging and production, so the allowlist is not just closed", () => {
    for (const environment of ["staging", "production"]) {
      expect(mint({ DEPLOY_ENV: environment }).error, environment).toBeNull();
    }
  });

  it("throws MintError rather than a bare Error, so callers can tell them apart", () => {
    // `runMintToken` rethrows anything that is not a MintError. If the class
    // stopped being used, an operator's bad input would surface as a crash.
    expect(() => mintSandboxToken({ signingKey: "" })).toThrow(MintError);
  });
});

// ── Layer 2: the process contract, in a real process ─────────────────────────

describe("the process contract", () => {
  let dir: string;
  let harness: string;
  let tsx: string;

  beforeAll(() => {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve("tsx/package.json");
    tsx = join(dirname(pkg), (require(pkg) as { bin: string }).bin);

    dir = mkdtempSync(join(tmpdir(), "devdogs-mint-"));
    harness = join(dir, "harness.ts");
    // Exactly what `cli.ts` does: call the entry point, render a DeployError
    // to STDERR, set an exit code, and write nothing else. Spawned through
    // node + tsx's own .mjs entry rather than the `.bin` shim, which on
    // Windows is a `.cmd` that Node refuses to spawn without a shell.
    writeFileSync(
      harness,
      [
        `import { runMintToken } from ${JSON.stringify(
          pathToFileURL(join(HERE, "mint-token.ts")).href,
        )};`,
        `import { DeployError, say } from ${JSON.stringify(
          pathToFileURL(join(HERE, "report.ts")).href,
        )};`,
        "try {",
        "  runMintToken();",
        "} catch (err) {",
        "  if (!(err instanceof DeployError)) throw err;",
        "  say([err.message, ...err.detail.map((l) => `  ${l}`)]);",
        "  process.exitCode = 1;",
        "}",
        "",
      ].join("\n"),
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  interface Spawned {
    code: number;
    stdout: string;
    stderr: string;
  }

  async function spawnMint(
    env: Record<string, string | undefined> = {},
  ): Promise<Spawned> {
    const child: Record<string, string | undefined> = {
      // Hermetic. See the header.
      PATH: process.env.PATH ?? "",
      DEPLOY_ENV: "production",
      SUPABASE_JWT_SIGNING_KEY: KEY,
      ...env,
    };
    for (const [key, value] of Object.entries(child)) {
      if (value === undefined) delete child[key];
    }
    try {
      const { stdout, stderr } = await run(process.execPath, [tsx, harness], {
        env: child as NodeJS.ProcessEnv,
      });
      return { code: 0, stdout, stderr };
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string };
      return {
        code: e.code ?? 1,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
      };
    }
  }

  it("prints exactly the JWT and one newline on the real stdout", async () => {
    // The claim layer 1 structurally cannot make: that NOTHING ELSE in the
    // module's import graph writes to fd 1. An `import "../ui.js"` added here
    // would not fail any in-process test and would still print a clack banner.
    const result = await spawnMint();
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\n$/,
    );
  });

  it("signs with the key the real process was given", async () => {
    // The positive control, repeated at process level: without it every
    // assertion in this block would hold for a process that printed a
    // constant.
    const [header, payload, signature] = (await spawnMint()).stdout
      .trim()
      .split(".");
    expect(signature).toBe(sign(`${header}.${payload}`, KEY));
  });

  it("cannot be talked into a different role by the AMBIENT environment", async () => {
    // The closing half of the in-process test of the same name, and it earns
    // its subprocess cost: a mutation run confirmed that
    // `process.env.ROLE ?? SANDBOX_PROXY_ROLE` survives every in-process
    // assertion, because those inject an env object rather than setting the
    // real one. Here the child's `process.env` IS the hostile environment, so
    // a module that read it directly would be caught.
    for (const name of [
      "ROLE",
      "SANDBOX_PROXY_ROLE",
      "PGROLE",
      "DB_ROLE",
      "SUPABASE_ROLE",
    ]) {
      const jwt = (await spawnMint({ [name]: "service_role" })).stdout.trim();
      expect(decode(jwt.split(".")[1]!).role, name).toBe("sandbox_proxy");
    }
  }, 60_000);

  it("exits non-zero with an EMPTY stdout on every refusal", async () => {
    for (const env of [
      { SUPABASE_JWT_SIGNING_KEY: undefined },
      { SUPABASE_JWT_SIGNING_KEY: "" },
      { SUPABASE_JWT_SIGNING_KEY: " ".repeat(32) },
      { SUPABASE_JWT_SIGNING_KEY: "too-short" },
      { DEPLOY_ENV: undefined },
      { DEPLOY_ENV: "" },
      { DEPLOY_ENV: "development" },
      { DEPLOY_ENV: "production-apply" },
    ]) {
      const result = await spawnMint(env);
      const label = JSON.stringify(env);
      expect(result.code, label).not.toBe(0);
      expect(result.stdout, label).toBe("");
      expect(result.stderr.trim().length, label).toBeGreaterThan(0);
      // Not a crash. See the in-process expectRefusal for why this matters.
      expect(result.stderr, label).not.toMatch(/^\s+at /m);
      expect(result.stderr, label).not.toMatch(/TypeError|ReferenceError/);
    }
  }, 60_000);
});

// ── Layer 3: the wiring this module cannot defend itself against ─────────────

describe("the dispatch in cli.ts", () => {
  it("handles mint-token BEFORE intro() writes to stdout", () => {
    // ⚠️ THE ACTUAL TRAP IN THIS MIGRATION, and it lives in a file this module
    // does not own. Measured, not assumed: `intro()` from @clack/prompts
    // writes to STDOUT (165 bytes of box drawing), never stderr. Dispatched
    // after it, `deploy mint-token` emits
    //   ┌  DevDogs devtools\n│\n<jwt>
    // which does not error. It deploys a malformed credential that fails
    // later, at the edge.
    const cli = readFileSync(join(HERE, "..", "cli.ts"), "utf8");

    // Anchored on CODE, not prose. An earlier version of this test searched
    // for `intro(` and `mint-token` as bare substrings and went red against
    // correct wiring, because both appear in the comment that explains the
    // ordering. Both anchors below are exact source constructs that appear
    // once each; `expect(...).toBe(1)` is what keeps that true.
    const introCall = 'intro("DevDogs devtools")';
    const dispatch = 'if (first === "deploy") {';

    expect(
      cli.split(introCall).length - 1,
      `${introCall} must appear once`,
    ).toBe(1);

    // Until `deploy` is wired there is nothing to order. The assertions below
    // are what stop that from being a permanent free pass.
    if (!cli.includes(dispatch)) return;

    expect(cli.split(dispatch).length - 1, `${dispatch} must appear once`).toBe(
      1,
    );
    expect(
      cli.indexOf(dispatch),
      "the `deploy` group must be dispatched before intro() writes to stdout",
    ).toBeLessThan(cli.indexOf(introCall));

    // ...and the dispatch must actually reach this command, or the ordering
    // above protects a route mint-token never takes.
    expect(
      cli,
      "cli.ts dispatches `deploy` but never routes mint-token",
    ).toContain("mint-token");
  });
});
