/**
 * The rendering rules, exercised against a registry this file controls.
 *
 * `example.test.ts` asserts the same rules over the REAL manifests, which is
 * what makes them true of the files people actually generate — but the real
 * registry can only show the cases it happens to contain. Three of the rules
 * that matter most have no example in it today:
 *
 *   * a derivation whose input is filtered OUT of the target file (every real
 *     one resolves, so the check that they resolve passes vacuously);
 *   * a public `example` that is a formula with a fill-me hole in it (today's
 *     only hybrid, `DB_URL`, is a secret and so is caught a gate earlier);
 *   * a section every one of whose keys is filtered out.
 *
 * Each of those is a value that would be pushed to a deployed environment if
 * the rule stopped working, so "no current declaration triggers it" is the
 * reason to write the test, not a reason to skip it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { declare, define, resetRegistry } from "@devdogsuga/env";
import { renderInit, runEnvInit } from "./example.js";

/**
 * Mocked because `runEnvInit` writes to the REPO ROOT — `PROJECT_ROOT` is
 * resolved from this file's location, not from `cwd` — and the three files it
 * would create are the ones an operator fills with real credentials.
 *
 * Nothing else in this file touches the filesystem: the registry here is
 * declared inline rather than discovered, so no manifest is ever imported.
 */
const writeFile = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("node:fs/promises", () => ({ writeFile, readFile: vi.fn() }));

vi.mock("@clack/prompts", () => ({
  cancel: vi.fn(),
  isCancel: () => false,
  log: { error: vi.fn(), info: vi.fn(), message: vi.fn(), success: vi.fn() },
  note: vi.fn(),
}));

const DATE = "2026-08-16";

/**
 * One declaration per rule, using real section names so the output is laid out
 * the way a real file is.
 *
 * `platform` exists to be emptied: its single key is a committed constant, so
 * no vault target carries it and the section has to disappear with it.
 */
beforeEach(() => {
  resetRegistry();

  declare({
    source: "platform",
    server: {
      COMMITTED_THING: define(z.string(), {
        doc: "Committed, identical everywhere.",
        scope: "default",
        secrecy: "public",
        example: "committed-value",
      }),
    },
  });

  declare({
    source: "supabase",
    server: {
      ANCHOR: define(z.string(), {
        doc: "A per-environment public value other lines derive from.",
        scope: "environment",
        secrecy: "public",
      }),
      DERIVED_OK: define(z.string(), {
        doc: "Derived from a key this file carries.",
        scope: "environment",
        secrecy: "public",
        example: "https://$ANCHOR.example.com",
      }),
      DERIVED_MISSING: define(z.string(), {
        doc: "Derived from a key no vault target carries.",
        scope: "environment",
        secrecy: "public",
        example: "$COMMITTED_THING/callback",
      }),
      HYBRID: define(z.string(), {
        doc: "A formula with a fill-me hole punched into it.",
        scope: "environment",
        secrecy: "public",
        example: "postgresql://$ANCHOR:<password>@<host>:5432/postgres",
      }),
      LOCALHOST: define(z.string(), {
        doc: "A development default, correct in development only.",
        scope: "environment",
        secrecy: "public",
        example: "http://localhost:3000",
      }),
      SECRET_SHAPE: define(z.string(), {
        doc: "A secret whose example is a shape, not a value.",
        scope: "environment",
        secrecy: "secret",
        example: "$ANCHOR-flavoured-placeholder",
      }),
      MUST_FILL: define(z.string().optional(), {
        doc: "A secret the registry asks to ship commented out.",
        scope: "environment",
        secrecy: "secret",
        commented: true,
      }),
      APPLY_ONLY: define(z.string().optional(), {
        doc: "A credential that can reshape production.",
        scope: "environment",
        secrecy: "secret",
        tier: "apply",
      }),
      NARROW_ONE: define(z.string().optional(), {
        doc: "A key with a deliberately weaker credential for the CI tier.",
        scope: "environment",
        secrecy: "secret",
        narrowed: true,
      }),
      HALF_NARROW: define(z.string().optional(), {
        doc: "Marked narrowed by ONE of its two declarations. See below.",
        scope: "environment",
        secrecy: "secret",
        narrowed: true,
      }),
      MINTED_ONE: define(z.string().optional(), {
        doc: "Signed at deploy time; no stored copy exists.",
        scope: "environment",
        secrecy: "secret",
        minted: true,
      }),
      VAULT_TOKEN: define(z.string().optional(), {
        doc: "Must never be stored anywhere but the operator's own vault.",
        scope: "environment",
        secrecy: "never-store",
      }),
      DEV_ONLY: define(z.string().optional(), {
        doc: "One contributor's own machine.",
        scope: "developer",
        secrecy: "public",
        example: "10.0.0.1",
      }),
    },
  });

  // A SECOND declaration of `HALF_NARROW`, this one WITHOUT the marker.
  //
  // Two manifests disagreeing about a key is a bug the real registry's
  // completeness test catches — but it catches it after the fact, and until it
  // does, something has to decide what the disagreement means. For every other
  // flag the safe reading is "one app calling it a secret makes it a secret".
  // For this one it inverts: `narrowed` is an EXEMPTION from an exclusion, so
  // honouring a single mention would let a key into a project whose GitHub
  // environment `main` can read on the strength of half a declaration.
  declare({
    source: "devtools",
    server: {
      HALF_NARROW: define(z.string().optional(), {
        doc: "The same key, declared here without the marker.",
        scope: "environment",
        secrecy: "secret",
      }),
    },
  });
});

