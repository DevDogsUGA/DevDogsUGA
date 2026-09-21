/**
 * The command tree's own invariants, and the coverage claim that rests on it.
 *
 * The claim: **the wizard reaches every interactive command and option.** It
 * holds because one declaration, `commands.ts`, is what the menu
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
  TIER,
  TOP_LEVEL,
  type CommandNode,
  type Scope,
} from "./commands.js";

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
   * own screen. Every entry below is asked SOMEWHERE, or is one of three
   * documented categories:
   *
   *   * **live-data**: the command asks itself from something live (`--app`,
   *     `--user`, `--target`, `--apps`, `--filter`).
   *   * **suppressor**: exists only to suppress a prompt (`--yes`); asking in
   *     a wizard that IS the prompt makes no sense.
   *   * **credential**: carries a secret (`--access-token`); interactive path
   *     resolves it better and typing it makes it visible to shell history.
   *   * **scripting-only**: meaningful only outside a TTY (`--json`); asking
   *     in a wizard produces nothing useful.
   *
   * Pinned as an exact set, not a subset: a new promptless flag is either one
   * of these categories and belongs in the list with a reason, or it is an
   * option that has quietly become unreachable from the menu.
   */
  it("leaves unasked only the flags something else asks for", () => {
    const allowed = new Set([
      // live-data: the command asks from something live
      "--app",
      "--user",
      "--target",
      "--apps",
      // suppressor: exists to suppress a prompt, not to be one
      "--yes",
      // credential: visible in shell history if asked interactively
      "--access-token",
      // file path: a text box is a worse version of the default
      "--file",
      // `run`'s two. The multiselect it opens IS this question, asked against
      // the apps that actually define the task, so a screen asking "which
      // filter?" first would ask it twice and let the answers disagree.
      "--filter",
      "--all",
      // `images`. The formats a graphic can be drawn at depend on WHICH
      // graphic — the matrix is sparse — and its own wizard asks in the same
      // order as the CLI: positional graphic, format, then output. The outer
      // wizard dispatches bare `images`; these remain available to scripts and
      // in help without duplicating or reordering that flow.
      "--format",
      "--all-formats",
      "--out",
      "--default-out",
      "--dry-run",
      // `emails` and `newsletter` ask these after their template and issue
      // pickers so the interactive and scripted paths share one flow.
      "--format",
      "--out",
      // `newsletter` again: push is the third option in the same outputs
      // picker, and the mailbox is a default nobody retypes, flag-only.
      // Sending is flag-only on purpose — a real send should be typed out,
      // recipients and all, never arrived at through a picker.
      "--push",
      "--send",
      "--to",
      "--mailbox",
      // scripting-only: machine-readable output; a wizard asking for JSON
      // mode produces nothing useful since the wizard itself is the UI.
      "--json",
      // Live/config-derived selectors and scripting inputs. The cron and
      // Workflow commands ask from Wrangler data when these are absent.
      "--tier",
      "--cron",
      "--workflow",
      "--params",
      "--port",
    ]);
    const unasked = new Set<string>();

    for (const { node } of everyNode()) {
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
    "completions",
    "catalog",
    "doctor",
    "roundtrip",
    "grant-root",
    "setup",
    "oauth",
    "airtable",
    "docs",
    "emails",
    "newsletter",
    "images",
    "env",
    // The merged Supabase/Database group: one top-level command, `db`, whose
    // dispatch handles `start`, `connect`, `stop`, `restart`, `status`,
    // `migrate`, `reset`, `migration *`, `types`, `seed *`, `introspect`,
    // `config *`, `planner *`, `signing-key *` and `exec` beneath it.
    "db",
    "gen",
    "cron",
    "workflows",
    "cf",
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
    expect(subcommandNames(["docs"])).toEqual(["index"]);
    expect(subcommandNames(["cron"])).toEqual(["list", "run"]);
    expect(subcommandNames(["workflows"])).toEqual(["list", "run", "serve"]);

    // The merged `db` command. Declaration order is scope order: machine,
    // repo, endpoint, infra, then the unscoped escape hatch.
    expect(subcommandNames(["db"])).toEqual([
      "start",
      "connect",
      "stop",
      "restart",
      "migration",
      "status",
      "migrate",
      "reset",
      "types",
      "seed",
      "introspect",
      "config",
      "planner",
      "signing-key",
      "exec",
    ]);
    expect(subcommandNames(["db", "migration"])).toEqual(["new", "generate"]);
    expect(subcommandNames(["db", "seed"])).toEqual(["buckets", "roles"]);
    expect(subcommandNames(["db", "config"])).toEqual(["push"]);
    expect(subcommandNames(["db", "planner"])).toEqual([
      "status",
      "create",
      "reset-password",
      "drop",
    ]);
    expect(subcommandNames(["db", "signing-key"])).toEqual([
      "status",
      "generate",
      "import",
    ]);
  });
});

