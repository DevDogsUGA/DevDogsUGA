/**
 * These assert the properties the rest of the system is allowed to rely on.
 *
 * Every case asserts both an allow and a deny, for the reason the persona
 * suites give: a test that only checks the allow side passes just as happily
 * when the mechanism is missing entirely. The mechanism here is a *refusal*, so
 * that failure mode is the likely one.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  applyOnlyKeys,
  declarations,
  declare,
  define,
  localStackKeys,
  metaOf,
  mintedKeys,
  neverSecretKeys,
  neverStoreKeys,
  resetRegistry,
  storableKeys,
  UndeclaredVariableError,
  variableKeys,
  variables,
} from "./define.js";
import {
  DEPLOY_ENVIRONMENTS,
  ENV_TARGETS,
  TARGETS,
  VAULT_TARGETS,
  fileFor,
  isDeployEnvironment,
  isVaultTarget,
  projectFor,
  resolveEnvironment,
  UnknownEnvironmentError,
} from "./targets.js";

beforeEach(() => {
  resetRegistry();
});

describe("define", () => {
  it("attaches metadata a caller can read back", () => {
    const schema = define(z.string(), {
      doc: "A secret.",
      scope: "environment",
      secrecy: "secret",
    });

    expect(metaOf(schema)).toMatchObject({ secrecy: "secret" });
    // And it is still the schema, not a wrapper around one.
    expect(schema.parse("value")).toBe("value");
  });

  it("leaves a schema that skipped it unregistered", () => {
    // The deny side of the same claim, and the reason `declare` has to check
    // rather than trust: an undeclared schema is perfectly valid zod.
    expect(metaOf(z.string())).toBeUndefined();
  });

  it("round-trips the generation fields", () => {
    // `example` and `commented` feed `env example`/`env init`; if they
    // fell out of `metaOf`, the generated .env.example would silently lose its
    // $VAR derivations and its disable-by-default commenting.
    const schema = define(z.string().optional(), {
      doc: "Derived from API_URL.",
      scope: "environment",
      secrecy: "public",
      example: "$API_URL",
      commented: true,
    });

    expect(metaOf(schema)).toMatchObject({
      example: "$API_URL",
      commented: true,
    });
    // And their absence stays absence, not a default.
    const bare = define(z.string(), {
      doc: "Plain.",
      scope: "environment",
      secrecy: "secret",
    });
    expect(metaOf(bare)?.example).toBeUndefined();
    expect(metaOf(bare)?.commented).toBeUndefined();
  });
});

describe("declare", () => {
  it("refuses a manifest containing a schema that skipped define()", () => {
    expect(() =>
      declare({
        source: "test-app",
        server: {
          DECLARED: define(z.string(), {
            doc: "Fine.",
            scope: "default",
            secrecy: "public",
          }),
          FORGOTTEN: z.string(),
        },
      }),
    ).toThrow(UndeclaredVariableError);
  });

  it("names every variable that skipped it, not just the first", () => {
    // One-at-a-time errors turn a five-variable manifest into five edit-run
    // cycles, which is how people start reaching for the escape hatch.
    let message = "";
    try {
      declare({
        source: "test-app",
        server: { A: z.string(), B: z.string() },
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("A");
    expect(message).toContain("B");
  });

  it("records client and server declarations, and tells them apart", () => {
    declare({
      source: "test-app",
      server: {
        SECRET_KEY: define(z.string(), {
          doc: "Server only.",
          scope: "environment",
          secrecy: "secret",
        }),
      },
      client: {
        NEXT_PUBLIC_BUCKET: define(z.string(), {
          doc: "Inlined into the bundle.",
          scope: "default",
          secrecy: "public",
        }),
      },
    });

    const byKey = new Map(declarations().map((e) => [e.key, e]));
    expect(byKey.get("SECRET_KEY")?.client).toBe(false);
    expect(byKey.get("NEXT_PUBLIC_BUCKET")?.client).toBe(true);
  });

  it("keeps both declarations when two apps declare the same variable", () => {
    const meta = {
      doc: "Shared.",
      scope: "environment",
      secrecy: "secret",
    } as const;

    declare({
      source: "platform",
      server: { DISCORD_TOKEN: define(z.string(), meta) },
    });
    declare({
      source: "sandbox",
      server: { DISCORD_TOKEN: define(z.string(), meta) },
    });

    // Collapsed for the derived selectors, kept apart for the error message.
    expect(variables().get("DISCORD_TOKEN")).toHaveLength(2);
    expect(
      variables()
        .get("DISCORD_TOKEN")
        ?.map((e) => e.source),
    ).toEqual(["platform", "sandbox"]);
  });
});

describe("derived selectors", () => {
  beforeEach(() => {
    declare({
      source: "test-app",
      server: {
        CRON_SECRET: define(z.string(), {
          doc: "Deployed secret.",
          scope: "environment",
          secrecy: "secret",
        }),
        SUPABASE_ACCESS_TOKEN: define(z.string(), {
          doc: "Reshapes production, no dry run.",
          scope: "environment",
          secrecy: "secret",
          tier: "apply",
        }),
        BWS_ACCESS_TOKEN: define(z.string(), {
          doc: "Unlocks every Bitwarden project.",
          scope: "environment",
          secrecy: "never-store",
        }),
        GITHUB_ORG: define(z.string(), {
          doc: "Committed, identical everywhere.",
          scope: "default",
          secrecy: "public",
        }),
        DB_URL: define(z.string(), {
          doc: "From `supabase status`.",
          scope: "environment",
          secrecy: "secret",
          localStack: true,
        }),
        DEV_VPN_HOST: define(z.string(), {
          doc: "One machine's IP.",
          scope: "developer",
          secrecy: "public",
        }),
        PROJECT_REF: define(z.string(), {
          doc: "Public, and different in every environment.",
          scope: "environment",
          secrecy: "public",
        }),
        API_URL: define(z.string(), {
          doc: "Public, per-environment, and supplied locally by the stack.",
          scope: "environment",
          secrecy: "public",
          localStack: true,
        }),
        SANDBOX_PROXY_TOKEN: define(z.string(), {
          doc: "Signed at deploy time; the Worker holds the only copy.",
          scope: "environment",
          secrecy: "secret",
          minted: true,
        }),
      },
    });
  });

  it("sends deployed secrets onward and nothing else", () => {
    const storable = storableKeys();
    expect(storable).toContain("CRON_SECRET");
    expect(storable).toContain("DB_URL");

    // The three denials, each for a different reason.
    expect(storable).not.toContain("BWS_ACCESS_TOKEN"); // never-store
    expect(storable).not.toContain("GITHUB_ORG"); // public, and committed
    expect(storable).not.toContain("DEV_VPN_HOST"); // one contributor's machine
  });

  it("separates never-store from ordinary secrets", () => {
    expect(neverStoreKeys()).toEqual(["BWS_ACCESS_TOKEN"]);
    expect(neverStoreKeys()).not.toContain("CRON_SECRET");
  });

  it("routes apply-tier secrets away from the ordinary deploy", () => {
    expect(applyOnlyKeys()).toEqual(["SUPABASE_ACCESS_TOKEN"]);
    // The allow side: an untiered secret is not swept into `apply` by default.
    expect(applyOnlyKeys()).not.toContain("CRON_SECRET");
  });

  it("marks what the local stack supplies", () => {
    // Both secrecies, because `localStack` is orthogonal to secrecy and the
    // routing code has to keep treating it that way.
    expect(localStackKeys()).toEqual(["API_URL", "DB_URL"]);
    expect(localStackKeys()).not.toContain("CRON_SECRET");
  });

  it("keeps public values out of the secret store", () => {
    expect(neverSecretKeys()).toContain("GITHUB_ORG");
    expect(neverSecretKeys()).not.toContain("CRON_SECRET");
  });

  it("sends public per-environment values onward as variables", () => {
    const variableSet = variableKeys();
    expect(variableSet).toContain("PROJECT_REF");

    // The four denials, each for a different reason.
    expect(variableSet).not.toContain("CRON_SECRET"); // a secret
    expect(variableSet).not.toContain("BWS_ACCESS_TOKEN"); // never-store
    expect(variableSet).not.toContain("GITHUB_ORG"); // committed, scope default
    expect(variableSet).not.toContain("DEV_VPN_HOST"); // one contributor's box
  });

  it("keeps a localStack public value in the variable set", () => {
    // `localStack` says "supplied by `supabase status` in DEVELOPMENT", which
    // is a statement about the local stack and about how `.env.example`
    // renders. It is not a reason to withhold the value from staging or
    // production, where there is no local stack to supply it. Excluding these
    // would point a deployed Worker at nothing, silently.
    expect(variableKeys()).toContain("API_URL");
    // The positive control for the assertion above: the set is non-empty and
    // being computed, so `toContain` is not passing over a bug that made
    // everything a variable or nothing one.
    expect(variableKeys()).not.toContain("DB_URL"); // localStack, but a secret
  });

  it("never lets one key be both storable and a variable", () => {
    // They differ only in `secrecy`, so an overlap is impossible today. Pinned
    // because the two consumers disagree about what to do with the same key:
    // one seals it into a write-only store, the other publishes it in
    // plaintext, and a key in both sets would go to BOTH.
    const storable = new Set(storableKeys());
    for (const key of variableKeys()) {
      expect(storable.has(key), `${key} is both storable and a variable`).toBe(
        false,
      );
    }
    // Non-vacuous: quantifying over an empty set would pass just as happily.
    expect(variableKeys().length).toBeGreaterThan(0);
  });

  it("never lets a minted key become a variable", () => {
    // In the real registry the one minted key is also a secret, so `secrecy`
    // alone would exclude it and the `minted !== true` clause would be
    // unfalsifiable. A guard no test can turn red is a guard that will be
    // deleted as redundant. So this declares the case the clause exists for: a
    // PUBLIC minted value, which `secrecy` would wave through.
    //
    // Uploading one is not merely untidy. A minted credential is signed at
    // deploy time and the deploy target holds the only copy, so a value under
    // that name in somebody's `.env` is hand-pasted. Pushing it creates the
    // long-lived copy the design exists to avoid, which the next deploy then
    // silently contradicts.
    declare({
      source: "odd-app",
      server: {
        PUBLIC_MINTED: define(z.string(), {
          doc: "Public, per-environment, and signed at deploy time.",
          scope: "environment",
          secrecy: "public",
          minted: true,
        }),
      },
    });

    expect(mintedKeys()).toContain("PUBLIC_MINTED");
    const variableSet = new Set(variableKeys());
    for (const key of mintedKeys()) {
      expect(variableSet.has(key), `${key} is minted yet a variable`).toBe(
        false,
      );
    }
    // POSITIVE CONTROL: an otherwise identical declaration without `minted`
    // IS a variable, so the exclusion above is `minted` doing the work.
    expect(variableSet.has("PROJECT_REF")).toBe(true);
  });

  it("treats one app calling a variable secret as enough", () => {
    // Two apps disagreeing is a bug the completeness test catches. Until it
    // does, the safe reading is the stricter one. The alternative fails open in
    // exactly the case that matters.
    declare({
      source: "careless-app",
      server: {
        CRON_SECRET: define(z.string(), {
          doc: "Wrongly declared public.",
          scope: "default",
          secrecy: "public",
        }),
      },
    });

    expect(storableKeys()).toContain("CRON_SECRET");
  });
});

describe("resolveEnvironment", () => {
  it("defaults to development when DEPLOY_ENV is unset or empty", () => {
    expect(resolveEnvironment(undefined)).toBe("development");
    // Empty counts as unset: `DEPLOY_ENV=` in a shell script is not a request
    // for an environment named "".
    expect(resolveEnvironment("")).toBe("development");
  });

  it("accepts every declared environment", () => {
    for (const environment of DEPLOY_ENVIRONMENTS) {
      expect(resolveEnvironment(environment)).toBe(environment);
    }
  });

  it("refuses `example`, which would otherwise load a committed file", () => {
    // The case that makes this an allowlist rather than a filename suffix.
    // `.env.example` exists, and its placeholders pass most of the schema, so
    // the app would boot, look configured, and point at nothing.
    expect(() => resolveEnvironment("example")).toThrow(
      UnknownEnvironmentError,
    );
  });

  it("refuses preflight, which is a target but not an environment", () => {
    // ⚠️ Not an oversight to be tidied away. `.env.preflight` is a staging
    // area for pushing credentials into the preflight vault project; nothing
    // boots from it, and its credentials are read-only by construction.
    expect(() => resolveEnvironment("preflight")).toThrow(
      UnknownEnvironmentError,
    );
    expect(() => resolveEnvironment("preflight")).toThrow(
      /development, staging, production/,
    );
  });

  it("refuses a near-miss rather than treating it as deployed", () => {
    // The old `switchEnvironment()` read anything that was not "development" as
    // deployed, so this applied the strict schemas while every
    // `=== "production"` gate stayed shut: configured and wrong at once.
    expect(() => resolveEnvironment("production-apply")).toThrow(
      UnknownEnvironmentError,
    );
    expect(() => resolveEnvironment("prod")).toThrow(UnknownEnvironmentError);
  });
});

describe("fileFor", () => {
  it("maps development to `.env` and the rest to a suffix", () => {
    // `.env` IS development rather than a base the others extend: a variable
    // present in `.env` and forgotten in `.env.production` would otherwise fall
    // through to the development value while DEPLOY_ENV said production.
    expect(fileFor("development")).toBe(".env");
    expect(fileFor("preflight")).toBe(".env.preflight");
    expect(fileFor("staging")).toBe(".env.staging");
    expect(fileFor("production")).toBe(".env.production");
  });

  it("gives every target a distinct file", () => {
    const files = ENV_TARGETS.map(fileFor);
    expect(new Set(files).size).toBe(files.length);
  });
});

/**
 * The table that replaced two overlapping enums.
 *
 * These are deliberately literal rather than derived from `TARGETS`: a test
 * that reads the table it is checking passes for any table. The point of the
 * unification is that these four rows are the whole vocabulary, so they are
 * written out once, here, by hand.
 */