/** `KEY="value"` → value; `null` when the key has no assignable line. */
function valueOf(text: string, key: string): string | null {
  const match = new RegExp(`^${key}="(.*)"$`, "m").exec(text);
  return match ? match[1]! : null;
}

function isCommented(text: string, key: string): boolean {
  return new RegExp(`^#\\s?${key}="`, "m").test(text);
}

describe("a vault target's file", () => {
  it("keeps a derivation whose input is in the same file", () => {
    const staging = renderInit("staging", DATE);
    expect(valueOf(staging, "ANCHOR")).toBe("");
    expect(valueOf(staging, "DERIVED_OK")).toBe("https://$ANCHOR.example.com");
  });

  it("blanks a derivation whose input is not", () => {
    // `$COMMITTED_THING` is a committed constant, so it has no line here and
    // dotenvx would expand the formula to nothing. Shipping it would push the
    // literal `$COMMITTED_THING/callback` to Bitwarden, sync it to GitHub, and
    // write it verbatim into a deployed environment.
    const staging = renderInit("staging", DATE);
    expect(valueOf(staging, "COMMITTED_THING")).toBeNull();
    expect(valueOf(staging, "DERIVED_MISSING")).toBe("");
  });

  it("blanks a formula with a fill-me hole in it", () => {
    expect(valueOf(renderInit("staging", DATE), "HYBRID")).toBe("");
  });

  it("blanks a development default and a secret's shape", () => {
    const staging = renderInit("staging", DATE);
    expect(valueOf(staging, "LOCALHOST")).toBe("");
    // A `$` in a secret's example is a shape, never a value — the gate that
    // keeps `DB_URL`'s `<password>` out of a deployed environment.
    expect(valueOf(staging, "SECRET_SHAPE")).toBe("");
  });

  it("ships a `commented: true` key ready to fill in", () => {
    const staging = renderInit("staging", DATE);
    expect(valueOf(staging, "MUST_FILL")).toBe("");
    expect(isCommented(staging, "MUST_FILL")).toBe(false);
  });

  it("routes the apply tier to production alone", () => {
    expect(valueOf(renderInit("staging", DATE), "APPLY_ONLY")).toBeNull();
    expect(valueOf(renderInit("preflight", DATE), "APPLY_ONLY")).toBeNull();
    expect(valueOf(renderInit("production", DATE), "APPLY_ONLY")).toBe("");
  });

  it("leaves out what a push would never carry", () => {
    const staging = renderInit("staging", DATE);
    for (const key of [
      "COMMITTED_THING",
      "DEV_ONLY",
      "MINTED_ONE",
      "VAULT_TOKEN",
    ]) {
      expect(valueOf(staging, key), key).toBeNull();
      expect(isCommented(staging, key), key).toBe(false);
    }
  });

  it("gives a target no app boots from only the narrowed keys", () => {
    // The registry here is entirely synthetic, so `preflight` carrying exactly
    // `NARROW_ONE` is a property of the RULE rather than of what the real
    // manifests happen to declare today. Everything else in this registry is
    // ordinary and routable, and none of it may reach a project whose GitHub
    // environment `main` can read.
    const preflight = renderInit("preflight", DATE);
    expect(valueOf(preflight, "NARROW_ONE")).toBe("");
    for (const key of ["ANCHOR", "DERIVED_OK", "SECRET_SHAPE", "MUST_FILL"]) {
      expect(valueOf(preflight, key), key).toBeNull();
      expect(isCommented(preflight, key), key).toBe(false);
    }
  });

  it("needs EVERY declaration to opt in, not just one", () => {
    // Fails open otherwise, and open here means a full-strength credential in
    // the CI-only vault project. `HALF_NARROW` carries the marker in one of its
    // two declarations; the deployed targets still get it, preflight does not.
    const preflight = renderInit("preflight", DATE);
    expect(valueOf(preflight, "HALF_NARROW")).toBeNull();
    expect(isCommented(preflight, "HALF_NARROW")).toBe(false);
    // POSITIVE CONTROL: the key is real and routes, so its absence above is
    // the disagreement rather than a key nothing declares.
    expect(valueOf(renderInit("staging", DATE), "HALF_NARROW")).toBe("");
    // …and the wholly-marked key in the same registry DID reach preflight, so
    // the marker still works at all.
    expect(valueOf(preflight, "NARROW_ONE")).toBe("");
  });

  it("does NOT withhold a narrowed key from the deployed targets", () => {
    // `narrowed` says "a weaker credential exists for the CI tier", not "this
    // key is CI's alone". Reading it the second way would strip a real secret
    // out of staging and production — a missing credential that pushes
    // cleanly, which is the failure mode this whole file exists to catch.
    expect(valueOf(renderInit("staging", DATE), "NARROW_ONE")).toBe("");
    expect(valueOf(renderInit("production", DATE), "NARROW_ONE")).toBe("");
  });

  it("drops a section whose every key was filtered out", () => {
    const staging = renderInit("staging", DATE);
    // `platform` declares one committed constant and nothing else, so a
    // heading for it would say "this app needs nothing here" — false, and the
    // reader has no way to tell it from a section that lost its keys to a bug.
    expect(staging).not.toContain("platform (apps/platform/src/env.ts)");
    expect(staging).toContain("supabase — read by config.toml");
  });
});

