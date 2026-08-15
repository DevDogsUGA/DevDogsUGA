/**
 * These assert the properties the rest of the system is allowed to rely on.
 *
 * Every case asserts both an allow and a deny, for the reason the persona
 * suites give: a test that only checks the allow side passes just as happily
 * when the mechanism is missing entirely — and the mechanism here is a
 * *refusal*, so that failure mode is the likely one.
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
  neverSecretKeys,
  neverStoreKeys,
  resetRegistry,
  storableKeys,
  UndeclaredVariableError,
  variables,
} from "./define.js";
import {
  DEPLOY_ENVIRONMENTS,
  envFileFor,
  resolveEnvironment,
  UnknownEnvironmentError,
} from "./environments.js";

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
    // `example` and `commented` feed `secrets example`/`secrets init`; if they
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
    expect(localStackKeys()).toEqual(["DB_URL"]);
    expect(localStackKeys()).not.toContain("CRON_SECRET");
  });

  it("keeps public values out of the secret store", () => {
    expect(neverSecretKeys()).toContain("GITHUB_ORG");
    expect(neverSecretKeys()).not.toContain("CRON_SECRET");
  });

  it("treats one app calling a variable secret as enough", () => {
    // Two apps disagreeing is a bug the completeness test catches. Until it
    // does, the safe reading is the stricter one — the alternative fails open
    // in exactly the case that matters.
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
    // `.env.example` exists, and its placeholders pass most of the schema — the
    // app would boot, look configured, and point at nothing.
    expect(() => resolveEnvironment("example")).toThrow(
      UnknownEnvironmentError,
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

describe("envFileFor", () => {
  it("maps development to `.env` and the rest to a suffix", () => {
    // `.env` IS development rather than a base the others extend: a variable
    // present in `.env` and forgotten in `.env.production` would otherwise fall
    // through to the development value while DEPLOY_ENV said production.
    expect(envFileFor("development")).toBe(".env");
    expect(envFileFor("staging")).toBe(".env.staging");
    expect(envFileFor("production")).toBe(".env.production");
  });

  it("gives every environment a distinct file", () => {
    const files = DEPLOY_ENVIRONMENTS.map(envFileFor);
    expect(new Set(files).size).toBe(files.length);
  });
});
