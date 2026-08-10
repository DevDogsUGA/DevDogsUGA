import { describe, expect, it } from "vitest";
import {
  diffEnv,
  diffIsEmpty,
  fingerprint,
  parseEnv,
  serializeEnv,
} from "./envfile.js";

/**
 * The half of the BWS commands that can be wrong quietly.
 *
 * Every case here is one where a bug produces a plausible-looking file and a
 * credential that does not work — and the way you find out is a deploy failing
 * to authenticate against something at 2am, not a stack trace.
 */

describe("parseEnv", () => {
  it("reads the shapes a .env file actually contains", () => {
    const env = parseEnv(
      [
        "# a comment",
        "",
        "PLAIN=value",
        'QUOTED="value"',
        "SINGLE='value'",
        "export EXPORTED=value",
        "SPACED = value ",
      ].join("\n"),
    );

    expect(Object.fromEntries(env)).toEqual({
      PLAIN: "value",
      QUOTED: "value",
      SINGLE: "value",
      EXPORTED: "value",
      SPACED: "value",
    });
  });

  it("keeps a # inside an unquoted value", () => {
    // The regression that matters: `#` is an ordinary character in a generated
    // password, and stripping from the first one truncates the credential to
    // something that looks like a credential and does not authenticate.
    expect(parseEnv("PASS=aB3#xY9$k").get("PASS")).toBe("aB3#xY9$k");
    // A comment still needs whitespace in front of it.
    expect(parseEnv("KEY=value # trailing").get("KEY")).toBe("value");
  });

  it("round-trips a multi-line value", () => {
    // Private keys are the case. A parser that loses the newlines produces a
    // key that parses as a string and fails as a key.
    const pem = "-----BEGIN KEY-----\nline1\nline2\n-----END KEY-----";
    const round = parseEnv(serializeEnv(new Map([["KEY", pem]])));
    expect(round.get("KEY")).toBe(pem);
  });

  it("round-trips quotes and backslashes", () => {
    const nasty = 'a"b\\c\td';
    const round = parseEnv(serializeEnv(new Map([["K", nasty]])));
    expect(round.get("K")).toBe(nasty);
  });

  it("treats single quotes as literal", () => {
    // The only way to store a value containing a backslash sequence verbatim.
    expect(parseEnv("K='a\\nb'").get("K")).toBe("a\\nb");
    expect(parseEnv('K="a\\nb"').get("K")).toBe("a\nb");
  });

  it("does not expand $VAR", () => {
    // dotenvx expands at load time, so a stored `$HOME` would mean one thing in
    // the file and another in the process -- a secret whose value depends on
    // who reads it cannot be rotated with confidence.
    expect(parseEnv("K=$HOME/x").get("K")).toBe("$HOME/x");
  });

  it("ignores lines that are not assignments", () => {
    const env = parseEnv(
      ["not an assignment", "=novalue", "1BAD=x"].join("\n"),
    );
    expect(env.size).toBe(0);
  });

  it("preserves an empty value rather than dropping the key", () => {
    // Presence and emptiness are different states, and several consumers check
    // for presence. `push` refuses empty values, but only if parsing surfaces
    // them.
    expect(parseEnv("K=").has("K")).toBe(true);
    expect(parseEnv("K=").get("K")).toBe("");
  });
});

describe("serializeEnv", () => {
  it("sorts keys so a re-pull produces no diff", () => {
    const out = serializeEnv(
      new Map([
        ["B", "1"],
        ["A", "2"],
      ]),
    );
    expect(out).toBe('A="2"\nB="1"\n');
  });

  it("renders the header as comments", () => {
    expect(serializeEnv(new Map(), "line one\nline two")).toBe(
      "# line one\n# line two\n\n",
    );
  });
});

describe("diffEnv", () => {
  const local = new Map([
    ["SAME", "x"],
    ["CHANGED", "new"],
    ["ADDED", "x"],
  ]);
  const remote = new Map([
    ["SAME", "x"],
    ["CHANGED", "old"],
    ["ORPHANED", "x"],
  ]);

  it("classifies every key exactly once", () => {
    const d = diffEnv(local, remote);
    expect(d).toEqual({
      added: ["ADDED"],
      changed: ["CHANGED"],
      unchanged: ["SAME"],
      orphaned: ["ORPHANED"],
    });
  });

  it("does not count an orphan as empty", () => {
    // `push` leaves orphans alone without --prune, but the diff must still be
    // non-empty or the command would report "nothing to do" and exit before
    // the warning is ever printed.
    expect(diffIsEmpty(diffEnv(new Map(), new Map([["A", "1"]])))).toBe(false);
    expect(
      diffIsEmpty(diffEnv(new Map([["A", "1"]]), new Map([["A", "1"]]))),
    ).toBe(true);
  });
});

describe("fingerprint", () => {
  it("says enough to spot a paste error and not enough to rebuild a secret", () => {
    expect(fingerprint("supersecrettoken")).toBe("16 chars, s…n");
    expect(fingerprint("")).toBe("empty");
    // Short values would be reconstructable from first/last, so they are not
    // described at all.
    expect(fingerprint("abcd")).toBe("4 chars");
  });

  it("never contains the value", () => {
    const secret = "sb_secret_N7UND0UgjKTVK";
    expect(fingerprint(secret)).not.toContain(secret.slice(0, 6));
  });
});
