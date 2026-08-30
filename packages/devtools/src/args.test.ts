import { describe, expect, it } from "vitest";
import { positionals } from "./args.js";

/**
 * The parser that decides which subcommand runs.
 *
 * `env pull`, `env push` and `env audit` do very different things to live
 * credentials. A missing subcommand errors, so the failure to guard against is
 * the wrong one, picked out of a flag's value.
 */

describe("positionals", () => {
  it("returns the subcommand", () => {
    expect(positionals(["push"])).toEqual(["push"]);
  });

  it("finds the subcommand behind a flag", () => {
    expect(positionals(["--yes", "push"])).toEqual(["push"]);
  });

  it("does not read a flag's value as a subcommand", () => {
    // THE bug. A file named `push` would otherwise select the push path.
    expect(positionals(["--file", "push"])).toEqual([]);
    expect(positionals(["--file", ".env.local", "audit"])).toEqual(["audit"]);
  });

  it("does not read the --target value as a subcommand", () => {
    expect(positionals(["pull", "--target", "production"])).toEqual(["pull"]);
    expect(positionals(["--target", "production", "pull"])).toEqual(["pull"]);
  });

  it("still consumes the retired --env's value", () => {
    // `--env` was this CLI's spelling of `--target`, and its values are still
    // valid target names. `cli.ts` refuses the flag by name; that refusal only
    // gets to run if `production` was not read as the subcommand first.
    expect(positionals(["pull", "--env", "production"])).toEqual(["pull"]);
    expect(positionals(["--env", "production", "pull"])).toEqual(["pull"]);
  });

  it("ignores boolean flags wherever they appear", () => {
    expect(positionals(["--yes", "push", "--prune"])).toEqual(["push"]);
  });

  it("does not swallow a flag that follows a value flag with no value", () => {
    // `--file --yes` is a typo. Treating --yes as the filename would consume
    // the confirmation flag and leave the mistake invisible.
    expect(positionals(["push", "--file", "--yes"])).toEqual(["push"]);
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

  it("does not run past the end on a trailing value flag", () => {
    expect(positionals(["push", "--file"])).toEqual(["push"]);
  });
});
