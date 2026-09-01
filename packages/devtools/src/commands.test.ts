/**
 * The command tree's own invariants, and the coverage claim that rests on it.
 *
 * The claim: **the wizard reaches every command and every option the CLI
 * has.** It holds because one declaration, `commands.ts`, is what the menu
 * walks, `--help` renders, and every dispatcher in `cli.ts` validates against.
 * This file guards the parts of that which a type cannot: that the names match
 * the ones dispatch actually accepts, that nothing is declared twice, and that
 * a summary stays the one line `--help` prints it as.
 *
 * `cli.ts` is deliberately NOT imported here, because importing it runs
 * `main()`. The names it dispatches on that are not derived from the tree are
 * the two exported tuples below plus a small hand-list, checked against the
 * tree.
 */
import { describe, expect, it } from "vitest";
import {
  allPaths,
  findCommand,
  GROUPS,
  SCOPES,
  subcommandList,
  subcommandNames,
  TOP_LEVEL,
  type CommandNode,
  type Scope,
} from "./commands.js";
import { STACK_COMMANDS } from "./stack.js";

/** Every node in the tree, at any depth. */
function everyNode(): { path: string[]; node: CommandNode }[] {
  return allPaths().map((path) => ({ path, node: findCommand(path)! }));
}

describe("shape", () => {
  it("resolves every path it enumerates", () => {
    for (const path of allPaths()) {
      expect(findCommand(path), path.join(" ")).not.toBeNull();
    }
  });

  it("has no duplicate name at any level", () => {
    const seen = new Set<string>();
    for (const path of allPaths()) {
      const key = path.join(" ");
      expect(seen.has(key), `${key} declared twice`).toBe(false);
      seen.add(key);
    }
  });

  it("gives every command a one-line summary", () => {
    for (const { path, node } of everyNode()) {
      const where = path.join(" ");
      expect(node.summary, where).not.toBe("");
      expect(node.summary, `${where} summary wraps`).not.toContain("\n");
      // `--help` prints these in a two-column block. Past ~62 the second
      // column wraps on an 80-column terminal, which is the shape the old
      // help had and this replaced.
      expect(node.summary.length, `${where} summary too long`).toBeLessThan(63);
    }
  });

  it("gives every option a unique flag and a one-line summary", () => {
    for (const { path, node } of everyNode()) {
      const flags = (node.options ?? []).map((option) => option.flag);
      expect(new Set(flags).size, `${path.join(" ")} repeats a flag`).toBe(
        flags.length,
      );
      for (const option of node.options ?? []) {
        expect(option.summary, `${path.join(" ")} ${option.flag}`).not.toBe("");
        expect(option.summary).not.toContain("\n");
      }
    }
  });

  it("puts every top-level command in exactly one group", () => {
    const counts = new Map<string, number>();
    for (const group of GROUPS) {
      for (const command of group.commands) {
        counts.set(command.name, (counts.get(command.name) ?? 0) + 1);
      }
    }
    for (const [name, count] of counts) expect(count, name).toBe(1);
    expect(counts.size).toBe(TOP_LEVEL.length);
  });
});

describe("prompts", () => {
  /**
   * Yes adds the flag, with no per-option inversion, so every confirm has to
   * be phrased as the flag's own meaning. A message that asks the opposite
   * ("Scan for duplicates?" for `--no-duplicates`) would silently produce the
   * inverse command, which no type catches.
   */
  it("phrases every confirm as a question", () => {
    for (const { path, node } of everyNode()) {
      for (const option of node.options ?? []) {
        if (option.prompt?.kind !== "confirm") continue;
        expect(
          option.prompt.message.endsWith("?"),
          `${path.join(" ")} ${option.flag}`,
        ).toBe(true);
      }
    }
  });

  it("only offers select choices that are a flag or a plain value", () => {
    for (const { path, node } of everyNode()) {
      for (const option of node.options ?? []) {
        if (option.prompt?.kind !== "select") continue;
        expect(option.prompt.choices.length, path.join(" ")).toBeGreaterThan(1);
        for (const choice of option.prompt.choices) {
          // A choice that is a flag stands alone; one that is not becomes the
          // value of this option's flag. A choice like `-x` is neither.
          if (choice.value.startsWith("-")) {
            expect(choice.value.startsWith("--"), choice.value).toBe(true);
          }
        }
      }
    }
  });

  /**
   * An option with no prompt here is one the wizard does not ask about on its
   * own screen. Every entry below is asked SOMEWHERE: by the command itself
   * from live data (`--app`, `--user`, `--target`, `--apps`, `--filter`), or
   * deliberately never (`--yes`, `--access-token`, `--file`, `--all`). See
   * `CommandOption.prompt`.
   *
   * Pinned as an exact set, not a subset: a new promptless flag is either one
   * of these cases and belongs in the list with a reason, or it is an option
   * that has quietly become unreachable from the menu.
   */
  it("leaves unasked only the flags something else asks for", () => {
    const allowed = new Set([
      "--app",
      "--user",
      "--target",
      "--apps",
      "--yes",
      "--access-token",
      "--file",
      // `run`'s two. The multiselect it opens IS this question, asked against
      // the apps that actually define the task, so a screen asking "which
      // filter?" first would ask it twice and let the answers disagree.
      "--filter",
      "--all",
      // `images`. The formats a graphic can be drawn at depend on WHICH
      // graphic — the matrix is sparse — so the command asks after the
      // graphics are chosen, from the union of what they support. A static
      // list here would offer sizes that get silently skipped.
      "--format",
    ]);
    const unasked = new Set<string>();

    for (const { node } of everyNode()) {
      // Deploy steps are shown rather than run, so their flags are printed as
      // part of the invocation instead of being asked for.
      if (node.wizard === "show") continue;
      for (const option of node.options ?? []) {
        if (!option.prompt) unasked.add(option.flag);
      }
    }

    for (const flag of unasked) expect(allowed, flag).toContain(flag);
    // And the other direction: an entry that stops being promptless should
    // leave this list rather than sit in it justifying nothing.
    for (const flag of allowed) expect(unasked, flag).toContain(flag);
  });
});

