/**
 * The command tree's style guards, for the officer CLI. The same claims
 * devtools' `catalog.test.ts` makes of its own tree: every command is one line
 * in `--help`, every path renders, and a flag the menu does not ask about is
 * one somebody decided on.
 */
import { describe, expect, it } from "vitest";
import { renderHelp } from "@devdogsuga/cli-core/help";
import { catalog } from "./catalog.js";

const { allPaths, findCommand, subcommandNames } = catalog;

describe("the tree", () => {
  it("is the commands that always need production secrets, then the ones that need none, then completions", () => {
    expect(catalog.topLevel.map((node) => node.name)).toEqual([
      "deploy",
      "env",
      "planner",
      "import",
      "export",
      "graphics",
      "qr",
      "github",
      "newsletter",
      "creds",
      "completions",
    ]);
  });

  it("marks every command that needs no env file or tier envFree", () => {
    // These run under `pnpm dlx` with no checkout and no `.env`; the
    // launcher skips env entry for them (see `launch-core.ts`).
    const envFree = catalog
      .allPaths()
      .filter((path) => catalog.findCommand(path)!.envFree)
      .map((path) => path.join(" "));
    expect(envFree).toEqual([
      "import involvement",
      "import attendance",
      "import contributions",
      "export stars",
      "export attendance",
      "export reflections",
      "export responses",
      "graphics",
      "qr",
      "github rulesets",
      "github settings",
      "newsletter render",
      "newsletter draft",
      "newsletter send",
      "creds send",
      "creds add",
      "creds renew",
      "creds list",
      "creds report",
    ]);
  });

  it("declares the subcommands each group dispatches", () => {
    expect(subcommandNames(["deploy"])).toEqual([
      "platform",
      "schedule-builder",
      "catalog",
      "write-env",
      "preflight",
      "plan",
      "migrate",
      "avatars",
      "smoke",
      "reconcile",
      "prune-monitors",
    ]);
    expect(subcommandNames(["env"])).toEqual(["pull", "push", "audit"]);
    expect(subcommandNames(["github"])).toEqual(["rulesets", "settings"]);
    expect(subcommandNames(["newsletter"])).toEqual([
      "render",
      "draft",
      "send",
    ]);
    expect(subcommandNames(["creds"])).toEqual([
      "send",
      "add",
      "renew",
      "list",
      "report",
    ]);
    expect(subcommandNames(["import"])).toEqual([
      "involvement",
      "attendance",
      "contributions",
    ]);
    expect(subcommandNames(["export"])).toEqual([
      "stars",
      "attendance",
      "reflections",
      "responses",
    ]);
    expect(subcommandNames(["planner"])).toEqual([
      "status",
      "create",
      "reset-password",
      "drop",
    ]);
  });

  it("has no command for what was folded away", () => {
    for (const path of [
      ["bw"],
      ["deploy", "require-token"],
      ["deploy", "require-planner"],
      ["deploy", "secrets-file"],
      ["deploy", "orphans"],
    ]) {
      expect(findCommand(path), path.join(" ")).toBeNull();
    }
  });

  it("gives every command a one-line summary", () => {
    for (const path of allPaths()) {
      const summary = findCommand(path)!.summary;
      expect(summary, path.join(" ")).not.toBe("");
      expect(summary, path.join(" ")).not.toContain("\n");
    }
  });
});

describe("help", () => {
  it("fits the top level on a screen", () => {
    expect(renderHelp(catalog).split("\n").length).toBeLessThan(42);
  });

  it("renders every path, under the name people type", () => {
    for (const path of allPaths()) {
      const text = renderHelp(catalog, path);
      expect(text, path.join(" ")).toContain(findCommand(path)!.summary);
      expect(text, path.join(" ")).toContain(
        `pnpm backstage ${path.join(" ")}`,
      );
    }
  });

  it("documents --no-env and --tier at the top level", () => {
    const root = renderHelp(catalog);
    expect(root).toContain("--no-env");
    expect(root).toContain("--tier");
  });
});

describe("prompts", () => {
  /**
   * An option with no prompt is one the menu does not ask about on its own
   * screen. Each is asked SOMEWHERE else, or is one of three documented
   * kinds: live data the command asks from (`--target`, `--app`, `--db-url`
   * when it has a prompt of its own), a suppressor (`--yes`), a credential
   * (`--access-token`), or scripting-only (`--json`, `--label`, `--source`,
   * `--dry-run`, `--prune`, `--file`, `--shell` has one).
   */
  it("leaves unasked only the flags something else asks for", () => {
    const allowed = new Set([
      // `pick.ts` asks, ordered least- to most-dangerous.
      "--target",
      // The command asks from the apps in workers.json.
      "--app",
      // Suppresses a prompt; asking in a wizard that IS the prompt is absurd.
      "--yes",
      // A credential: typing it puts it in `ps` and shell history.
      "--access-token",
      // A file path: a text box is a worse version of the default.
      "--file",
      // Scripting-only.
      "--json",
      "--label",
      "--include-seed",
      "--source",
      "--dry-run",
      // The menu offers the prune itself, after showing the audit.
      "--prune",
      // `graphics` asks for the graphic and the formats itself, in CLI order,
      // from what the chosen graphics support; a static list cannot know.
      "--format",
      "--all-formats",
      "--out",
      // `qr` asks for the text itself. Its other flags are the schema's
      // fields (see `qr/options.ts`): a wizard question for each would be a
      // form the console page already is.
      "--text",
      "--theme",
      "--size",
      "--margin",
      "--color",
      "--background",
      "--gradient",
      "--shape",
      "--logo",
      "--logo-size",
      "--logo-padding",
      "--error-level",
      "--qr-version",
      "--logo-crop",
      "--name",
      // GitHub org/repo scoping: both default to the one repository the
      // reconciler manages.
      "--org",
      "--repo",
      // Write gate, not a question: the confirmation before writing IS the
      // question.
      "--apply",
      // `creds` asks for these itself: accounts from the collection,
      // recipients from the live roster, the new login's details one by one.
      "--item",
      "--to",
      "--role",
      "--url",
      "--username",
      "--owner",
      "--collection",
      // Deliberate overrides and scripting: sharing outside the officer team,
      // a production connection, a Linear key (a credential), skipping the
      // report, a password on stdin, and a test document.
      "--allow-email",
      "--db-url",
      "--linear-token",
      "--no-report",
      "--password-stdin",
      "--document",
      // `export` and `import attendance`: filters and paths a person types
      // once, not choices a menu could offer. `import attendance` asks for
      // the meeting itself when it is missing.
      "--from",
      "--to",
      "--meeting",
      "--out",
      "--email-column",
      "--name-column",
      "--replace",
      // `import contributions`: a start day, for a narrower backfill.
      "--since",
      // `env --repo <product>`: where the product checkout is, when it is not
      // beside this clone.
      "--checkout",
    ]);
    const unasked = new Set<string>();
    for (const path of allPaths()) {
      for (const option of findCommand(path)!.options ?? []) {
        if (!option.prompt) unasked.add(option.flag);
      }
    }
    expect([...unasked].sort()).toEqual([...allowed].sort());
  });
});