describe("the init command", () => {
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    previousExitCode = process.exitCode;
    writeFile.mockClear();
    writeFile.mockImplementation(async () => undefined);
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
  });

  it("writes the target's file, and refuses to clobber one", async () => {
    await runEnvInit("staging");

    const [path, contents, options] = writeFile.mock.calls[0]! as unknown as [
      string,
      string,
      { flag: string },
    ];
    expect(path).toMatch(/\.env\.staging$/);
    expect(contents).toContain("ANCHOR=");
    // `wx` makes the existence check and the write ONE operation. There is no
    // `--force` and no prompt on purpose: "replace my whole env file with
    // blanks" has no legitimate use, and this file may hold the only copy of a
    // deployed environment's credentials.
    expect(options).toEqual({ flag: "wx" });

    writeFile.mockClear();
    writeFile.mockImplementation(async () => {
      throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    });

    await runEnvInit("staging");
    expect(writeFile).toHaveBeenCalledTimes(1); // no second, forcing attempt
    expect(process.exitCode).toBe(1);
  });
});

describe("the development file, from the same declarations", () => {
  it("keeps every key, its example, and its comment marker", () => {
    const development = renderInit("development", DATE);

    expect(valueOf(development, "LOCALHOST")).toBe("http://localhost:3000");
    expect(valueOf(development, "COMMITTED_THING")).toBe("committed-value");
    expect(valueOf(development, "HYBRID")).toBe(
      "postgresql://$ANCHOR:<password>@<host>:5432/postgres",
    );
    expect(valueOf(development, "APPLY_ONLY")).toBe("");

    // Commented stays commented here: this is the file the Supabase CLI reads,
    // where an empty value for an enabled OAuth provider is a
    // `ProjectConfigParseError`, and nothing pushes it anywhere.
    expect(isCommented(development, "MUST_FILL")).toBe(true);
    expect(isCommented(development, "DEV_ONLY")).toBe(true);
    expect(valueOf(development, "MUST_FILL")).toBeNull();

    // A never-store key ships COMMENTED (2026-08-19): never in any remote
    // store — push refuses it by name — but the operator's own .env may hold
    // one, and the commented line is the home the BWS prompts' save revives.
    expect(valueOf(development, "VAULT_TOKEN")).toBeNull();
    expect(isCommented(development, "VAULT_TOKEN")).toBe(true);
    // A minted key keeps documentation and no line at all: no value exists.
    expect(development).toContain("# MINTED_ONE:");
    expect(valueOf(development, "MINTED_ONE")).toBeNull();
    expect(development).toContain("# MINTED_ONE:");

    // And the section a vault target drops is here.
    expect(development).toContain("platform (apps/platform/src/env.ts)");
  });
});