describe("coverage of what the CLI dispatches", () => {
  /**
   * The top-level names `cli.ts` routes on.
   *
   * Hand-written HERE and nowhere else: `dispatch` reaches these through
   * `first === "..."` comparisons, which no import can enumerate. If a command
   * is added to the CLI and not to the tree, this list is where the omission
   * surfaces, and the test below turns it into a failure rather than a command
   * nobody can find in the menu.
   */
  const DISPATCHED = [
    ...STACK_COMMANDS,
    "catalog",
    "doctor",
    "roundtrip",
    "grant-root",
    "setup",
    "oauth",
    "airtable",
    "docs",
    "images",
    "qr",
    "env",
    "planner",
    "signing-key",
    "deploy",
    // Both are dispatched twice: once in `main()` ahead of `intro()`, which is
    // what a typed command line reaches, and once in `dispatch` for the walk
    // the wizard hands back. They belong here for the second of those.
    "run",
    "bw",
  ];

  it("declares exactly the top-level commands the CLI accepts", () => {
    expect(new Set(TOP_LEVEL.map((node) => node.name))).toEqual(
      new Set(DISPATCHED),
    );
  });

  it("declares the subcommands each group dispatches", () => {
    expect(subcommandNames(["env"])).toEqual([
      "pull",
      "push",
      "audit",
      "init",
      "example",
      "reset",
    ]);
    expect(subcommandNames(["airtable"])).toEqual(["check", "verify", "apply"]);
    expect(subcommandNames(["planner"])).toEqual([
      "status",
      "create",
      "reset-password",
      "drop",
    ]);
    expect(subcommandNames(["signing-key"])).toEqual([
      "status",
      "generate",
      "import",
    ]);
    expect(subcommandNames(["docs"])).toEqual(["index"]);
    expect(subcommandNames(["deploy"])).toEqual([
      "write-env",
      "secrets-file",
      "orphans",
      "preflight",
      "mint-token",
      "require-token",
      "require-planner",
      "airtable-plan",
      "airtable-apply",
    ]);
  });

  it("marks every deploy step, and only those, as shown rather than run", () => {
    for (const { path, node } of everyNode()) {
      const isDeploy = path[0] === "deploy";
      expect(node.wizard === "show", path.join(" ")).toBe(isDeploy);
    }
  });
});

describe("scopes", () => {
  const supabase = GROUPS.find((group) => group.title === "Supabase")!;

  it("has a group that spans two layers", () => {
    expect(supabase).toBeDefined();
  });

  /**
   * Pinned as "all of them" rather than "the ones that have one": an
   * unlabelled command in this group is the exact confusion the scopes exist
   * to remove, and it would render as a stray line under whichever heading
   * happened to be open.
   */
  it("labels every command in it", () => {
    for (const command of supabase.commands) {
      expect(command.scope, command.name).toBeDefined();
    }
  });

  it("labels nothing outside it", () => {
    const inGroup = new Set<CommandNode>(supabase.commands);
    for (const { path, node } of everyNode()) {
      if (inGroup.has(node)) continue;
      expect(node.scope, path.join(" ")).toBeUndefined();
    }
  });

  /**
   * `--help` opens a heading every time the scope changes as it walks the
   * group, so scopes that interleaved would render as four one-line blocks
   * rather than two readable ones. Declaration order carries that.
   */
  it("declares each scope in one contiguous run", () => {
    const opened = new Set<Scope>();
    let open: Scope | undefined;

    for (const command of supabase.commands) {
      if (command.scope === open) continue;
      expect(
        opened.has(command.scope!),
        `${command.name} reopens ${command.scope}`,
      ).toBe(false);
      opened.add(command.scope!);
      open = command.scope;
    }
  });

  it("gives every scope a label for both renderers", () => {
    for (const scope of Object.keys(SCOPES) as Scope[]) {
      expect(SCOPES[scope].menu, scope).not.toBe("");
      expect(SCOPES[scope].help, scope).not.toBe("");
    }
  });
});

describe("subcommandList", () => {
  it("reads as a sentence", () => {
    expect(subcommandList(["docs"])).toBe("index");
    expect(subcommandList(["signing-key"])).toBe("status, generate or import");
  });

  it("is empty for a leaf", () => {
    expect(subcommandList(["setup"])).toBe("");
  });
});
