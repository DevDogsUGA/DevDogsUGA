import { describe, expect, it } from "vitest";
import { APPLY_ONLY_KEYS, NEVER_STORE_KEYS } from "../bws/environments.js";
import { selectForPush } from "./selection.js";

/**
 * The gate on what leaves this machine.
 *
 * Every test here is a value that must NOT be uploaded, because that is the
 * direction with no undo: taking a credential back out of Bitwarden and GitHub
 * means rotating it at the issuer and hoping nothing read it in between.
 */

const env = (o: Record<string, string>) => Object.entries(o);

describe("credentials that must never be stored remotely", () => {
  for (const key of NEVER_STORE_KEYS) {
    it(`refuses ${key} rather than uploading it`, () => {
      const { push, refused } = selectForPush(
        env({ [key]: "live-value", CRON_SECRET: "x" }),
        "production",
      );
      expect(push.has(key)).toBe(false);
      expect(refused).toContain(key);
      // And the rest of the push still goes, so one stray line does not block
      // populating an environment.
      expect(push.get("CRON_SECRET")).toBe("x");
    });
  }

  it("refuses BWS_ACCESS_TOKEN in every environment, not just production", () => {
    // It unlocks all three projects, so there is no environment where storing
    // it is less bad than another.
    for (const e of ["dry-run", "staging", "production"] as const) {
      expect(
        selectForPush(env({ BWS_ACCESS_TOKEN: "0.abc" }), e).push.size,
      ).toBe(0);
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
  const key = APPLY_ONLY_KEYS[0];

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
    expect(selectForPush(env({ [key]: "tok" }), "dry-run").push.has(key)).toBe(
      false,
    );
  });

  it("does not report them as refused — they are skipped, not dangerous", () => {
    // The two categories have different messages, and conflating them would
    // cry wolf on the ordinary case.
    expect(selectForPush(env({ [key]: "tok" }), "staging").refused).toEqual([]);
  });
});

describe("non-secrets and empties", () => {
  it("skips values that are GitHub variables", () => {
    const { push } = selectForPush(
      env({ DEPLOY_ENV: "staging", BASE_URL: "https://x", CRON_SECRET: "s" }),
      "staging",
    );
    expect([...push.keys()]).toEqual(["CRON_SECRET"]);
  });

  it("skips an empty value", () => {
    // An empty secret reads as "configured" to every consumer that checks for
    // presence, which is worse than an absent one.
    expect(selectForPush(env({ DISCORD_TOKEN: "" }), "staging").push.size).toBe(
      0,
    );
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
