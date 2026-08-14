import { describe, expect, it } from "vitest";
import { positionals } from "./args.js";

/**
 * The parser that decides which environment a command acts on.
 *
 * Every case here is a way to get the WRONG environment rather than no
 * environment, because that is the failure with no error message in front of
 * it: the command runs, reports success, and overwrites the wrong project.
 */

describe("positionals", () => {
  it("returns the subcommand and the environment", () => {
    expect(positionals(["push", "staging"])).toEqual(["push", "staging"]);
  });

  it("returns only the subcommand when the environment is omitted", () => {
    // Which is what makes it optional. The caller prompts.
    expect(positionals(["push"])).toEqual(["push"]);
  });

  it("does not read a flag's value as the environment", () => {
    // THE bug. `--file production` would otherwise select production.
    expect(positionals(["push", "--file", "production"])).toEqual(["push"]);
    expect(positionals(["push", "--file", ".env.local", "staging"])).toEqual([
      "push",
      "staging",
    ]);
  });

  it("ignores boolean flags wherever they appear", () => {
    expect(positionals(["push", "--yes", "staging", "--prune"])).toEqual([
      "push",
      "staging",
    ]);
  });

  it("does not swallow a flag that follows a value flag with no value", () => {
    // `--file --yes` is a typo. Treating --yes as the filename would consume
    // the confirmation flag and leave the mistake invisible.
    expect(positionals(["push", "--file", "--yes", "staging"])).toEqual([
      "push",
      "staging",
    ]);
  });

  it("keeps --env working as a flag, without also returning its value", () => {
    // Held for compatibility with anything already written down. The value is
    // a flag value, not a positional, and must not become one.
    expect(positionals(["push", "--env", "production"])).toEqual(["push"]);
  });

  it("preserves order, since position is the whole contract", () => {
    expect(positionals(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("handles an empty command line", () => {
    expect(positionals([])).toEqual([]);
  });

  it("ignores a single-dash flag", () => {
    expect(positionals(["-h", "push"])).toEqual(["push"]);
  });

  it("does not treat a trailing value flag as consuming past the end", () => {
    expect(positionals(["push", "--file"])).toEqual(["push"]);
  });
});
