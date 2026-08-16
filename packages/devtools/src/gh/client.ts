/**
 * A thin wrapper over the `gh` CLI, for environment secrets and variables.
 *
 * `gh` rather than the REST API for the same reason `bws` is used over its API:
 * a secret's value has to be encrypted client-side with a libsodium sealed box
 * against the environment's public key before it can be sent. `gh` does that
 * locally. Doing it by hand means fetching the key, pulling in a sodium
 * binding, and owning that code forever to avoid one dependency that is already
 * installed.
 *
 * ## Secrets and variables are two different stores
 *
 * They share an environment and nothing else, and the differences are the whole
 * reason the public per-environment values go to the second:
 *
 *   |            | Sent as    | Readable back | In logs        |
 *   |------------|------------|---------------|----------------|
 *   | secret     | sealed box | never         | masked, by substring |
 *   | variable   | plaintext  | value and all | verbatim       |
 *
 * The masking is not a nicety either way. `PROJECT_REF` as a *secret* rewrites
 * `https://supabase.com/dashboard/project/<ref>` to `.../***` — the paused-
 * project gate's whole output — and, because the ref is a substring of every
 * Supabase hostname, corrupts unrelated log lines across the repo. The
 * readability is what lets `secrets audit` compare a variable by VALUE, which
 * it cannot do for anything on the top row.
 *
 * ⚠️ The corollary, and the reason each setter is its own function rather than
 * one with a flag: putting a secret in the variable store publishes its value
 * to anyone with read access to the repository's Actions config, silently and
 * irreversibly. There is no operation here that can be pointed at the wrong
 * store by a boolean somebody passed the wrong way round.
 */
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const run = promisify(execFile);

const MAX_BUFFER = 16 * 1024 * 1024;

export class GhError extends Error {}

export interface GhSecret {
  name: string;
  updatedAt: string;
}

/** Unlike `GhSecret`, this carries the value: variables are readable. */
export interface GhVariable {
  name: string;
  value: string;
  updatedAt: string;
}

/**
 * Turns a spawn failure into something with a next step in it.
 *
 * The three that happen are a missing binary, an unauthenticated CLI, and an
 * environment that does not exist yet — the last of which reports as a bare
 * 404, because an environment you cannot see and one that was never created
 * look identical from here.
 */
function describe(err: unknown): string {
  const e = err as { code?: string; stderr?: string; message?: string };

  if (e.code === "ENOENT") {
    return (
      "The `gh` CLI is not installed, or is not on PATH.\n" +
      "Install it from https://cli.github.com, then run `gh auth login`."
    );
  }

  const stderr = (e.stderr ?? "").trim();

  if (/not logged into|authentication required|gh auth login/i.test(stderr)) {
    return `${stderr}\n\nRun \`gh auth login\`. Managing environment secrets needs the \`repo\` scope.`;
  }
  if (/404|not found/i.test(stderr)) {
    return (
      `${stderr}\n\n` +
      "A 404 usually means the environment does not exist yet — GitHub creates " +
      "environments explicitly, and a typo silently addresses a different one. " +
      "Check Settings → Environments."
    );
  }
  if (/403|forbidden|must have admin/i.test(stderr)) {
    return `${stderr}\n\nSetting environment secrets needs admin on the repository.`;
  }

  return stderr || e.message || "gh failed with no output.";
}

/** Environment secret names and when each last changed. Never values. */
export async function listSecrets(environment: string): Promise<GhSecret[]> {
  try {
    const { stdout } = await run(
      "gh",
      ["secret", "list", "--env", environment, "--json", "name,updatedAt"],
      { maxBuffer: MAX_BUFFER, shell: false },
    );
    return stdout.trim() === "" ? [] : (JSON.parse(stdout) as GhSecret[]);
  } catch (err) {
    throw new GhError(describe(err));
  }
}

/**
 * Sets one secret, passing the value on **stdin**.
 *
 * Not `--body`, which would put a live credential in argv where `ps` can read
 * it. Not `--env-file` either, despite it being one call for the whole set:
 * that hands the file to `gh`'s own dotenv parser, and this tool has already
 * parsed it with different rules. Two parsers over one file agree right up
 * until a multi-line value — a PEM private key is the case — and then disagree
 * silently, storing something that looks like a key and is not.
 *
 * One process per secret is the cost. It is paid once per rotation.
 */
export async function setSecret(
  environment: string,
  name: string,
  value: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("gh", ["secret", "set", name, "--env", environment], {
      stdio: ["pipe", "ignore", "pipe"],
      shell: false,
    });

    let stderr = "";
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", (err) => reject(new GhError(describe(err))));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new GhError(describe({ stderr, message: `gh exited ${code}` })),
          ),
    );

    // Exactly the bytes, with no trailing newline: `gh` stores stdin verbatim,
    // so a stray "\n" becomes part of the secret and every comparison against
    // it fails in a way that reads like a wrong value rather than a stray byte.
    child.stdin.end(value);
  });
}

export async function deleteSecret(
  environment: string,
  name: string,
): Promise<void> {
  try {
    await run("gh", ["secret", "delete", name, "--env", environment], {
      shell: false,
    });
  } catch (err) {
    throw new GhError(describe(err));
  }
}

// ── variables ────────────────────────────────────────────────────────────────

/**
 * Environment variable names, VALUES, and when each last changed.
 *
 * The value is the point. It is what turns the GitHub half of `secrets audit`
 * from a presence check into a real comparison for these keys — a variable
 * whose value drifted from Bitwarden is detectable, where the same drift in a
 * secret is not detectable by anything.
 */
export async function listVariables(
  environment: string,
): Promise<GhVariable[]> {
  try {
    const { stdout } = await run(
      "gh",
      [
        "variable",
        "list",
        "--env",
        environment,
        "--json",
        "name,value,updatedAt",
      ],
      { maxBuffer: MAX_BUFFER, shell: false },
    );
    return stdout.trim() === "" ? [] : (JSON.parse(stdout) as GhVariable[]);
  } catch (err) {
    throw new GhError(describe(err));
  }
}

/**
 * Sets one variable, passing the value on **stdin**.
 *
 * Stdin rather than `--body` even though a variable is public by definition:
 * argv is shared machinery, and a rule with an exception ("stdin for secrets,
 * argv for variables") is a rule somebody applies to the wrong call. The
 * `--env-file` form is refused for the reason `setSecret` refuses it — it would
 * hand the file to `gh`'s own dotenv parser, which agrees with this tool's
 * parser right up until a multi-line value and then disagrees silently.
 */
export async function setVariable(
  environment: string,
  name: string,
  value: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("gh", ["variable", "set", name, "--env", environment], {
      stdio: ["pipe", "ignore", "pipe"],
      shell: false,
    });

    let stderr = "";
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", (err) => reject(new GhError(describe(err))));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new GhError(describe({ stderr, message: `gh exited ${code}` })),
          ),
    );

    // No trailing newline, for a reason that bites harder here than it does for
    // a secret: the stored value IS readable, so a stray "\n" turns every
    // `audit` run into a value-drift error against a Bitwarden copy that is
    // actually identical, and no amount of re-pushing fixes it.
    child.stdin.end(value);
  });
}

export async function deleteVariable(
  environment: string,
  name: string,
): Promise<void> {
  try {
    await run("gh", ["variable", "delete", name, "--env", environment], {
      shell: false,
    });
  } catch (err) {
    throw new GhError(describe(err));
  }
}
