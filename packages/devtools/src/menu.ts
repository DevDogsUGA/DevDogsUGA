/**
 * The wizard: `pnpm devtools` with no arguments.
 *
 * ## The one property worth protecting
 *
 * **It builds an argv and hands it to the CLI's own dispatcher.** It does not
 * call command functions directly. That is what makes "the menu covers every
 * command" structural instead of aspirational. The menu it replaced held a
 * hand-written list of ten entries beside a CLI that had grown to sixteen
 * top-level commands and thirty-one subcommands, so `env`, `planner`,
 * `signing-key`, `deploy` and `airtable check` were reachable only by
 * someone who already knew their names. A contributor who does not know a
 * command name is the entire audience for this file.
 *
 * Walking `commands.ts` means a command added there is in the menu the same
 * day, with its options, and cannot be forgotten here.
 *
 * ## Why `deploy` is shown rather than run
 *
 * Its steps want a runner's environment and two of them have a stdout that
 * GitHub or a Worker secret is read from. Choosing one prints the exact line
 * to run instead of running it. See `CommandNode.wizard` for the full reason.
 * They are still in the tree, still selectable, still described.
 */
import { confirm, log, note, select, text } from "@clack/prompts";
import {
  GROUPS,
  SCOPES,
  type CommandGroup,
  type CommandNode,
  type CommandOption,
} from "./commands.js";
import {
  blockedBecause,
  describeEnvironment,
  isOffered,
  probeEnvironment,
  type Environment,
} from "./environment.js";
import { unwrap } from "./ui.js";

/** Chosen when a submenu should return to the screen above it. */
const BACK = Symbol("back");
type Back = typeof BACK;

const BACK_OPTION = { value: BACK, label: "← Back" } as const;

/**
 * The wrapper-free entry point the `deploy` steps use.
 *
 * `pnpm devtools` is `with-env tsx src/cli.ts`, and most of these run in jobs
 * that have no env file yet: write-env is what CREATES it.
 *
 * This used to be a hard requirement. The wrapper exited on a missing file, so
 * a wrapped `write-env` died on the very file it was about to compose, and the
 * others reported a missing FILE rather than the missing token, the paused
 * project or the missing credential. `with-env` reports the absence and
 * carries on now, so either entry point would work.
 *
 * It still prints THIS one, because the line is meant to be pasted into a job
 * step and `deploy.yaml` invokes `cli:no-env` at every one of those steps.
 */
const NO_ENV_ENTRY = "pnpm --filter @devdogsuga/devtools run cli:no-env deploy";

// ── What this machine is offered ─────────────────────────────────────────────

/**
 * The commands at one level that are worth showing right now.
 *
 * `when` is the only thing that removes an entry, and it removes very few;
 * see `isOffered`. Everything else stays on screen and explains itself
 * through `hintFor` below, because the menu's job is to help someone who does
 * not know a command's name, and it cannot do that for a command it declined
 * to draw.
 */
function offered(
  nodes: readonly CommandNode[],
  env: Environment,
): CommandNode[] {
  return nodes.filter((node) => isOffered(node, env));
}

/**
 * The line beside a name, with whatever is standing in this command's way.
 *
 * The reader learns that `roundtrip` needs a stack that is not up *before*
 * choosing it, instead of after a spinner and a connection error. The command
 * stays selectable: the check is a probe, the probe can be wrong, and the
 * command's own failure message is the authority on whether it can run.
 */
function hintFor(node: CommandNode, env: Environment): string {
  const base = node.hint ?? node.summary;
  const blocked = blockedBecause(node, env);
  const said = blocked ? `${base} — ${blocked}` : base;

  // The scope leads, because in the one group that has scopes it is the thing
  // the reader is actually choosing between: `restart` and `reset` sit four
  // lines apart and act on different layers.
  return node.scope ? `${SCOPES[node.scope].menu} · ${said}` : said;
}

// ── Screens ──────────────────────────────────────────────────────────────────

async function pickGroup(env: Environment): Promise<CommandGroup | null> {
  // A group whose every command is hidden has nothing behind its door, so the
  // door is not drawn. No group in the tree can empty out today; this is here
  // so that a later `when` cannot leave a dead entry on the first screen.
  const groups = GROUPS.filter(
    (group) => offered(group.commands, env).length > 0,
  );

  const choice = unwrap(
    await select<CommandGroup | null>({
      message: "What would you like to do?",
      options: [
        ...groups.map((group) => ({
          value: group,
          label: group.title,
          // The group's own commands, so the first screen says what is behind
          // each door rather than making the reader open all six to find out.
          hint: offered(group.commands, env)
            .map((command) => command.name)
            .join(", "),
        })),
        { value: null, label: "Quit" },
      ],
    }),
  );
  return choice;
}

async function pickCommand(
  group: CommandGroup,
  env: Environment,
): Promise<CommandNode | Back> {
  const commands = offered(group.commands, env);

  // A group with one command has nothing to choose; asking would be a screen
  // whose only real option is the one already implied by the group's title.
  if (commands.length === 1) return commands[0]!;

  return unwrap(
    await select<CommandNode | Back>({
      message: `${group.title}:`,
      options: [
        ...commands.map((command) => ({
          value: command,
          label: command.name,
          hint: hintFor(command, env),
        })),
        BACK_OPTION,
      ],
    }),
  );
}

