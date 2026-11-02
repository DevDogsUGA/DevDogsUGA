import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEPLOY_ENVIRONMENTS,
  PRODUCTS,
  PRODUCT_NAMES,
  isProduct,
  productFileFor,
  productGithubEnvironment,
  productProjectFor,
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
    expect(() => resolveEnvironment("production-build")).toThrow(
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

describe("product targets", () => {
  it("derives every product fact from the one vault-target row", () => {
    for (const product of PRODUCT_NAMES) {
      for (const target of VAULT_TARGETS) {
        expect(productFileFor(product, target)).toBe(fileFor(target));
        expect(productProjectFor(product, target)).toBe(projectFor(target));
        expect(productGithubEnvironment(target)).toBe(target);
      }
    }
  });

  it("shares the existing tier projects with the platform", () => {
    expect(productProjectFor("dogdays", "staging")).toBe("staging");
    expect(productProjectFor("dogpack", "production")).toBe("production");
  });

  it("recognises products and refuses anything else", () => {
    expect(isProduct("dogdays")).toBe(true);
    expect(isProduct("dogpack")).toBe(true);
    expect(isProduct("platform")).toBe(false);
  });

  it("points each product at its own repository", () => {
    expect(PRODUCTS.dogdays.repo).toBe("DevDogsUGA/DogDays");
    expect(PRODUCTS.dogpack.repo).toBe("DevDogsUGA/DogPack");
  });

  it("lists DogDays' public keys as its GitHub environments hold them", () => {
    expect([...PRODUCTS.dogdays.variables]).toEqual([
      "API_URL",
      "BASE_URL",
      "BASE_URL_CALLBACK",
      "CATALOG_URL",
      "DEVDOGS_OAUTH_BASE_URL",
      "GOOGLE_MAPS_API_KEY",
      "PROJECT_REF",
      "PUBLISHABLE_KEY",
      "SENTRY_DSN",
    ]);
    expect([...PRODUCTS.dogpack.variables]).toEqual([
      "API_URL",
      "DEVDOGS_OAUTH_BASE_URL",
      "PLATFORM_API_URL",
      "PROJECT_REF",
      "PUBLISHABLE_KEY",
    ]);
  });

  // Pins each list to the names the product's workflows and scripts read from
  // the `vars` context. Runs when a checkout is named (DOGDAYS_CHECKOUT,
  // DOGPACK_CHECKOUT); skipped otherwise so the suite needs no sibling repo.
  for (const product of PRODUCT_NAMES) {
    const dir = process.env[`${product.toUpperCase()}_CHECKOUT`];
    it.skipIf(!dir || !existsSync(dir ?? ""))(
      `${product}'s public keys cover every vars name its CI reads`,
      () => {
        const root = join(dir!, ".github");
        const read: string[] = [];
        const walk = (d: string) => {
          for (const entry of readdirSync(d)) {
            const path = join(d, entry);
            if (statSync(path).isDirectory()) walk(path);
            else read.push(readFileSync(path, "utf8"));
          }
        };
        walk(root);
        const text = read.join("\n");
        const names = new Set<string>();
        for (const m of text.matchAll(/\bvars\.([A-Z][A-Z0-9_]*)/g)) {
          names.add(m[1]!);
        }
        // worker-build.sh reads the vars JSON with get/need calls.
        for (const m of text.matchAll(/\b(?:get|need) ([A-Z][A-Z0-9_]*)\b/g)) {
          names.add(m[1]!);
        }
        // Feature switches, not environment configuration.
        const switches = (n: string) => /^DOG[A-Z]+_/.test(n);
        const missing = [...names]
          .filter((n) => !switches(n))
          .filter(
            (n) =>
              !(PRODUCTS[product].variables as readonly string[]).includes(n),
          );
        expect(missing).toEqual([]);
      },
    );
  }
});
