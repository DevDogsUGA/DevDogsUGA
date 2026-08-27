import { beforeAll, describe, expect, it } from "vitest";
import {
  TARGETS,
  narrowedKeys,
  neverStoreKeys,
  variableKeys,
  variables,
} from "@devdogsuga/env";
import { loadRegistry } from "./discovery.js";
import { keysRoutedTo, selectForPush } from "./selection.js";

/**
 * The gate on what leaves this machine, and which of the two GitHub stores it
 * leaves for.
 *
 * Most tests here are a value that must NOT be uploaded, because that is the
 * direction with no undo: taking a credential back out of Bitwarden and GitHub
 * means rotating it at the issuer and hoping nothing read it in between. The
 * variable half adds a second irreversible direction — a secret sent to the
 * variable store is published in plaintext to everyone who can read the
 * repository's Actions config — so the routing assertions are two-sided
 * throughout: in the store it belongs to, and NOT in the other one.
 */

// The key sets are derived from the manifests now, so the registry has to be
// populated before `selectForPush` will answer (it refuses an empty registry
// rather than failing open).
beforeAll(async () => {
  await loadRegistry();
});

const env = (o: Record<string, string>) => Object.entries(o);

// Literals, not `neverStoreKeys()` / `applyOnlyKeys()`: vitest collects the
// `it` blocks before `beforeAll` runs, when the registry is still empty. The
// completeness test pins both derived sets to exactly these keys, and the
// first test below re-asserts the tie so a drifted literal fails loudly here
// rather than silently testing the wrong key.
// One member since `AIRTABLE_PAT` was removed. It stays an array rather
// than collapsing to a single constant: `never-store` is a class, and the
// loop below is what makes adding a second member automatically tested.
const NEVER_STORE = ["BWS_ACCESS_TOKEN"] as const;
const APPLY_ONLY = ["AIRTABLE_APPLY_PAT", "SUPABASE_ACCESS_TOKEN"] as const;

/**
 * The five public per-environment values that `supabase status` supplies
 * locally — and that nothing supplies on a deployed environment.
 *
 * Listed here because the tempting-and-wrong reading of `localStack: true` is
 * "absent from .env by design, therefore not needed anywhere". It means absent
 * from a DEVELOPMENT .env. Withholding these from staging or production points
 * the deploy at nothing, and does it quietly.
 */
const LOCAL_STACK_VARIABLES = [
  "API_URL",
  "PUBLISHABLE_KEY",
  "REST_URL",
  "S3_PROTOCOL_REGION",
  "STORAGE_S3_URL",
] as const;

/** Public, `scope: "environment"` — the variable store. */
const A_VARIABLE = "PROJECT_REF";
/** Public, but `scope: "default"` (committed) and `"developer"`. Neither store. */
const COMMITTED_PUBLIC = "DEPLOY_ENV";
const DEVELOPER_PUBLIC = "DEV_VPN_HOST";

describe("credentials that must never be stored remotely", () => {
  it("tests the same set the registry derives", () => {
    expect(neverStoreKeys()).toEqual([...NEVER_STORE]);
  });

  for (const key of NEVER_STORE) {
    it(`refuses ${key} rather than uploading it, to EITHER store`, () => {
      const { push, variables, refused } = selectForPush(
        env({ [key]: "live-value", CRON_SECRET: "x" }),
        "production",
      );
      expect(push.has(key)).toBe(false);
      // The second store is the new way this could go wrong, and it is the
      // worse one: a variable's value is readable by anyone who can see the
      // repository's Actions config.
      expect(variables.has(key)).toBe(false);
      expect(refused).toContain(key);
      // And the rest of the push still goes, so one stray line does not block
      // populating an environment.
      expect(push.get("CRON_SECRET")).toBe("x");
    });
  }

  it("refuses BWS_ACCESS_TOKEN in every environment, not just production", () => {
    // It unlocks all three projects, so there is no environment where storing
    // it is less bad than another.
    for (const e of ["preflight", "staging", "production"] as const) {
      const { push, variables } = selectForPush(
        env({ BWS_ACCESS_TOKEN: "0.abc" }),
        e,
      );
      expect(push.size).toBe(0);
      expect(variables.size).toBe(0);
    }
  });

  it("does not report an empty refused key as present", () => {
    // A blank line is a placeholder, not a leak. Warning about it would be
    // noise on a correctly-configured machine.
    const { refused } = selectForPush(env({ BWS_ACCESS_TOKEN: "" }), "staging");
    expect(refused).toEqual([]);
  });
});

