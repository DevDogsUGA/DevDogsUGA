/**
 * The wizard's walk, driven through scripted answers.
 *
 * The claim under test is the one the menu exists for: **every interactive
 * command in the tree is reachable from it, and the argv a walk produces is one the CLI
 * accepts.** The menu this replaced could not make that claim. It held ten
 * hand-written entries beside a CLI with sixteen top-level commands, so `env`,
 * `planner`, `signing-key` and `airtable check` had no way in.
 *
 * `@clack/prompts` is mocked rather than driven: the point is which questions
 * get asked and what argv comes out, not how a terminal renders them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "./environment.js";

const answers: unknown[] = [];
const asked: string[] = [];

/** Every entry each screen actually drew, for the adaptation tests below. */
interface Entry {
  label?: string;
  hint?: string;
}
const shown: Entry[][] = [];

/**
 * Selects whichever option the current screen drew last, rather than a
 * literal scripted value.
 *
 * `pickCommand` and `pickSubcommand` both append `BACK_OPTION` after every
 * entry they offer, so "last" is always Back. `BACK` itself is a symbol
 * private to `menu.ts` — there is no literal a test can import and push onto
 * `answers` — so this is how the "reader backs out" tests select it anyway.
 */
const PICK_BACK = Symbol("pick-back");

vi.mock("@clack/prompts", () => {
  /** Each prompt takes the next scripted answer and records what it drew. */
  const next = (options: {
    message?: string;
    options?: Array<{ value?: unknown; label?: string; hint?: string }>;
  }): Promise<unknown> => {
    asked.push(options.message ?? "");
    // Recorded BEFORE the throw below, so a walk that runs out of answers
    // still leaves the screen it stopped on available to inspect. That is how
    // the filtering tests read one screen without scripting a whole walk.
    if (options.options) {
      shown.push(options.options.map(({ label, hint }) => ({ label, hint })));
    }
    if (answers.length === 0) throw new Error(`unanswered: ${options.message}`);
    const answer = answers.shift();
    if (answer === PICK_BACK) {
      return Promise.resolve(options.options?.at(-1)?.value);
    }
    return Promise.resolve(answer);
  };
  return {
    select: next,
    confirm: next,
    text: next,
    isCancel: () => false,
    cancel: vi.fn(),
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), message: vi.fn() },
    note: vi.fn(),
  };
});

const { runMenu, bareGroupStartPath } = await import("./menu.js");
const { GROUPS, TOP_LEVEL, allPaths, findCommand, groupOf } =
  await import("./commands.js");
const { UNKNOWN_ENVIRONMENT } = await import("./environment.js");

/**
 * Runs one walk with the given answers, returning the argv it dispatched.
 *
 * The environment is injected, and defaults to the one that adapts nothing, so
 * every test below describes the machine it means rather than inheriting
 * whichever machine happens to be running the suite. Letting `runMenu` probe
 * for real would make the reachability claim depend on whether the developer
 * had Docker open.
 */
async function walk(
  scripted: unknown[],
  env: Environment = UNKNOWN_ENVIRONMENT,
): Promise<string[] | null> {
  answers.length = 0;
  asked.length = 0;
  shown.length = 0;
  answers.push(...scripted);

  let dispatched: string[] | null = null;
  await runMenu((argv) => {
    dispatched = argv;
    return Promise.resolve("Done.");
  }, env);
  return dispatched;
}

/**
 * Runs one walk resumed at `startPath`, mirroring `walk` above but through
 * `runMenu`'s `options.startPath` instead of `pickGroup`. What `main()` does
 * for a bare command group — `devtools db` — at a terminal.
 */
async function resume(
  startPath: string[],
  scripted: unknown[],
  env: Environment = UNKNOWN_ENVIRONMENT,
): Promise<string[] | null> {
  answers.length = 0;
  asked.length = 0;
  shown.length = 0;
  answers.push(...scripted);

  let dispatched: string[] | null = null;
  await runMenu(
    (argv) => {
      dispatched = argv;
      return Promise.resolve("Done.");
    },
    env,
    { startPath },
  );
  return dispatched;
}

/** The answers that select a command, before any option question. */
function answersFor(path: string[]): unknown[] {
  const group = groupOf(path[0]!)!;
  const chosen: unknown[] = [group];

  // A group with one command asks nothing; see `pickCommand`.
  let node = findCommand([path[0]!])!;
  if (group.commands.length > 1) chosen.push(node);

  for (const name of path.slice(1)) {
    node = findCommand(path.slice(0, path.indexOf(name) + 1))!;
    chosen.push(node);
  }
  return chosen;
}

