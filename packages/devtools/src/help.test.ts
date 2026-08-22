/**
 * What `--help` prints, and — mostly — what it does NOT.
 *
 * The help this replaced was 190 lines and printed the whole tree at every
 * level: a contributor asking how to start a database read the Bitwarden
 * target table, the access-token lookup order, `migration_planner`'s grants
 * and the deploy group's wrapper rules on the way past. The assertions below
 * are upper bounds and absence checks, because "concise" and "says no more
 * than it needs to" are the properties at issue and both fail silently.
 */
import { describe, expect, it } from "vitest";
import { helpPath, renderHelp } from "./help.js";
import { allPaths, findCommand, TOP_LEVEL } from "./commands.js";

describe("the top level", () => {
  const root = renderHelp();

  it("fits on a screen", () => {
    // The old one was 190. A bound rather than a snapshot: this should be free
    // to grow a command without a test edit, and not free to grow a section.
    expect(root.split("\n").length).toBeLessThan(45);
  });

  it("names every top-level command", () => {
    for (const node of TOP_LEVEL) {
      expect(root, node.name).toContain(node.name);
    }
  });

  it("lists no subcommand as an entry of its own", () => {
    // The reason the old help was unreadable: it printed all 31 of them.
    //
    // Structural rather than a substring search — a summary is prose and may
    // legitimately contain a subcommand's word ("Report the target's health"
    // holds `status`). What must not appear is a subcommand as a LISTED
    // entry, which is what the reader scans.
    const entries = root
      .split("\n")
      .map((line) => /^ {2}(\S+)/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined);

    const topLevel = new Set(TOP_LEVEL.map((node) => node.name));
    const subcommands = new Set(
      allPaths()
        .filter((path) => path.length > 1)
        .map((path) => path[path.length - 1]!)
        .filter((name) => !topLevel.has(name)),
    );

    for (const entry of entries) {
      expect(subcommands, `top-level help lists "${entry}"`).not.toContain(
        entry,
      );
    }
  });

  it("keeps operator internals out", () => {
    // Each of these was in the old top-level help, and none of them is how
    // anyone chooses a command — they are what `docs/` is for. Naming a
    // SYSTEM a command talks to is fine and is how it gets recognised
    // ("synced to Bitwarden and GitHub"); reciting how it authenticates to
    // it, or what a deploy job's environment holds, is not.
    for (const leak of [
      "DEPLOY_ENV",
      "BWS_ACCESS_TOKEN",
      "production-apply",
      "GITHUB_STEP_SUMMARY",
      "--access-token",
      "with-env",
    ]) {
      expect(root, `top-level help leaks "${leak}"`).not.toContain(leak);
    }
  });

  it("says how to go deeper", () => {
    expect(root).toContain("--help");
  });
});

describe("a level down", () => {
  it("lists a group's subcommands and stops", () => {
    const env = renderHelp(["env"]);
    expect(env).toContain("pull");
    expect(env).toContain("audit");
    // env's own options belong to its subcommands, not to `env`.
    expect(env).not.toContain("--access-token");
    expect(env.split("\n").length).toBeLessThan(20);
  });

  it("lists a leaf's options and has no subcommand section", () => {
    const pull = renderHelp(["env", "pull"]);
    expect(pull).toContain("--target");
    expect(pull).toContain("--access-token");
    expect(pull).not.toContain("Subcommands:");
  });

  it("renders every path in the tree", () => {
    for (const path of allPaths()) {
      const text = renderHelp(path);
      expect(text, path.join(" ")).toContain(findCommand(path)!.summary);
      expect(text, path.join(" ")).toContain(`pnpm devtools ${path.join(" ")}`);
    }
  });

  it("falls back to the top level for a name that is not a command", () => {
    expect(renderHelp(["nonsense"])).toBe(renderHelp());
  });
});

describe("helpPath", () => {
  it("takes the command names before the first flag", () => {
    expect(helpPath(["env", "pull", "--help"])).toEqual(["env", "pull"]);
    expect(helpPath(["--help"])).toEqual([]);
  });

  it("does not read a flag's value as a command", () => {
    // `--target production --help` must not ask about a command named
    // "production", which would render the top level as if nothing was asked.
    expect(helpPath(["env", "--target", "production", "--help"])).toEqual([
      "env",
    ]);
  });
});