describe("apply-only credentials", () => {
  const key = APPLY_ONLY[0];

  it("uploads them for production, where they belong", () => {
    expect(
      selectForPush(env({ [key]: "tok" }), "production").push.has(key),
    ).toBe(true);
  });

  it("skips them everywhere else", () => {
    // They exist to reshape production; a staging copy is a second
    // write-capable token to rotate for no benefit.
    expect(selectForPush(env({ [key]: "tok" }), "staging").push.has(key)).toBe(
      false,
    );
    expect(
      selectForPush(env({ [key]: "tok" }), "preflight").push.has(key),
    ).toBe(false);
  });

  it("does not report them as refused — they are skipped, not dangerous", () => {
    // The two categories have different messages, and conflating them would
    // cry wolf on the ordinary case.
    expect(selectForPush(env({ [key]: "tok" }), "staging").refused).toEqual([]);
  });

  it("does not divert them into the variable store outside production", () => {
    // The way the environment exclusion could now fail OPEN: skipped from the
    // secret store and picked up by the variable one, which would publish a
    // write-capable credential's plaintext to a staging environment.
    for (const e of ["staging", "preflight"] as const) {
      expect(selectForPush(env({ [key]: "tok" }), e).variables.size).toBe(0);
    }
  });
});

describe("public per-environment values — GitHub variables", () => {
  it("tests the same set the registry derives", () => {
    // The literals below are only meaningful while they are still in the
    // derived set. A drifted literal fails here rather than silently testing a
    // key that no longer routes anywhere.
    const derived = new Set(variableKeys());
    for (const key of [A_VARIABLE, ...LOCAL_STACK_VARIABLES]) {
      expect(derived.has(key), `${key} is no longer a variable key`).toBe(true);
    }
    expect(derived.has(COMMITTED_PUBLIC)).toBe(false);
    expect(derived.has(DEVELOPER_PUBLIC)).toBe(false);
  });

  it("routes one to variables and NEVER to secrets", () => {
    // The masking is why. As a secret, PROJECT_REF turns the paused-project
    // link `.../project/<ref>` into `.../***` — and, being a substring of every
    // Supabase hostname, redacts unrelated log lines across the repo.
    const { push, variables } = selectForPush(
      env({ [A_VARIABLE]: "abcdefghijklmnop", CRON_SECRET: "s" }),
      "staging",
    );
    expect(variables.get(A_VARIABLE)).toBe("abcdefghijklmnop");
    expect(push.has(A_VARIABLE)).toBe(false);
    // POSITIVE CONTROL: the same call still routes a secret to `push`, so the
    // assertion above is about routing rather than about `selectForPush`
    // having returned two empty maps.
    expect(push.get("CRON_SECRET")).toBe("s");
  });

  it("routes the five localStack ones to variables anyway", () => {
    // ⚠️ The trap. `localStack: true` means "supplied by `supabase status` in
    // DEVELOPMENT, so absent from .env by design" — a statement about the
    // local stack, not a reason to withhold a deployed value. Staging and
    // production have no stack to supply these; skipping them makes a deploy
    // point at nothing, and nothing says so.
    for (const environment of ["staging", "production"] as const) {
      const { push, variables } = selectForPush(
        env(
          Object.fromEntries(LOCAL_STACK_VARIABLES.map((k) => [k, `v-${k}`])),
        ),
        environment,
      );
      expect([...variables.keys()].sort()).toEqual(
        [...LOCAL_STACK_VARIABLES].sort(),
      );
      expect(push.size).toBe(0);
    }
  });

  it("sends a committed or per-developer public value NOWHERE", () => {
    // The reason the selector is `scope === "environment"` and not
    // `neverSecretKeys()`. DEPLOY_ENV is committed and DEV_VPN_HOST is one
    // machine's IP; a per-environment copy of either is a second source of
    // truth for a value that already has one.
    const { push, variables, refused, unknown } = selectForPush(
      env({
        [COMMITTED_PUBLIC]: "staging",
        [DEVELOPER_PUBLIC]: "10.0.0.1",
        [A_VARIABLE]: "abcdefghijklmnop",
      }),
      "staging",
    );
    expect(push.size).toBe(0);
    // POSITIVE CONTROL: the third key in the same file DID route, so "not in
    // variables" is a decision about scope and not a dead code path.
    expect([...variables.keys()]).toEqual([A_VARIABLE]);
    // And neither is loud — they are ordinary, not dangerous or undeclared.
    expect(refused).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it("skips an empty value in either store", () => {
    // An empty secret reads as "configured" to every consumer that checks for
    // presence, which is worse than an absent one. An empty PROJECT_REF is the
    // same thing one step later: it builds a URL that resolves nowhere.
    const { push, variables } = selectForPush(
      env({ DISCORD_TOKEN: "", [A_VARIABLE]: "" }),
      "staging",
    );
    expect(push.size).toBe(0);
    expect(variables.size).toBe(0);
  });

  it("never puts one key in both stores", () => {
    // They would then be sealed into the write-only store AND published in
    // plaintext, which is the worst of the two outcomes and looks like neither.
    const { push, variables } = selectForPush(
      env({
        CRON_SECRET: "s",
        DISCORD_TOKEN: "d",
        [A_VARIABLE]: "abcdefghijklmnop",
        BASE_URL: "https://x",
      }),
      "staging",
    );
    expect(push.size).toBeGreaterThan(0);
    expect(variables.size).toBeGreaterThan(0);
    for (const key of variables.keys()) expect(push.has(key)).toBe(false);
  });

  it("keeps a minted credential out of both stores", () => {
    // Structurally excluded twice over — `minted` is dropped from
    // `variableKeys()` and from `storableKeys()` — because a value found under
    // this name in somebody's .env is a hand-pasted token, and uploading it
    // creates exactly the long-lived copy minting exists to avoid.
    const { push, variables, refused } = selectForPush(
      env({ SANDBOX_PROXY_TOKEN: "eyJhbGciOi", CRON_SECRET: "s" }),
      "production",
    );
    expect(push.has("SANDBOX_PROXY_TOKEN")).toBe(false);
    expect(variables.has("SANDBOX_PROXY_TOKEN")).toBe(false);
    // Skipped rather than refused: not pushing one is its ordinary state.
    expect(refused).toEqual([]);
    // POSITIVE CONTROL, again — the call did something.
    expect(push.get("CRON_SECRET")).toBe("s");
  });
});

describe("keys no manifest declares", () => {
  it("skips them and names them, instead of uploading by omission", () => {
    // The fail-closed rule: undeclared means unclassified, and unclassified
    // values never leave the machine. A typo'd name uploading garbage or a
    // stray local variable uploading something private are both worse than a
    // loud skip.
    const { push, variables, refused, unknown } = selectForPush(
      env({ DISCROD_TOKEN: "oops-a-typo", CRON_SECRET: "x" }),
      "staging",
    );
    expect(push.has("DISCROD_TOKEN")).toBe(false);
    // Undeclared means unclassified, which includes "no idea which GitHub
    // store this belongs in" — so it reaches neither.
    expect(variables.has("DISCROD_TOKEN")).toBe(false);
    expect(unknown).toEqual(["DISCROD_TOKEN"]);
    // Not conflated with the never-store refusals — different message,
    // different fix.
    expect(refused).toEqual([]);
    // And the declared half of the file still pushes.
    expect(push.get("CRON_SECRET")).toBe("x");
  });

  it("reports an empty undeclared key too", () => {
    // Unlike an empty declared secret (a placeholder), an empty undeclared
    // key is a declaration problem whatever its value is.
    const { unknown } = selectForPush(env({ MYSTERY_KEY: "" }), "staging");
    expect(unknown).toEqual(["MYSTERY_KEY"]);
  });

  it("declared keys never appear as unknown", () => {
    const { unknown } = selectForPush(
      env({ DISCORD_TOKEN: "a", DEPLOY_ENV: "staging" }),
      "staging",
    );
    expect(unknown).toEqual([]);
  });
});

describe("a value that is still the declared derivation", () => {
  /**
   * The eight `$VAR` lines `env init --target` writes, and what each is.
   *
   * Literals rather than a call to `derivationOf()`, for the same reason the
   * never-store list above is literal: the registry is empty at collection
   * time. The first test re-ties them to the registry, so a drifted literal
   * fails loudly instead of testing a key that no longer derives.
   */
  const DERIVATIONS = {
    API_URL: "https://$PROJECT_REF.supabase.co",
    BASE_URL_CALLBACK: "$BASE_URL/auth/callback",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "$PUBLISHABLE_KEY",
    NEXT_PUBLIC_SUPABASE_URL: "$API_URL",
    PLATFORM_REST_URL: "$REST_URL",
    REST_URL: "https://$PROJECT_REF.supabase.co/rest/v1",
    SCHEDULE_BUILDER_URL_CALLBACK: "$SCHEDULE_BUILDER_URL/auth/callback",
    STORAGE_S3_URL: "https://$PROJECT_REF.storage.supabase.co/storage/v1/s3",
  } as const;

  it("tests the same eight the registry declares", () => {
    for (const [key, value] of Object.entries(DERIVATIONS)) {
      expect(
        variables().get(key)?.[0]?.meta.example,
        `${key} no longer declares this derivation`,
      ).toBe(value);
    }
  });

  it("leaves each one to the registry instead of storing it", () => {
    // The bug: `env init` writes these lines, push stored them verbatim, and a
    // STORED value beats the registry when the deploy composes an env file. So
    // the literal `https://$PROJECT_REF.supabase.co` arrived as
    // `from: "variable"`, was never expanded, and was written single-quoted —
    // which dotenvx takes as fully literal. The deployed app then resolved a
    // host called `$PROJECT_REF.supabase.co` while `env audit` reported NO
    // DRIFT, because the stored value did match the file.
    const {
      push,
      variables: vars,
      derived,
    } = selectForPush(env({ ...DERIVATIONS, CRON_SECRET: "s" }), "staging");

    expect(derived.sort()).toEqual(Object.keys(DERIVATIONS).sort());
    for (const key of Object.keys(DERIVATIONS)) {
      expect(push.has(key), `${key} reached the secret store`).toBe(false);
      expect(vars.has(key), `${key} reached the variable store`).toBe(false);
    }
    // POSITIVE CONTROL: the same call still pushed the file's real secret, so
    // the eight above are a routing decision rather than an empty result.
    expect(push.get("CRON_SECRET")).toBe("s");
  });

  it("is its own outcome, not a silent skip and not a refusal", () => {
    // `env init` WROTE these lines. A push that said nothing about them would
    // read as "your eight `$VAR` lines were stored"; a refusal would cry wolf
    // on the ordinary, correct state of a freshly generated file.
    const { derived, refused, unknown } = selectForPush(
      env({ NEXT_PUBLIC_SUPABASE_URL: "$API_URL" }),
      "staging",
    );
    expect(derived).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
    expect(refused).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it("PUSHES a value that replaced the derivation", () => {
    // ⚠️ The direction that must not break. Somebody who typed a real value
    // over the formula meant it, and dropping it would upload nothing while
    // reporting success — a missing secret that `env audit` then agrees with,
    // which is worse than the bug this gate closes.
    const { variables: vars, derived } = selectForPush(
      env({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co" }),
      "staging",
    );
    expect(vars.get("NEXT_PUBLIC_SUPABASE_URL")).toBe(
      "https://abcdefghijklmnop.supabase.co",
    );
    expect(derived).toEqual([]);
  });

  it("PUSHES a DIFFERENT derivation", () => {
    // A formula that is not the declared one is deliberate input too: it is
    // how a target says its value is built from something else. Only exact
    // identity with what the registry declares is "nothing here to send".
    const { variables: vars, derived } = selectForPush(
      env({ NEXT_PUBLIC_SUPABASE_URL: "$BASE_URL" }),
      "staging",
    );
    expect(vars.get("NEXT_PUBLIC_SUPABASE_URL")).toBe("$BASE_URL");
    expect(derived).toEqual([]);
  });

  it("PUSHES a secret whose example merely contains a $", () => {
    // The gate is `derivationOf()`, not "looks like a formula". `DB_URL`'s
    // declared example is `postgresql://postgres.$PROJECT_REF:<password>@…` —
    // a real `$REF` with two fill-me holes punched in it, and a SECRET, so it
    // is not a derivation at either gate. A looser predicate here would drop a
    // production database URL on the floor.
    const shape =
      "postgresql://postgres.$PROJECT_REF:<password>@<host>:5432/postgres";
    const { push, derived } = selectForPush(env({ DB_URL: shape }), "staging");
    expect(push.get("DB_URL")).toBe(shape);
    expect(derived).toEqual([]);
  });

  it("still counts an empty value as skipped rather than derived", () => {
    // The two are different states and stay different: empty means "nobody has
    // filled this in", derived means "the registry already knows it".
    const {
      push,
      variables: vars,
      derived,
    } = selectForPush(
      env({ NEXT_PUBLIC_SUPABASE_URL: "", DISCORD_TOKEN: "" }),
      "staging",
    );
    expect(push.size).toBe(0);
    expect(vars.size).toBe(0);
    expect(derived).toEqual([]);
  });

  it("does not let an UNDECLARED key be excused as a derivation", () => {
    // Order matters: undeclared is checked first, so a stray key whose value
    // happens to be a formula is still reported as the declaration problem it
    // is rather than quietly filed under "the registry has this one".
    const { derived, unknown } = selectForPush(
      env({ MYSTERY_URL: "$API_URL" }),
      "staging",
    );
    expect(unknown).toEqual(["MYSTERY_URL"]);
    expect(derived).toEqual([]);
  });

  it("does not let a REFUSED key be excused as a derivation", () => {
    // Same ordering claim on the other loud outcome. A never-store credential
    // has to be reported however its line reads.
    const { derived, refused } = selectForPush(
      env({ BWS_ACCESS_TOKEN: "$API_URL" }),
      "production",
    );
    expect(refused).toEqual(["BWS_ACCESS_TOKEN"]);
    expect(derived).toEqual([]);
  });
});

describe("preflight, the target no app boots from", () => {
  /**
   * The finding: `keysRoutedTo("preflight")` answered with all 45 routable
   * keys, so `env push --target preflight` on a filled-in file uploaded the
   * token-minting key, the service-role key and the GitHub App private key
   * into `preflight` — whose GitHub environment is reachable from
   * `main`. §3.5 of the security plan refuses even a general read-only
   * Postgres role at that tier.
   */
  const THE_FINDING = [
    "SUPABASE_JWT_SIGNING_KEY",
    "SECRET_KEY",
    "GH_APP_PRIVATE_KEY",
  ] as const;

  it("derives its narrowness from deployEnv, not from its name", () => {
    // The premise. `preflight` is the only row with `deployEnv: false`, and
    // that is what `ignoredFor()` reads — a `membership` column saying the same
    // thing twice could drift, and would drift silently in the direction that
    // matters.
    expect(TARGETS.preflight.deployEnv).toBe(false);
    expect(TARGETS.staging.deployEnv).toBe(true);
    expect(TARGETS.production.deployEnv).toBe(true);
  });

  it("routes exactly the keys that opted in", () => {
    expect([...keysRoutedTo("preflight")].sort()).toEqual([
      "AIRTABLE_PLAN_PAT",
      "DB_URL",
    ]);
    // Tied to the registry, so "two keys" is the marker's doing rather than a
    // filter that happened to leave two behind. They are the credentials §3.5
    // stage 1 needs and the only two — a Postgres role that sees the
    // migrations table, and a PAT that can read one base's schema.
    //
    // It was three until the base id stopped being routed at all: `BASE_ID` is
    // committed in the registry beside the field ids of the same base, so the
    // schema plan no longer needs to be TOLD which base the PAT may read. That
    // is the third key leaving, not a marker being read differently — the two
    // that remain are both credentials, which is the shape this set should
    // have had all along.
    expect(narrowedKeys()).toEqual(["AIRTABLE_PLAN_PAT", "DB_URL"]);
  });

  it("routes the plan PAT here and NOT the two write-capable Airtable ones", () => {
    // The point of three declarations rather than one key with three values.
    // `main` can reach this environment, so what it may hold is the whole
    // question — and the answer has to hold for every Airtable token at once.
    const preflight = keysRoutedTo("preflight");
    expect(preflight.has("AIRTABLE_PLAN_PAT")).toBe(true);
    // never-store: refused every remote store, so it is in no target's set.
    expect(preflight.has("AIRTABLE_PAT")).toBe(false);
    expect(keysRoutedTo("production").has("AIRTABLE_PAT")).toBe(false);
    // apply-tier: production only, and behind required reviewers there.
    expect(preflight.has("AIRTABLE_APPLY_PAT")).toBe(false);
    expect(keysRoutedTo("production").has("AIRTABLE_APPLY_PAT")).toBe(true);
    // POSITIVE CONTROL: the plan PAT reaches production too, which is where
    // `production-plan` runs. "Absent from preflight" is not the only way for
    // a routing assertion to pass.
    expect(keysRoutedTo("production").has("AIRTABLE_PLAN_PAT")).toBe(true);
  });

  it("keeps the plan PAT out of staging, where no job reads it", () => {
    // `tier: "plan"` exists for exactly this key: `main-plan` runs in
    // preflight and `production-plan` in production, so a staging copy is a
    // second read-only token to rotate for no benefit. Before the tier it
    // rode along because the default routed everywhere an app boots from.
    expect(keysRoutedTo("staging").has("AIRTABLE_PLAN_PAT")).toBe(false);
    // POSITIVE CONTROL: the other narrowed key still routes to staging —
    // `narrowed` alone must not become a staging exclusion, or DB_URL
    // (narrowed shape one) would vanish from every deployed target.
    //
    // AIRTABLE_BASE_ID used to be the second control here. It is no longer
    // routed anywhere, so DB_URL carries the control alone; if that ever
    // stops being narrowed, this test needs a new one rather than none.
    expect(keysRoutedTo("staging").has("DB_URL")).toBe(true);
  });

  for (const key of THE_FINDING) {
    it(`does not route ${key} to preflight`, () => {
      // BY NAME, because these three are the finding rather than a sample of
      // it. POSITIVE CONTROL in the same test: each IS routed to staging, so
      // "absent from preflight" is a routing decision and not a key that
      // stopped existing.
      expect(keysRoutedTo("preflight").has(key)).toBe(false);
      expect(keysRoutedTo("staging").has(key)).toBe(true);
    });

    it(`refuses to upload ${key} even when the file holds one`, () => {
      // The end-to-end claim: routing is what `env init` renders, and THIS is
      // what a push actually does with a file somebody filled in anyway.
      const {
        push,
        variables: vars,
        refused,
      } = selectForPush(
        env({ [key]: "live-value", DB_URL: "postgresql://migrations-only" }),
        "preflight",
      );
      expect(push.has(key)).toBe(false);
      expect(vars.has(key)).toBe(false);
      // Skipped rather than refused: `refused` means "must not be stored
      // ANYWHERE", and these three belong in staging and production.
      expect(refused).toEqual([]);
      // POSITIVE CONTROL: the narrowed key in the same file did push, so the
      // assertions above are not two empty maps.
      expect(push.get("DB_URL")).toBe("postgresql://migrations-only");
    });
  }

  it("leaves staging and production untouched", () => {
    // The regression that would make this a bug rather than a fix: one branch
    // in `ignoredFor()` narrows preflight, and a branch that ran for every
    // target would empty all three identically — which looks like it worked.
    //
    // All three moved by exactly one when `AIRTABLE_PLAN_PAT` was declared —
    // it was an ordinary default-tier secret everywhere except that `narrowed`
    // also let it into preflight, so 45/47/1 became 46/48/2.
    //
    // Then ONLY preflight moved: 2 → 3. `AIRTABLE_BASE_ID` gained `narrowed`
    // on 2026-08-17, and unlike the PAT it was already routed to staging and
    // production — it is an ordinary `scope: "environment"` public variable, so
    // the marker only added a target rather than a key. A change that moved
    // all three here would mean the marker had been read as something other
    // than "also preflight".
    //
    // Then ONLY staging moved: 46 → 45. `AIRTABLE_PLAN_PAT` became
    // `tier: "plan"`, which says "the two §3.5 plan jobs read this and
    // nothing else does" — preflight and production keep it, staging drops
    // the read-only spare nobody there could use.
    //
    // Then staging and production moved by two (STUDY_GROUP_FINDER_URL +
    // _CALLBACK, the Dog Pack redirect reservation), and by one more when
    // AIRTABLE_SYNC_PAT moved from Supabase Vault into the platform manifest
    // (2026-08-19) — one storage mechanism, auditable, Worker-delivered.
    //
    // Then all three dropped by one, which is the shape a key leaving the
    // registry's routing entirely should have: `AIRTABLE_BASE_ID` became
    // `scope: "default"` and its value a committed constant in
    // packages/airtable, so it is pushed nowhere and opted into nothing. A
    // change that moved only preflight here would mean the `narrowed` marker
    // had been dropped without the scope change, leaving the key still routed
    // to the two deployed targets.
    expect(keysRoutedTo("staging").size).toBe(47);
    expect(keysRoutedTo("production").size).toBe(50);
    expect(keysRoutedTo("preflight").size).toBe(2);
  });
});

describe("ordinary secrets", () => {
  it("pushes them, which is the point", () => {
    const { push, refused } = selectForPush(
      env({ DISCORD_TOKEN: "a", CRON_SECRET: "b" }),
      "staging",
    );
    expect([...push.entries()]).toEqual([
      ["DISCORD_TOKEN", "a"],
      ["CRON_SECRET", "b"],
    ]);
    expect(refused).toEqual([]);
  });

  it("preserves a value with characters a naive parser would eat", () => {
    const nasty = "aB3#xY9$k\nline2";
    expect(
      selectForPush(env({ DISCORD_TOKEN: nasty }), "staging").push.get(
        "DISCORD_TOKEN",
      ),
    ).toBe(nasty);
  });
});