async function pickSubcommand(
  node: CommandNode,
  env: Environment,
): Promise<CommandNode | Back> {
  return unwrap(
    await select<CommandNode | Back>({
      message: `${node.name}:`,
      options: [
        ...offered(node.subcommands ?? [], env).map((child) => ({
          value: child,
          label: child.name,
          hint: hintFor(child, env),
        })),
        BACK_OPTION,
      ],
    }),
  );
}

// ── Options ──────────────────────────────────────────────────────────────────

/**
 * Asks for one option, returning the argv fragment it contributes.
 *
 * An empty array is a real answer, not a failure: a declined confirm adds no
 * flag, and a blank optional text means "let the command decide", which is
 * how `--db-url` falls back to `.env.production` and `--base-url` falls
 * through to the OAuth wizard's own prompt.
 */
async function askOption(option: CommandOption): Promise<string[]> {
  const prompt = option.prompt;
  if (!prompt) return [];

  if (prompt.kind === "confirm") {
    // Yes adds the flag, always. `commands.ts` phrases every message so that
    // this needs no per-option inversion.
    const yes = unwrap(
      await confirm({ message: prompt.message, initialValue: prompt.initial }),
    );
    return yes ? [option.flag] : [];
  }

  if (prompt.kind === "text") {
    const answer = unwrap(
      await text({
        message: prompt.message,
        placeholder: prompt.placeholder,
        defaultValue: "",
      }),
    ).trim();
    return answer ? [option.flag, answer] : [];
  }

  const choice = unwrap(
    await select({
      message: prompt.message,
      options: prompt.choices.map((c) => ({
        value: c.value,
        label: c.label ?? c.value,
        hint: c.hint,
      })),
    }),
  );

  const chosen = prompt.choices.find((c) => c.value === choice)!;

  // A choice that IS a flag stands alone (`--local`); anything else is a value
  // for this option's flag (`--target staging`).
  const head = choice.startsWith("--") ? [choice] : [option.flag, choice];

  if (!chosen.argValue) return head;

  const value = unwrap(
    await text({
      message: chosen.argValue.message,
      placeholder: chosen.argValue.placeholder,
      defaultValue: "",
    }),
  ).trim();

  // `--team` with no slug is refused by the parser anyway; dropping the flag
  // here means a blank answer falls back to the default target rather than
  // ending in an error the wizard could have avoided asking twice about.
  return value ? [...head, value] : [];
}

async function askOptions(node: CommandNode): Promise<string[]> {
  const argv: string[] = [];
  for (const option of node.options ?? []) {
    argv.push(...(await askOption(option)));
  }
  return argv;
}

// ── Walk ─────────────────────────────────────────────────────────────────────

/** The path and flags a walk produced, or `null` if the reader backed out. */
interface Chosen {
  node: CommandNode;
  argv: string[];
}

async function walk(env: Environment): Promise<Chosen | null> {
  for (;;) {
    const group = await pickGroup(env);
    if (!group) return null;

    const first = await pickCommand(group, env);
    if (first === BACK) continue;

    let node = first;
    const path = [node.name];
    let backedOut = false;

    // `while` rather than a single step: the tree is two deep today and this
    // does not care. The condition counts the OFFERED children rather than
    // all of them, so a node whose every subcommand is hidden is treated as
    // the leaf it has become instead of opening a screen holding only "Back".
    while (offered(node.subcommands ?? [], env).length > 0) {
      const child = await pickSubcommand(node, env);
      if (child === BACK) {
        backedOut = true;
        break;
      }
      node = child;
      path.push(node.name);
    }

    if (backedOut) continue;

    return { node, argv: [...path, ...(await askOptions(node))] };
  }
}

// ── Entry ────────────────────────────────────────────────────────────────────

/**
 * Runs the wizard, returning the `outro()` line its command earned.
 *
 * `dispatch` is the CLI's own argv handler, injected rather than imported so
 * that `cli.ts` keeps a single definition of what each command does and the
 * tests can watch what a walk produces without running it. Its return value
 * passes straight through, the closing line or `null` for a failure already
 * explained, so a command reached from the menu signs off exactly as it does
 * from the command line.
 */
export async function runMenu(
  dispatch: (argv: string[]) => Promise<string | null>,
  env: Environment = probeEnvironment(),
): Promise<string | null> {
  // Before the first question, not after a failure. Three lines saying what
  // this machine currently is explain why the database commands below are
  // flagged, and cost one glance on a healthy machine. Injected rather than
  // probed inside `walk` so the tests can drive a machine they describe
  // instead of the one they happen to run on.
  note(describeEnvironment(env), "This machine");

  const chosen = await walk(env);
  // Quitting is not a failure, but it has nothing to announce either.
  if (!chosen) return null;

  if (chosen.node.wizard === "show") {
    note(
      [
        `${NO_ENV_ENTRY} ${chosen.argv.slice(1).join(" ")}`,
        "",
        chosen.node.summary,
      ].join("\n"),
      "Run this in the job, not here",
    );
    log.info(
      "Deploy steps read a runner's environment, and two of them have a " +
        "stdout that GitHub or a Worker secret is taken from.",
    );
    return null;
  }

  return dispatch(chosen.argv);
}