describe("scopes", () => {
  // Scopes used to divide a GROUP's own commands ("Supabase"). Now that group
  // has merged into "Database", whose only command is `db`, they divide `db`'s
  // own subcommands instead — the group itself renders as one plain line.
  const dbSubcommands = () => findCommand(["db"])!.subcommands ?? [];

  it("places db in Runtime & infrastructure", () => {
    const group = GROUPS.find((g) => g.title === "Runtime & infrastructure");
    expect(group).toBeDefined();
    expect(group!.commands.map((c) => c.name)).toContain("db");
    expect(GROUPS.some((g) => g.title === "Supabase")).toBe(false);
  });

  /**
   * Pinned as "all of them but `exec`" rather than "the ones that have one":
   * an unlabelled command under `db` is the exact confusion the scopes exist
   * to remove, and it would render as a stray line under whichever heading
   * happened to be open. `exec` is the one deliberate exception — the escape
   * hatch, unscoped like `bw`.
   */
  it("labels every db subcommand except exec", () => {
    for (const command of dbSubcommands()) {
      if (command.name === "exec") {
        expect(command.scope, command.name).toBeUndefined();
        continue;
      }
      expect(command.scope, `db ${command.name}`).toBeDefined();
    }
  });

  it("labels nothing outside db's own subcommands", () => {
    const inDb = new Set<CommandNode>(dbSubcommands());
    // `docs index` is deliberately scoped: it connects to a database endpoint
    // even though its parent group is not a scoped group. Explicit exception,
    // unrelated to `db`.
    const SCOPED_EXCEPTIONS = new Set(["docs index"]);
    for (const { path, node } of everyNode()) {
      if (inDb.has(node)) continue;
      if (SCOPED_EXCEPTIONS.has(path.join(" "))) continue;
      expect(node.scope, path.join(" ")).toBeUndefined();
    }
  });

  /**
   * `--help` opens a heading every time the scope changes as it walks `db`'s
   * subcommands, so scopes that interleaved would render as many one-line
   * blocks rather than four readable ones. Declaration order carries that.
   * `exec`'s undefined scope neither opens nor closes a heading.
   */
  it("declares each scope in one contiguous run", () => {
    const opened = new Set<Scope>();
    let open: Scope | undefined;

    for (const command of dbSubcommands()) {
      if (!command.scope) continue;
      if (command.scope === open) continue;
      expect(
        opened.has(command.scope),
        `db ${command.name} reopens ${command.scope}`,
      ).toBe(false);
      opened.add(command.scope);
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
    expect(subcommandList(["db", "signing-key"])).toBe(
      "status, generate or import",
    );
  });

  it("is empty for a leaf", () => {
    expect(subcommandList(["setup"])).toBe("");
  });
});

describe("style guide", () => {
  /**
   * (a) Promptless: scripting-only category — enforced by the "leaves unasked"
   * test above. `--json` joins the allowed set when Phase 7 adds it to commands.
   *
   * (b) No bare --local / --remote / --team as an option flag.
   *
   * The type simplification: one flag (`--target`), one value, no tie-break.
   * DATABASE_TARGET's flag is the descriptor `"--local | --remote"`, not either
   * bare form. This pin keeps that from reverting to two separate boolean flags.
   */
  it("uses no bare --local / --remote / --team flags", () => {
    const banned = new Set(["--local", "--remote", "--team"]);
    for (const { path, node } of everyNode()) {
      for (const option of node.options ?? []) {
        expect(
          banned.has(option.flag),
          `${path.join(" ")} ${option.flag}`,
        ).toBe(false);
      }
    }
  });

  /**
   * (c) `--tier` draws from one closed enum wherever it carries a select prompt.
   *
   * Vacuously true until Phase 3 adds the renamed flag; enforces the set once
   * it does. Each command may offer a subset (staging + production is fine),
   * but no value outside the four may appear.
   */
  it("--tier choices draw from the canonical tier set", () => {
    const TIER_VALUES = new Set([
      "development",
      "preflight",
      "staging",
      "production",
    ]);
    for (const { path, node } of everyNode()) {
      for (const option of node.options ?? []) {
        if (option.flag !== TIER.flag) continue;
        if (option.prompt?.kind !== "select") continue;
        for (const choice of option.prompt.choices) {
          expect(
            TIER_VALUES.has(choice.value),
            `${path.join(" ")} --tier has unknown choice "${choice.value}"`,
          ).toBe(true);
        }
      }
    }
  });

  /**
   * (d) Every command that signals danger declares `--yes`.
   *
   * The signals: ⚠️ in any node text, or one of the verbs erase / delete /
   * rotate in the summary or hint. A command that marks itself as destructive
   * but offers no confirmation-skip is one that scripted callers cannot make
   * non-interactive without hacking the prompt.
   */
  it("declares --yes on every command that signals danger", () => {
    const DANGER = /⚠️|erase|delete|rotate/;
    for (const { path, node } of everyNode()) {
      const text = [node.summary, node.hint ?? ""].join(" ");
      if (!DANGER.test(text)) continue;
      const flags = (node.options ?? []).map((o) => o.flag);
      expect(
        flags,
        `${path.join(" ")} has danger signal but lacks --yes`,
      ).toContain("--yes");
    }
  });

  /**
   * (e) `--dry-run` and `--check` cannot coexist on one command.
   *
   * They are two flavors of "do not write": `--dry-run` always exits 0,
   * `--check` exits 2 on drift. Pairing them leaves the exit code ambiguous.
   * `--no-output` is the older name for `--dry-run`; Phase 5 renames it.
   */
  it("does not declare both --dry-run and --check on one command", () => {
    for (const { path, node } of everyNode()) {
      const flags = new Set((node.options ?? []).map((o) => o.flag));
      expect(
        flags.has("--dry-run") && flags.has("--check"),
        `${path.join(" ")} declares both --dry-run and --check`,
      ).toBe(false);
    }
  });

  it("has no --no-output flags (renamed to --dry-run in Phase 5)", () => {
    for (const { path, node } of everyNode()) {
      for (const option of node.options ?? []) {
        expect(option.flag, path.join(" ")).not.toBe("--no-output");
      }
    }
  });

  /**
   * (f) `--target` never returns to the `db` namespace.
   *
   * The retired endpoint selector (`--target local|remote`) asked a question
   * the SESSION already answers (`--tier development:local|development:remote|
   * staging|production`, settled by the launcher before dispatch), and
   * `cli.ts` refuses the flag by name so old scripts fail loudly. This pin
   * keeps a future db subcommand from quietly reintroducing the vocabulary.
   * The `--target` flags that legitimately remain mean OTHER things: the env
   * commands' vault target, the signing-key/planner tier words, and `docs
   * index`'s delete acknowledgment (`DOCS_TARGET`) — all outside `db`'s
   * endpoint scope, except signing-key/planner which name their own
   * connection (`infra` scope) rather than the session's.
   */
  it("keeps --target out of db's endpoint-scope commands", () => {
    for (const { path, node } of everyNode()) {
      if (path[0] !== "db") continue;
      const parent = path.length > 1 ? findCommand(path.slice(0, -1)) : null;
      const isEndpointScope =
        node.scope === "endpoint" ||
        (!node.scope && parent?.scope === "endpoint");
      if (!isEndpointScope) continue;
      for (const option of node.options ?? []) {
        expect(option.flag, `${path.join(" ")} ${option.flag}`).not.toBe(
          "--target",
        );
      }
    }
  });
});
