import { beforeAll, describe, expect, it } from "vitest";
import { neverStoreKeys, variableKeys } from "@devdogsuga/env";
import { loadRegistry } from "./discovery.js";
import { selectForPush } from "./selection.js";

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
const NEVER_STORE = ["AIRTABLE_PAT", "BWS_ACCESS_TOKEN"] as const;
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
