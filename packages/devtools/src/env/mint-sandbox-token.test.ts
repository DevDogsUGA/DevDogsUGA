import { execFile } from "node:child_process";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../instance.js";

/**
 * `scripts/mint-sandbox-token.mjs` — the one script in this repository whose
 * stdout is a production credential.
 *
 * Driven as a SUBPROCESS rather than by importing the module, because the
 * contract a deploy workflow depends on is a process contract: stdout is the
 * token and nothing else, a failure exits non-zero with its reason on stderr,
 * and nothing reaches stdout on a failing run. Importing `mintSandboxToken`
 * would test the arithmetic and leave every one of those unasserted.
 *
 * ⚠️ The child NEVER inherits `process.env`. Two reasons, and the second is the
 * important one: a hermetic environment makes DEPLOY_ENV and the signing key
 * explicit per test, and — since a developer's shell may well hold the real
 * platform signing key — an inherited environment could have a test signing a
 * genuine credential and printing it into CI logs. Every case builds its
 * environment from `PATH` upward.
 */

const run = promisify(execFile);
const SCRIPT = join(PROJECT_ROOT, "scripts", "mint-sandbox-token.mjs");

/** Both 40 characters, matching the length of Supabase's legacy JWT secret. */
const KEY = "test-signing-key-not-a-real-one-01234567";
const OTHER_KEY = "different-signing-key-also-fake-98765432";
const REF = "abcdefghijklmnopqrst";

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

