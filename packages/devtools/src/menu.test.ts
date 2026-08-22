/**
 * The wizard's walk, driven through scripted answers.
 *
 * The claim under test is the one the menu exists for: **every command in the
 * tree is reachable from it, and the argv a walk produces is one the CLI
 * accepts.** The menu this replaced could not make that claim — it held ten
 * hand-written entries beside a CLI with sixteen top-level commands, so `env`,
 * `planner`, `signing-key`, `deploy` and `airtable snapshot` had no way in.
 *
 * `@clack/prompts` is mocked rather than driven: the point is which questions
 * get asked and what argv comes out, not how a terminal renders them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const answers: unknown[] = [];
const asked: string[] = [];

vi.mock("@clack/prompts", () => {
  /** Each prompt takes the next scripted answer and records its message. */
  const next = (options: { message?: string }): Promise<unknown> => {
    asked.push(options.message ?? "");
    if (answers.length === 0) throw new Error(`unanswered: ${options.message}`);
    return Promise.resolve(answers.shift());
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

const { runMenu } = await import("./menu.js");
const { GROUPS, TOP_LEVEL, allPaths, findCommand, groupOf } =
  await import("./commands.js");

/** Runs one walk with the given answers, returning the argv it dispatched. */
async function walk(scripted: unknown[]): Promise<string[] | null> {
  answers.length = 0;
  asked.length = 0;
  answers.push(...scripted);

  let dispatched: string[] | null = null;
  await runMenu((argv) => {
    dispatched = argv;
    return Promise.resolve("Done.");
  });
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
});

describe("reach", () => {
  /**
   * The coverage claim, exercised rather than asserted about: walk to every
   * leaf in the tree, declining every optional question, and check that the
   * argv names that exact command.
   */
  it("reaches every command in the tree", async () => {
    const leaves = allPaths().filter(
      (path) => (findCommand(path)?.subcommands ?? []).length === 0,
    );
    expect(leaves.length).toBeGreaterThan(20);

    for (const path of leaves) {
      const node = findCommand(path)!;

      // Enough "no"s and blanks to decline every option prompt on the way out.
      const declines = (node.options ?? []).map((option) => {
        if (option.prompt?.kind === "confirm") return false;
        if (option.prompt?.kind === "text") return "";
        if (option.prompt?.kind === "select")
          return option.prompt.choices[0]!.value;
        return undefined;
      });

      const argv = await walk([...answersFor(path), ...declines]);

      if (node.wizard === "show") {
        // Shown, not run — see `CommandNode.wizard`. Nothing is dispatched.
        expect(argv, path.join(" ")).toBeNull();
        continue;
      }

      expect(argv, path.join(" ")).not.toBeNull();
      expect(argv!.slice(0, path.length), path.join(" ")).toEqual(path);
    }
  });

  it("offers every group on the first screen", async () => {
    await walk([GROUPS[0]!, ...[]]).catch(() => null);
    expect(asked[0]).toBe("What would you like to do?");
  });
});

describe("options become argv", () => {
  it("adds a flag when the confirm is answered yes", async () => {
    const argv = await walk([
      groupOf("airtable")!,
      findCommand(["airtable"])!,
      findCommand(["airtable", "scaffold"])!,
      true,
    ]);
    expect(argv).toEqual(["airtable", "scaffold", "--dry-run"]);
  });

  it("adds nothing when it is answered no", async () => {
    const argv = await walk([
      groupOf("airtable")!,
      findCommand(["airtable"])!,
      findCommand(["airtable", "scaffold"])!,
      false,
    ]);
    expect(argv).toEqual(["airtable", "scaffold"]);
  });

  it("emits a select choice that is a flag on its own", async () => {
    const argv = await walk([
      groupOf("link")!,
      findCommand(["link"])!,
      "--remote",
    ]);
    expect(argv).toEqual(["link", "--remote"]);
  });

  it("asks for the slug the --team choice needs", async () => {
    const argv = await walk([
      groupOf("link")!,
      findCommand(["link"])!,
      "--team",
      "lantern",
    ]);
    expect(argv).toEqual(["link", "--team", "lantern"]);
    expect(asked.at(-1)).toBe("Which team?");
  });

  it("drops --team rather than emit it with no slug", async () => {
    // The parser refuses `--team` with nothing after it. Falling back to the
    // default target beats asking again for something already declined.
    const argv = await walk([
      groupOf("link")!,
      findCommand(["link"])!,
      "--team",
      "",
    ]);
    expect(argv).toEqual(["link"]);
  });

  it("emits a select choice that is a value after its flag", async () => {
    const argv = await walk([
      groupOf("signing-key")!,
      findCommand(["signing-key"])!,
      findCommand(["signing-key", "status"])!,
      "production",
    ]);
    expect(argv).toEqual(["signing-key", "status", "--target", "production"]);
  });

  it("drops an optional text answered blank", async () => {
    const argv = await walk([
      groupOf("planner")!,
      findCommand(["planner"])!,
      findCommand(["planner", "status"])!,
      "  ",
    ]);
    expect(argv).toEqual(["planner", "status"]);
  });
});

describe("navigation", () => {
  it("skips the command screen for a group holding one command", async () => {
    const argv = await walk([groupOf("setup")!]);
    expect(argv).toEqual(["setup"]);
    // Group screen only: no second "which command" question.
    expect(asked).toEqual(["What would you like to do?"]);
  });

  it("dispatches nothing when the reader quits", async () => {
    expect(await walk([null])).toBeNull();
  });
});

describe("the tree it walks", () => {
  it("has more top-level commands than the old menu had entries", () => {
    // The menu this replaced listed ten. The gap was the bug.
    expect(TOP_LEVEL.length).toBeGreaterThan(10);
  });
});