beforeEach(() => {
  answers.length = 0;
  asked.length = 0;
  shown.length = 0;
});

describe("reach", () => {
  /**
   * The coverage claim, exercised rather than asserted about: walk to every
   * leaf in the tree, declining every optional question, and check that the
   * argv names that exact command.
   */
  it("reaches every interactive command in the tree", async () => {
    const leaves = allPaths().filter((path) => {
      const node = findCommand(path);
      return (
        (node?.subcommands ?? []).length === 0 && node?.surface !== "cli-only"
      );
    });
    expect(leaves.length).toBeGreaterThan(20);

    for (const path of leaves) {
      const node = findCommand(path)!;

      // Enough "no"s and blanks to decline every option prompt on the way out.
      //
      // Promptless options are FILTERED OUT rather than mapped to `undefined`.
      // The wizard never asks about them (see `CommandOption.prompt`), so an
      // entry for one is an extra answer that shifts every later prompt onto
      // the wrong value — a `false` reaching a text prompt, which fails as
      // `unwrap(...).trim is not a function` rather than as anything readable.
      // It stayed hidden while every promptless flag happened to sit last in
      // its command's list.
      const declines = (node.options ?? []).flatMap((option): unknown[] => {
        const { prompt } = option;
        if (!prompt) return [];
        if (prompt.kind === "confirm") return [false];
        if (prompt.kind === "text") return [""];

        return [prompt.choices[0]!.value];
      });

      const argv = await walk([...answersFor(path), ...declines]);

      expect(argv, path.join(" ")).not.toBeNull();
      expect(argv!.slice(0, path.length), path.join(" ")).toEqual(path);
    }
  });

  it("offers interactive groups and omits CLI-only utilities", async () => {
    await walk([GROUPS[0]!, ...[]]).catch(() => null);
    expect(asked[0]).toBe("What would you like to do?");
    expect(shown[0]?.map((entry) => entry.label)).not.toContain(
      "CLI utilities",
    );
  });
});

describe("options become argv", () => {
  it("lets images ask for graphic, format, and output in CLI order", async () => {
    const argv = await walk([groupOf("images")!, findCommand(["images"])!]);
    expect(argv).toEqual(["images"]);
    expect(asked).toEqual([
      "What would you like to do?",
      "Content & communications:",
    ]);
  });

  it("adds a flag when the confirm is answered yes", async () => {
    const argv = await walk([
      groupOf("airtable")!,
      findCommand(["airtable"])!,
      findCommand(["airtable", "apply"])!,
      true,
    ]);
    expect(argv).toEqual(["airtable", "apply", "--dry-run"]);
  });

  it("adds nothing when it is answered no", async () => {
    const argv = await walk([
      groupOf("airtable")!,
      findCommand(["airtable"])!,
      findCommand(["airtable", "apply"])!,
      false,
    ]);
    expect(argv).toEqual(["airtable", "apply"]);
  });

  it("emits --target remote for docs index's acknowledgment select", async () => {
    const argv = await walk([
      groupOf("docs")!,
      findCommand(["docs"])!,
      findCommand(["docs", "index"])!,
      "remote",
    ]);
    expect(argv).toEqual(["docs", "index", "--target", "remote"]);
  });

  it("emits a select choice that is a value after its flag", async () => {
    const argv = await walk([
      groupOf("db")!,
      findCommand(["db"])!,
      findCommand(["db", "signing-key"])!,
      findCommand(["db", "signing-key", "status"])!,
      "production",
    ]);
    expect(argv).toEqual([
      "db",
      "signing-key",
      "status",
      "--target",
      "production",
    ]);
  });

  it("drops an optional text answered blank", async () => {
    const argv = await walk([
      groupOf("db")!,
      findCommand(["db"])!,
      findCommand(["db", "planner"])!,
      findCommand(["db", "planner", "status"])!,
      "  ",
    ]);
    expect(argv).toEqual(["db", "planner", "status"]);
  });
});

describe("navigation", () => {
  it("opens the Workspace command screen before run's tasks", async () => {
    const argv = await walk(answersFor(["run", "build"]));
    expect(argv).toEqual(["run", "build"]);
    expect(asked).toEqual(["What would you like to do?", "Workspace:", "run:"]);
  });

  it("dispatches nothing when the reader quits", async () => {
    expect(await walk([null])).toBeNull();
  });
});

