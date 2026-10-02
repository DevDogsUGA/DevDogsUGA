/**
 * The command lists of the two club CLIs, so `command-check.ts` can validate a
 * `pnpm devtools …` or `pnpm backstage …` line without this package depending
 * on either or copying their command trees.
 *
 * Each CLI describes itself: `--help --json` prints
 * `{ "version": …, "commands": [{ "path": "deploy smoke", … }, …] }`, groups
 * included. That is the one published, versioned surface, and it needs no
 * checkout of the CLI's source. It is read by running what a contributor would
 * type, `pnpm devtools` / `pnpm backstage` from the repo root (the root
 * scripts `pnpm dlx` the latest publish), so the docs are checked against the
 * CLI people will actually get.
 *
 * ## The override
 *
 * `DOCS_KIT_DEVTOOLS_CMD` and `DOCS_KIT_BACKSTAGE_CMD` replace that command
 * (whitespace-separated, no quoting), e.g.
 * `DOCS_KIT_DEVTOOLS_CMD="node /path/to/devtools.mjs"`. It exists to check the
 * docs against a build that is not published yet, which is the order a CLI
 * change lands in: docs first, publish, push.
 *
 * ## Failure is an error
 *
 * Nothing here returns "unknown". If the CLI cannot be run, or prints
 * something that is not a catalog, this throws and the docs build fails: a
 * check that quietly skipped itself would let a docs page keep a command that
 * no longer exists, which is the thing the check is for.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type CliName = "devtools" | "backstage";

const OVERRIDE_VARIABLE: Readonly<Record<CliName, string>> = {
  devtools: "DOCS_KIT_DEVTOOLS_CMD",
  backstage: "DOCS_KIT_BACKSTAGE_CMD",
};

/** A resolved `--help --json` run takes a dlx install; this is generous. */
const TIMEOUT_MS = 180_000;

/** The override variables' values, for the build cache key. */
export function cliOverrides(
  env: NodeJS.ProcessEnv = process.env,
): Record<CliName, string> {
  return {
    devtools: env[OVERRIDE_VARIABLE.devtools] ?? "",
    backstage: env[OVERRIDE_VARIABLE.backstage] ?? "",
  };
}

function commandFor(cli: CliName, env: NodeJS.ProcessEnv): string[] {
  const override = (env[OVERRIDE_VARIABLE[cli]] ?? "").trim();
  return override === "" ? ["pnpm", cli] : override.split(/\s+/);
}

/**
 * The JSON object in a CLI's stdout. `pnpm dlx` can print a line of its own
 * ahead of the CLI's output, so this reads from the first line that opens an
 * object rather than assuming stdout is only JSON.
 */
export function parseCatalog(cli: CliName, stdout: string): Set<string> {
  const start = stdout.startsWith("{") ? 0 : stdout.indexOf("\n{");
  if (start === -1) {
    throw new Error(`\`${cli} --help --json\` printed no JSON object.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.slice(start));
  } catch {
    throw new Error(
      `\`${cli} --help --json\` printed JSON that did not parse.`,
    );
  }

  const commands = (parsed as { commands?: unknown } | null)?.commands;
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error(`\`${cli} --help --json\` listed no commands.`);
  }

  const paths = new Set<string>();
  for (const command of commands) {
    const commandPath = (command as { path?: unknown } | null)?.path;
    if (typeof commandPath !== "string") {
      throw new Error(
        `\`${cli} --help --json\` listed a command with no path.`,
      );
    }
    paths.add(commandPath);
  }
  return paths;
}

/**
 * Every command path `cli` declares, space-joined (`"deploy smoke"`),
 * intermediate group paths included.
 *
 * @throws when the CLI cannot be run or does not describe itself.
 */
export async function loadCliCommands(
  repoRoot: string,
  cli: CliName,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReadonlySet<string>> {
  const [file, ...args] = commandFor(cli, env);
  if (file === undefined)
    throw new Error(`${OVERRIDE_VARIABLE[cli]} is empty.`);

  let stdout: string;
  try {
    ({ stdout } = await run(file, [...args, "--help", "--json"], {
      cwd: repoRoot,
      env,
      timeout: TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : "";
    throw new Error(
      `Could not run \`${[file, ...args].join(" ")} --help --json\` to list ${cli}'s ` +
        `commands (${reason}). The docs are checked against that list, so the build ` +
        `cannot continue without it. To check against a build that is not ` +
        `published yet, set ${OVERRIDE_VARIABLE[cli]} to the command that runs it.`,
    );
  }

  return parseCatalog(cli, stdout);
}
