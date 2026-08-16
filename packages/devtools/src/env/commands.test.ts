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

  it("keeps variables out of the reviewer-gated production-apply environment", async () => {
    // `production` feeds two GitHub environments, and the split IS the reviewer
    // gate. It falls out right for variables without a special case — the
    // gated environment's `onlyKeys` is the apply-tier pair, both secrets — and
    // this pins that, because a special case added later is where it would
    // stop being true.
    await pushToGithub(
      "production",
      new Map([
        ["SUPABASE_ACCESS_TOKEN", "sbp"],
        ["DISCORD_TOKEN", "tok"],
      ]),
      new Map([["PROJECT_REF", "abcdefghijklmnop"]]),
      true,
    );

    expect(vi.mocked(setSecret).mock.calls).toEqual([
      ["production", "DISCORD_TOKEN", "tok"],
      ["production-apply", "SUPABASE_ACCESS_TOKEN", "sbp"],
    ]);
    // One variable, in the unreviewed environment only.
    expect(vi.mocked(setVariable).mock.calls).toEqual([
      ["production", "PROJECT_REF", "abcdefghijklmnop"],
    ]);
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
