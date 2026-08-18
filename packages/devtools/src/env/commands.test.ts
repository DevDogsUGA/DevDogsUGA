import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which GitHub store each half of a push is sent to.
 *
 * `selection.ts` decides WHICH keys are secrets and which are variables, and
 * its own tests cover that thoroughly. This file covers the step after: that
 * the two maps are handed to the two different `gh` commands, and to the right
 * ones. That dispatch is two lines, it has no return value to inspect, and
 * getting it backwards is the one mistake in this design that cannot be undone
 * — a secret written to the variable store is readable by everyone who can see
 * the repository's Actions config, and deleting it afterwards does not unread
 * it.
 *
 * The `gh` client is mocked wholesale, so nothing here can reach the network or
 * spawn a binary. That also means these assertions are about ARGUMENTS, not
 * about GitHub's behaviour: no test in this repository can verify what GitHub
 * does with them.
 */
vi.mock("../gh/client.js", () => ({
  listSecrets: vi.fn(async () => []),
  listVariables: vi.fn(async () => []),
  listRepositoryVariables: vi.fn(async () => []),
  setSecret: vi.fn(async () => undefined),
  setVariable: vi.fn(async () => undefined),
}));

// Nothing here should ever reach Bitwarden. Mocked so that a regression which
// made it try fails as a loud assertion rather than as a token prompt.
vi.mock("../bws/client.js", () => ({
  listSecrets: vi.fn(async () => []),
  createSecret: vi.fn(async () => undefined),
  updateSecret: vi.fn(async () => undefined),
  projectIdFor: vi.fn(async () => {
    throw new Error("pushToGithub must not touch Bitwarden");
  }),
  byKey: () => new Map(),
}));

import { setSecret, setVariable } from "../gh/client.js";
import { pushToGithub } from "./commands.js";
import { loadRegistry } from "./discovery.js";

beforeAll(async () => {
  await loadRegistry();
});

beforeEach(() => {
  vi.mocked(setSecret).mockClear();
  vi.mocked(setVariable).mockClear();
});

