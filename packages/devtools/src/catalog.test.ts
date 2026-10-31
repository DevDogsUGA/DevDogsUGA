/**
 * The command tree's own invariants, and the coverage claim that rests on it.
 *
 * The claim: **the wizard reaches every interactive command and option.** It
 * holds because one composed tree, `catalog.ts`, is what the menu
 * walks, `--help` renders, and every dispatcher validates against.
 * This file guards the parts of that which a type cannot: that the names match
 * the ones dispatch actually accepts, that nothing is declared twice, and that
 * a summary stays the one line `--help` prints it as.
 *
 * `cli.ts` is imported only by `cli.test.ts`, which checks its handler table
 against the tree; the hand-list below checks the other direction by name.
 */
import { describe, expect, it } from "vitest";
import {
  SCOPES,
  TIER,
  type CommandNode,
  type Scope,
} from "@devdogsuga/cli-core/catalog";
import { catalog, GROUPS } from "./catalog.js";

const {
  allPaths,
  findCommand,
  subcommandList,
  subcommandNames,
  topLevel: TOP_LEVEL,
} = catalog;

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
   *     `--apps`, `--filter`).
   *   * **suppressor**: exists only to suppress a prompt (`--yes`); asking in
   *     a wizard that IS the prompt makes no sense.
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
      "--apps",
      // suppressor: exists to suppress a prompt, not to be one
      "--yes",
      // file path: a text box is a worse version of the default
      "--file",
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
      // `jobs`' kind filter, what the `cron`/`workflows` aliases stand for.
      // The picker heads each kind already, so asking first would ask twice.
      "--kind",
      // `oauth`'s connect-transport override (TASK-352). Which transport —
      // the local loopback listener or the device-code flow — is decided
      // automatically from the environment (SSH/Codespaces/dev container,
      // or the loopback listener failing to start), and the wizard already
      // prints which one it picked and why; a prompt here would just ask
      // the same question the auto-detection already answered.
      "--device",
      "--loopback",
      // `oauth`'s endpoint overrides. Every contributor wants the canonical
      // API and platform, so the defaults are preset; these exist only for
      // testing against another project or a platform dev server.
      "--base-url",
      "--platform-url",
      // `doctor --report`: a write-gate for stdout, not a question — same
      // reasoning as `--apply`/`--json` above.
      "--report",
      // `check migrations`: CI names the ref it compared against; the
      // check is typed-only, so there is no wizard to ask.
      "--base",
      // `moderation send` and `samples`: the receiver's URL and secret, and
      // the message's targets. They are free-form values an app developer has
      // in hand (a function URL they are serving, their own row ids), and the
      // defaults aim at the local Edge Function with the well-known sample
      // secret, so the wizard can run it with none of them.
      "--to",
      "--secret",
      "--content-type",
      "--content-ref",
      "--user",
      "--replay",
      "--stale",
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
   * The top-level names the dispatcher routes on.
   *
   * Hand-written HERE and nowhere else: `dispatch` reaches these through
   * `first === "..."` comparisons, which no import can enumerate. If a command
   * is added to the CLI and not to the tree, this list is where the omission
   * surfaces, and the test below turns it into a failure rather than a command
   * nobody can find in the menu.
   */
  const DISPATCHED = [
    "completions",
    "docs",
    "check",
    "doctor",
    "roles",
    "setup",
    "oauth",
    "script",
    "env",
    "jobs",
    "moderation",
    // Both are dispatched twice: once in `main()` ahead of `intro()`, which is
    // what a typed command line reaches, and once in `dispatch` for the walk
    // the wizard hands back. They belong here for the second of those.
    // The Supabase jobs, and the real tools (passthroughs, typed only:
    // `main()` routes them ahead of `intro()`).
    "restart-stack",
    "new-migration",
    "apply-migrations",
    "push-config",
    "supabase",
    "wrangler",
    "drizzle-kit",
    "psql",
  ];

  it("declares exactly the top-level commands the CLI accepts", () => {
    expect(new Set(TOP_LEVEL.map((node) => node.name))).toEqual(
      new Set(DISPATCHED),
    );
  });

  it("declares the subcommands each group dispatches", () => {
    expect(subcommandNames(["docs"])).toEqual(["check"]);
    expect(subcommandNames(["env"])).toEqual(["init", "example", "reset"]);
    expect(subcommandNames(["jobs"])).toEqual(["run", "list", "serve"]);
    expect(subcommandNames(["check"])).toEqual([
      "migrations",
      "env",
      "workers",
      "scripts",
    ]);
  });

  it("answers to the retired kind-specific names, as aliases of jobs", () => {
    expect(findCommand(["cron", "run"])).toBe(findCommand(["jobs", "run"]));
    expect(findCommand(["workflows", "serve"])).toBe(
      findCommand(["jobs", "serve"]),
    );
    expect(catalog.canonicalArgv(["cron", "run"])).toEqual([
      "jobs",
      "run",
      "--kind",
      "sync",
    ]);
  });

  it("has no command for what was deleted", () => {
    for (const path of [
      ["persona"],
      // Not `moderation`: the old one (report and resolve from the terminal)
      // is gone, and a new one with a different job replaced it. `moderation
      // send` and `samples` exercise a receiver; nothing here moderates.
      // Nor `docs`: the old one (`docs index`) moved to docs-kit, and the new
      // one only checks a project's docs folder.
      ["db"],
      ["cf"],
      ["gen"],
      ["emails"],
      ["grant-root"],
      ["preset"],
    ]) {
      expect(findCommand(path), path.join(" ")).toBeNull();
    }
  });

  it("keeps every deprecated command out of the wizard", () => {
    for (const { path, node } of everyNode()) {
      if (!node.deprecated) continue;
      expect(node.surface, path.join(" ")).toBe("cli-only");
    }
    expect(findCommand(["completions"])?.surface).toBe("cli-only");
  });
});

describe("scopes", () => {
  // Scopes divide the Supabase jobs' lines now that `db` is gone: the layer
  // each one acts on, so a contributor chooses deliberately rather than by
  // accident.
  const SUPABASE = [
    "restart-stack",
    "new-migration",
    "apply-migrations",
    "push-config",
  ];
  const presets = () => SUPABASE.map((name) => findCommand([name])!);

  it("labels every Supabase job", () => {
    for (const command of presets()) {
      expect(command.scope, command.name).toBeDefined();
    }
  });

  it("labels nothing else", () => {
    for (const { path, node } of everyNode()) {
      if (path.length === 1 && SUPABASE.includes(path[0]!)) continue;
      expect(node.scope, path.join(" ")).toBeUndefined();
    }
  });

  /**
   * `--help` opens a heading every time the scope changes as it walks the
   * Supabase group, so scopes that interleaved would render as many one-line blocks
   * rather than readable ones. Declaration order carries that.
   */
  it("declares each scope in one contiguous run", () => {
    const opened = new Set<Scope>();
    let open: Scope | undefined;

    for (const command of presets()) {
      if (!command.scope) continue;
      if (command.scope === open) continue;
      expect(
        opened.has(command.scope),
        `${command.name} reopens ${command.scope}`,
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
    expect(subcommandList(["roles"])).toBe("list, grant or revoke");
    expect(subcommandList(["jobs"])).toBe("run, list or serve");
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
});