async function mint(
  env: Record<string, string | undefined> = {},
): Promise<Result> {
  // Spread last, so a test setting a key to "" overrides the default with an
  // empty value rather than being ignored.
  const child: Record<string, string | undefined> = {
    // Hermetic. See the header.
    PATH: process.env.PATH ?? "",
    DEPLOY_ENV: "production",
    SUPABASE_JWT_SIGNING_KEY: KEY,
    ...env,
  };
  // `undefined` means genuinely ABSENT, which is a different input from "" —
  // it is the one that reaches `signingKey.length` as undefined.
  for (const [key, value] of Object.entries(child)) {
    if (value === undefined) delete child[key];
  }

  try {
    const { stdout, stderr } = await run(process.execPath, [SCRIPT], {
      env: child,
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

async function token(
  env: Record<string, string | undefined> = {},
): Promise<string> {
  const result = await mint(env);
  expect(result.code, result.stderr).toBe(0);
  return result.stdout.trim();
}

// ─────────────────────────────────────────────────────────────────────────────

describe("the signature", () => {
  it("is a real HMAC-SHA256 over the header and payload", async () => {
    // THE POSITIVE CONTROL. Every claim assertion below would pass just as
    // happily against a token whose third segment was a constant, a hash of
    // the wrong thing, or the empty string — the payload is readable without
    // any key at all. This is the only test that fails if the signing step
    // stops signing.
    const jwt = await token();
    const [header, payload, signature] = jwt.split(".");
    expect(signature).toBe(sign(`${header}.${payload}`, KEY));
  });

  it("does not verify under a different key", async () => {
    // The negative half of the control above: it proves the comparison there
    // discriminates. Without this, `sign()` returning a constant would make
    // both tests green.
    const jwt = await token();
    const [header, payload, signature] = jwt.split(".");
    expect(signature).not.toBe(sign(`${header}.${payload}`, OTHER_KEY));
  });

  it("changes when the signing key changes, with the same claims", async () => {
    // Rotation's whole premise: two environments hold different keys, so the
    // same claims must not yield the same credential.
    const a = await token({ SUPABASE_JWT_SIGNING_KEY: KEY });
    const b = await token({ SUPABASE_JWT_SIGNING_KEY: OTHER_KEY });
    expect(a.split(".")[1]).toBe(b.split(".")[1]);
    expect(a.split(".")[2]).not.toBe(b.split(".")[2]);
  });

  it("is never empty, and the token is never unsigned", async () => {
    const parts = (await token()).split(".");
    expect(parts).toHaveLength(3);
    for (const part of parts) expect(part.length).toBeGreaterThan(0);
    expect(decode(parts[0]!).alg).not.toBe("none");
  });
});

describe("the claims", () => {
  it("declares HS256, and never an algorithm the caller chose", async () => {
    expect(decode((await token()).split(".")[0]!)).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
  });

  it("carries the sandbox_proxy role", async () => {
    // The role PostgREST passes to SET ROLE. It is a real cluster role granted
    // to `authenticator`, holding EXECUTE on two functions and no table grants
    // (migration 20260805000002_platform_sandbox_credentials.sql).
    expect(decode((await token()).split(".")[1]!).role).toBe("sandbox_proxy");
  });

  it("cannot be talked into a different role by the environment", async () => {
    // The failure this guards is a token authorizing as the database owner.
    // The same signing key would produce one happily; the only thing stopping
    // it is that the role is a constant in the script, so the constant is what
    // gets asserted — against every name somebody might plausibly try.
    for (const key of ["ROLE", "SANDBOX_PROXY_ROLE", "PGROLE", "DB_ROLE"]) {
      const claims = decode(
        (await token({ [key]: "service_role" })).split(".")[1]!,
      );
      expect(claims.role).toBe("sandbox_proxy");
    }
  });

  it("expires 90 days after it is issued", async () => {
    const claims = decode((await token()).split(".")[1]!) as {
      iat: number;
      exp: number;
    };
    expect(claims.exp - claims.iat).toBe(90 * 24 * 60 * 60);
  });

  it("issues at roughly now, in seconds rather than milliseconds", async () => {
    // A `Date.now()` that forgot to divide produces an `iat` 1000x too large
    // and an `exp` in the year 57000 — a token that never expires, which is
    // the failure the 90-day window exists to prevent, arriving silently.
    const claims = decode((await token()).split(".")[1]!) as { iat: number };
    const now = Math.floor(Date.now() / 1000);
    expect(Math.abs(claims.iat - now)).toBeLessThan(60);
  });

  it("includes ref when PROJECT_REF is set", async () => {
    expect(decode((await token({ PROJECT_REF: REF })).split(".")[1]!).ref).toBe(
      REF,
    );
  });

  it("omits ref rather than guessing when PROJECT_REF is unset", async () => {
    // An absent `ref` is at worst ignored; a wrong one is rejected outright.
    const claims = decode((await token()).split(".")[1]!);
    expect("ref" in claims).toBe(false);
  });
});

describe("stdout is the token and nothing else", () => {
  it("prints exactly the JWT and one newline", async () => {
    const result = await mint();
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\n$/,
    );
  });
});

describe("refusing to mint", () => {
  /** Every refusal must look identical from the caller's side. */
  async function expectRefusal(
    env: Record<string, string | undefined>,
  ): Promise<Result> {
    const result = await mint(env);
    expect(result.code).not.toBe(0);
    // The one that matters: a caller piping stdout into `wrangler secret put`
    // must receive NOTHING on a failing run. A token signed with an empty or
    // undefined key would be perfectly well-formed and forgeable by anyone.
    expect(result.stdout).toBe("");
    expect(result.stderr.trim().length).toBeGreaterThan(0);
    // A CLEAN refusal, not a crash. An uncaught TypeError also exits non-zero
    // with an empty stdout, so "exit code 1" alone cannot tell "this script
    // decided not to mint" apart from "this script fell over" — and the second
    // is a bug that the first would hide forever.
    expect(result.stderr).not.toMatch(/^\s+at /m);
    expect(result.stderr).not.toMatch(/TypeError|ReferenceError/);
    return result;
  }

  it("refuses an ABSENT signing key cleanly, naming it", async () => {
    // Absent, not empty: this is the input that reaches the guard as
    // `undefined` and would throw on `.length` if the type check were dropped.
    const { stderr } = await expectRefusal({
      SUPABASE_JWT_SIGNING_KEY: undefined,
    });
    expect(stderr).toContain("SUPABASE_JWT_SIGNING_KEY");
  });

  it("refuses an empty signing key, naming it", async () => {
    const { stderr } = await expectRefusal({ SUPABASE_JWT_SIGNING_KEY: "" });
    expect(stderr).toContain("SUPABASE_JWT_SIGNING_KEY");
  });

  it("refuses a whitespace-only key LONG ENOUGH to clear the length floor", async () => {
    // Isolates the emptiness guard from the length guard, which is not
    // pedantry: a mutation run found that deleting the emptiness check broke
    // no test, because every short blank value was being caught by the length
    // floor instead. 32 spaces is a legal HMAC key that would sign a
    // real-looking token, and only the trim() check refuses it.
    await expectRefusal({ SUPABASE_JWT_SIGNING_KEY: " ".repeat(32) });
  });

  it("refuses a signing key shorter than 32 characters", async () => {
    const { stderr } = await expectRefusal({
      SUPABASE_JWT_SIGNING_KEY: "too-short",
    });
    expect(stderr).toContain("32");
  });

  it("accepts exactly 32 characters — the floor is not off by one", async () => {
    // The counterpart to the test above, so "refuses everything" cannot pass
    // for "enforces a floor".
    const jwt = await token({ SUPABASE_JWT_SIGNING_KEY: "x".repeat(32) });
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("refuses an unset DEPLOY_ENV rather than defaulting", async () => {
    // A default would sign a production credential with whatever key the
    // development env file holds. apps/sandbox's deploy scripts shipped
    // without DEPLOY_ENV once already.
    const { stderr } = await expectRefusal({ DEPLOY_ENV: "" });
    expect(stderr).toContain("DEPLOY_ENV");
  });

  it("refuses development — this token only exists for a deployed Worker", async () => {
    await expectRefusal({ DEPLOY_ENV: "development" });
  });

  it("refuses an unrecognised DEPLOY_ENV instead of treating it as deployed", async () => {
    // `production-apply` is a real GitHub environment name and not a deploy
    // target; an allowlist is what keeps it from being read as one.
    await expectRefusal({ DEPLOY_ENV: "production-apply" });
  });

  it("mints for staging and production, so the allowlist is not just closed", async () => {
    for (const environment of ["staging", "production"]) {
      const result = await mint({ DEPLOY_ENV: environment });
      expect(result.code, result.stderr).toBe(0);
    }
  });
});