describe("pushToGithub", () => {
  it("sends secrets to the SECRET store and variables to the VARIABLE store", async () => {
    await pushToGithub(
      "staging",
      new Map([["DISCORD_TOKEN", "tok"]]),
      new Map([["PROJECT_REF", "abcdefghijklmnop"]]),
      true,
    );

    // Whole-call comparisons rather than `toHaveBeenCalledWith`, so a value
    // that reached BOTH stores fails too — that is the outcome that looks
    // healthiest and is worst.
    expect(vi.mocked(setSecret).mock.calls).toEqual([
      ["staging", "DISCORD_TOKEN", "tok"],
    ]);
    expect(vi.mocked(setVariable).mock.calls).toEqual([
      ["staging", "PROJECT_REF", "abcdefghijklmnop"],
    ]);
  });

  it("does nothing at all when both maps are empty", async () => {
    // The negative control for the two above: they assert "exactly these
    // calls", which is only meaningful if some inputs produce none.
    await pushToGithub("staging", new Map(), new Map(), true);
    expect(vi.mocked(setSecret).mock.calls).toEqual([]);
    expect(vi.mocked(setVariable).mock.calls).toEqual([]);
  });

  /**
   * The split between `production` and `production-apply` at the level a push
   * actually performs it.
   *
   * ⚠️ This describe replaced a test called "keeps variables out of the
   * reviewer-gated production-apply environment", which asserted the OLD rule:
   * the gated environment took the apply-tier pair and nothing else. That rule
   * conflated two constraints and kept the wrong one. Withholding a key from
   * `production-apply` protects nothing — same Bitwarden project, strictly more
   * trusted half, behind required reviewers — while the gate is entirely about
   * what the UNREVIEWED `production` may hold. The old test could pass with
   * `production.excludeKeys` emptied, which is the failure that matters; the
   * first test below cannot.
   */
  describe("the production split", () => {
    // Literals. The point is these two keys by name, not "whatever the tier
    // says today" — a test that reads the same derived set as the code under
    // test passes when both are wrong together.
    const APPLY_KEYS = ["AIRTABLE_APPLY_PAT", "SUPABASE_ACCESS_TOKEN"] as const;

    it("NEVER offers an apply-tier key to the unreviewed production environment", async () => {
      // ⚠️ THE INVARIANT, and now the only thing enforcing the reviewer gate:
      // `production` deploys on a push to the production branch with nobody in
      // front of it. A write-capable credential landing there makes
      // `production-apply`'s required reviewers decorative — the token is
      // already usable without them.
      //
      // Asserted BY NAME and per key, rather than by counting calls: a
      // regression that emptied `applyOnly()` (an unloaded registry, a renamed
      // `tier` value) would leave `excludeKeys` an empty array, and a
      // count-based test would happily agree that everything went where it
      // was sent.
      await pushToGithub(
        "production",
        new Map([
          ["AIRTABLE_APPLY_PAT", "pat-write"],
          ["SUPABASE_ACCESS_TOKEN", "sbp"],
          ["DISCORD_TOKEN", "tok"],
        ]),
        new Map(),
        true,
      );

      const secretsTo = (environment: string) =>
        vi
          .mocked(setSecret)
          .mock.calls.filter(([env]) => env === environment)
          .map(([, key]) => key);

      for (const key of APPLY_KEYS) {
        expect(
          secretsTo("production"),
          `${key} reached the UNREVIEWED production environment`,
        ).not.toContain(key);
        // POSITIVE CONTROL, in the same assertion pair: each really was in the
        // push and really did go somewhere. Without it, "absent from
        // production" would also pass for a key that was silently dropped, or
        // for a typo that names no key at all.
        expect(secretsTo("production-apply")).toContain(key);
      }
      // And the ordinary secret did reach the unreviewed environment, so
      // "nothing apply-tier here" is a routing decision rather than an empty
      // environment.
      expect(secretsTo("production")).toEqual(["DISCORD_TOKEN"]);
    });

    it("gives production-apply a SUPERSET: plan secrets, public variables, and the apply pair", async () => {
      // The three jobs that run in `production-apply` and were starved by the
      // old rule, one key each: `production-config` wanted a plan-tier OAuth
      // secret, `production-airtable` wanted a public variable, `prune-orphans`
      // wanted a plan-tier API token. Three out of three is a broken rule
      // rather than three misconfigured jobs.
      await pushToGithub(
        "production",
        new Map([
          ["CLOUDFLARE_API_TOKEN", "cf"],
          ["SUPABASE_OAUTH_CLIENT_SECRET", "oauth"],
          ["AIRTABLE_APPLY_PAT", "pat-write"],
        ]),
        new Map([["AIRTABLE_BASE_ID", "appTESTTESTTEST01"]]),
        true,
      );

      expect(vi.mocked(setSecret).mock.calls).toEqual([
        ["production", "CLOUDFLARE_API_TOKEN", "cf"],
        ["production", "SUPABASE_OAUTH_CLIENT_SECRET", "oauth"],
        ["production-apply", "CLOUDFLARE_API_TOKEN", "cf"],
        ["production-apply", "SUPABASE_OAUTH_CLIENT_SECRET", "oauth"],
        ["production-apply", "AIRTABLE_APPLY_PAT", "pat-write"],
      ]);
      // The public one goes to the VARIABLE store in BOTH — which is the half
      // the old rule made impossible, and the reason `production-airtable` had
      // to be fed a hand-set repository variable.
      expect(vi.mocked(setVariable).mock.calls).toEqual([
        ["production", "AIRTABLE_BASE_ID", "appTESTTESTTEST01"],
        ["production-apply", "AIRTABLE_BASE_ID", "appTESTTESTTEST01"],
      ]);
    });

    it("leaves staging and preflight taking one environment each", async () => {
      // The regression that would make this change a widening rather than a
      // fix: `excludeKeys: []` written on the wrong row, or a fan-out that
      // stopped being specific to the production project. An apply-tier key in
      // a staging file still has nowhere to go.
      await pushToGithub(
        "staging",
        new Map([
          ["AIRTABLE_APPLY_PAT", "pat-write"],
          ["DISCORD_TOKEN", "tok"],
        ]),
        new Map([["AIRTABLE_BASE_ID", "appTESTTESTTEST01"]]),
        true,
      );
      expect(vi.mocked(setSecret).mock.calls).toEqual([
        ["staging", "DISCORD_TOKEN", "tok"],
      ]);
      expect(vi.mocked(setVariable).mock.calls).toEqual([
        ["staging", "AIRTABLE_BASE_ID", "appTESTTESTTEST01"],
      ]);

      vi.mocked(setSecret).mockClear();
      vi.mocked(setVariable).mockClear();

      await pushToGithub(
        "preflight",
        new Map([["AIRTABLE_PLAN_PAT", "pat-read"]]),
        new Map([["AIRTABLE_BASE_ID", "appTESTTESTTEST01"]]),
        true,
      );
      expect(vi.mocked(setSecret).mock.calls).toEqual([
        ["preflight", "AIRTABLE_PLAN_PAT", "pat-read"],
      ]);
      expect(vi.mocked(setVariable).mock.calls).toEqual([
        ["preflight", "AIRTABLE_BASE_ID", "appTESTTESTTEST01"],
      ]);
    });
  });

  it("passes the value through byte-for-byte", async () => {
    // A variable's value is readable back, so `audit` compares it against
    // Bitwarden. Any trimming, quoting or newline added here would make every
    // later audit report drift against a copy that is actually identical, and
    // re-pushing would not fix it.
    const nasty = "aB3#xY9$k\nline2 ";
    await pushToGithub(
      "staging",
      new Map(),
      new Map([["BASE_URL", nasty]]),
      true,
    );
    expect(vi.mocked(setVariable).mock.calls[0]![2]).toBe(nasty);
  });
});
