import { describe, expect, it } from "vitest";
import { positionals } from "./args.js";

/**
 * The parser that decides which subcommand runs.
 *
 * `secrets pull`, `secrets push` and `secrets audit` do very different things
 * to live credentials, so the failure to guard against is not "no subcommand"
 * — that errors — but the wrong one, picked out of a flag's value.
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

  it("does not read the --env value as a subcommand", () => {
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