describe("entered-tier recording", () => {
  // `src/launch.ts` resolves and enters the session's deploy tier BEFORE this
  // module ever runs (see `runMenu`'s own header) — so all that is left for
  // `runMenu` to do is read it back off `process.env.DEPLOY_ENV` and record it
  // for the "run it directly next time" line `reproducibleCommand` builds.
  const savedDeployEnv = process.env.DEPLOY_ENV;
  const savedDevDb = process.env.DEV_DB;
  afterEach(() => {
    if (savedDeployEnv === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = savedDeployEnv;
    if (savedDevDb === undefined) delete process.env.DEV_DB;
    else process.env.DEV_DB = savedDevDb;
  });

  it("records the ambient DEPLOY_ENV as the entered tier", async () => {
    process.env.DEPLOY_ENV = "staging";
    const { reproducibleCommand } = await import("./invocation.js");
    await walk(answersFor(["db", "status"]));
    expect(reproducibleCommand()).toBe(
      "pnpm devtools --tier staging db status",
    );
  });

  it("records nothing extra for the development default", async () => {
    delete process.env.DEPLOY_ENV;
    delete process.env.DEV_DB;
    const { reproducibleCommand } = await import("./invocation.js");
    await walk(answersFor(["db", "status"]));
    expect(reproducibleCommand()).toBe("pnpm devtools db status");
  });

  it("records the qualified selector for a development session with DEV_DB", async () => {
    // Reproducing a session that ANSWERED the development-database question
    // with a bare `pnpm devtools db status` would re-ask it (or refuse,
    // non-interactively) on the same machine — the hint must carry the whole
    // session.
    delete process.env.DEPLOY_ENV;
    process.env.DEV_DB = "remote";
    const { reproducibleCommand } = await import("./invocation.js");
    await walk(answersFor(["db", "status"]));
    expect(reproducibleCommand()).toBe(
      "pnpm devtools --tier development:remote db status",
    );
  });
});

describe("bareGroupStartPath", () => {
  // What `main()` calls, at a TTY, to decide whether a bare command group
  // should resume the wizard instead of hitting the dispatcher's "which of
  // …?" refusal. Pure and tree-driven, so these assert directly rather than
  // through a scripted walk.
  it("finds a top-level group", () => {
    expect(bareGroupStartPath(["db"])).toEqual(["db"]);
  });

  it("finds a nested group", () => {
    expect(bareGroupStartPath(["db", "seed"])).toEqual(["db", "seed"]);
  });

  it("returns null for a leaf command", () => {
    expect(bareGroupStartPath(["db", "status"])).toBeNull();
  });

  it("returns null for an unknown subcommand token", () => {
    expect(bareGroupStartPath(["db", "bogus"])).toBeNull();
  });

  it("returns null for a bare invocation", () => {
    // The no-argument wizard already covers this path; treating it as a
    // "resume" too would just be `pickGroup` reached a second way.
    expect(bareGroupStartPath([])).toBeNull();
  });

  it("returns null for a top-level leaf command", () => {
    expect(bareGroupStartPath(["setup"])).toBeNull();
  });

  it("ignores flag values ahead of the group name", () => {
    // `positionals` is what keeps `staging` from being misread as a
    // subcommand token here — the same bug class `args.ts`'s header warns
    // against for `env --file push audit`.
    expect(bareGroupStartPath(["db", "--tier", "staging"])).toEqual(["db"]);
  });
});

describe("resuming at a node", () => {
  // The property `main()` relies on: a walk resumed at a group's path reaches
  // the same leaf, with the same argv, as walking there from the top of the
  // tree — it just skips the screens above that group.
  it("reaches the same leaf as a full walk, skipping the group screens", async () => {
    const full = await walk(answersFor(["db", "seed", "buckets"]));
    expect(full).toEqual(["db", "seed", "buckets"]);

    const resumed = await resume(
      ["db"],
      [findCommand(["db", "seed"])!, findCommand(["db", "seed", "buckets"])!],
    );
    expect(resumed).toEqual(full);

    // The first question is db's own subcommand screen, not the top-level
    // "What would you like to do?" — there is no group screen to skip past
    // because a resumed walk never opens one.
    expect(asked[0]).toBe("db:");
  });

  it("dispatches nothing when the reader backs out of the resumed screen", async () => {
    expect(await resume(["db"], [PICK_BACK])).toBeNull();
  });
});

describe("adapts to the machine", () => {
  const RUNNING: Environment = {
    docker: "yes",
    stack: "yes",
    envFile: "yes",
  };
  const STOPPED: Environment = { docker: "yes", stack: "no", envFile: "yes" };

  /**
   * The entries one screen drew, for a machine in the given state.
   *
   * Walks far enough to open the screen and then runs out of answers on
   * purpose: the mock records what it drew before it gives up, so this reads
   * the list without scripting a complete walk to a leaf.
   */
  async function screen(env: Environment, to: string[]): Promise<Entry[]> {
    const path: string[] = [];
    const scripted: unknown[] = [groupOf(to[0]!)!];
    for (const name of to) {
      path.push(name);
      scripted.push(findCommand(path)!);
    }
    await walk(scripted, env).catch(() => null);
    return shown.at(-1) ?? [];
  }

  const labels = (entries: Entry[]): (string | undefined)[] =>
    entries.map((entry) => entry.label);

  it("offers stop and restart only while the stack is running", async () => {
    expect(labels(await screen(RUNNING, ["db"]))).toContain("stop");
    expect(labels(await screen(RUNNING, ["db"]))).toContain("restart");

    expect(labels(await screen(STOPPED, ["db"]))).not.toContain("stop");
    expect(labels(await screen(STOPPED, ["db"]))).not.toContain("restart");
  });

  /**
   * The property that keeps a failed probe from becoming a missing command.
   *
   * `docker ps` can time out, Docker can be absent, a future probe can fail in
   * a way nobody predicted. In every one of those cases the menu is the one it
   * was before any of this existed.
   */
  it("hides nothing when it cannot read the machine", async () => {
    const drawn = labels(await screen(UNKNOWN_ENVIRONMENT, ["db"]));
    for (const command of findCommand(["db"])!.subcommands ?? []) {
      expect(drawn, command.name).toContain(command.name);
    }
  });

  it("says why a command will not work rather than hiding it", async () => {
    const drawn = await screen(STOPPED, ["catalog"]);
    const roundtrip = drawn.find((entry) => entry.label === "roundtrip");

    // Still on screen. `needs` explains, it does not remove.
    expect(roundtrip).toBeDefined();
    expect(roundtrip!.hint).toContain(
      "Supabase is not running on this machine",
    );
  });

  it("leaves the hint alone when nothing is in the way", async () => {
    const drawn = await screen(RUNNING, ["catalog"]);
    const roundtrip = drawn.find((entry) => entry.label === "roundtrip");

    expect(roundtrip!.hint).toBe(findCommand(["roundtrip"])!.hint);
  });

  /**
   * The "Database" group now holds exactly one command, `db`, and a group
   * with one command is always offered whole — see `pickCommand`. The
   * filtering this test used to show at the GROUP level (`link` shown,
   * `stop` hidden while stopped) happens one screen deeper now, on `db`'s own
   * subcommand list; "offers stop and restart only while the stack is
   * running" above covers that. What is still true here is that the group's
   * own hint names only what it actually contains.
   */
  it("names the runtime commands in the group's hint", async () => {
    await walk([], STOPPED).catch(() => null);
    const database = shown[0]!.find(
      (entry) => entry.label === "Runtime & infrastructure",
    );

    expect(database!.hint).toBe("db, cf, cron, workflows");
  });

  /**
   * The layers `db` covers, told apart on the line.
   *
   * `restart` and `reset` sit several entries apart and act on different
   * things: the containers, and the database inside them. A reader choosing
   * between them should not have to already know that.
   */
  it("says which layer each db command acts on", async () => {
    const drawn = await screen(RUNNING, ["db"]);
    const hintOf = (name: string) =>
      drawn.find((entry) => entry.label === name)?.hint ?? "";

    expect(hintOf("restart")).toContain("This machine · ");
    expect(hintOf("stop")).toContain("This machine · ");
    expect(hintOf("reset")).toContain("Database · ");
    expect(hintOf("migrate")).toContain("Database · ");
  });

  it("leaves a group without scopes unlabelled", async () => {
    const drawn = await screen(RUNNING, ["catalog"]);
    for (const entry of drawn) {
      expect(entry.hint ?? "", entry.label).not.toContain(" · ");
    }
  });
});

describe("the tree it walks", () => {
  it("has more top-level commands than the old menu had entries", () => {
    // The menu this replaced listed ten. The gap was the bug.
    expect(TOP_LEVEL.length).toBeGreaterThan(10);
  });
});