describe("the target table", () => {
  it("has exactly four targets, least- to most-dangerous", () => {
    // The ORDER is load-bearing: it is what the interactive picker lists, so a
    // reflexive Enter must never land on production.
    expect(ENV_TARGETS).toEqual([
      "development",
      "preflight",
      "staging",
      "production",
    ]);
  });

  it("maps each vault target to its Bitwarden project", () => {
    expect(projectFor("preflight")).toBe("preflight");
    expect(projectFor("staging")).toBe("staging");
    expect(projectFor("production")).toBe("production");
  });

  it("gives development no project, which is what makes it refusable", () => {
    // `null` rather than an omitted row. `development` is a real target with a
    // real file; what it lacks is a shared credential set, and pull/push/audit
    // refuse it on exactly this fact.
    expect(projectFor("development")).toBeNull();
    expect(isVaultTarget("development")).toBe(false);
    expect(VAULT_TARGETS).toEqual(["preflight", "staging", "production"]);
  });

  it("keeps preflight out of the deploy environments", () => {
    // The two old enums diverged at BOTH ends, and this is the other end.
    // `preflight` has a file and a project and is still not something
    // DEPLOY_ENV may name.
    expect(DEPLOY_ENVIRONMENTS).toEqual([
      "development",
      "staging",
      "production",
    ]);
    expect(isDeployEnvironment("preflight")).toBe(false);
    expect(isVaultTarget("preflight")).toBe(true);
  });

  it("makes the two subsets disagree, which is why one flag could not serve both", () => {
    // A positive control on the whole change: if `VAULT_TARGETS` and
    // `DEPLOY_ENVIRONMENTS` were ever the same list, every test above would
    // still pass while proving nothing. They overlap in the middle and differ
    // at both ends, and that is precisely why `--env` meant two things.
    expect(VAULT_TARGETS).not.toEqual(DEPLOY_ENVIRONMENTS);
    expect(
      VAULT_TARGETS.filter((t) =>
        (DEPLOY_ENVIRONMENTS as readonly string[]).includes(t),
      ),
    ).toEqual(["staging", "production"]);
  });

  it("declares every row completely", () => {
    // Cheap insurance against a row added with a field left off, which would
    // read as `undefined`. An undefined `project` is not `null`, so it would
    // slip past the vault-target filter as a truthy-ish nothing.
    for (const target of ENV_TARGETS) {
      const spec = TARGETS[target];
      expect(typeof spec.file).toBe("string");
      expect(spec.project === null || typeof spec.project === "string").toBe(
        true,
      );
      expect(typeof spec.deployEnv).toBe("boolean");
      expect(typeof spec.guarded).toBe("boolean");
    }
  });
});
