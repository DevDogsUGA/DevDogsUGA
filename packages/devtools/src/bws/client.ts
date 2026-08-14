/**
 * A thin wrapper over the `bws` binary.
 *
 * The binary, and not the REST API, because Secrets Manager is end-to-end
 * encrypted: the server stores ciphertext, and the key that opens it is derived
 * from the access token by the client. A `fetch` against the API with a bearer
 * token returns encrypted blobs, so re-implementing this without the CLI means
 * re-implementing Bitwarden's crypto. That is not a trade worth making to avoid
 * one dependency.
 *
 * Everything spawns with an argv ARRAY and `shell: false`. That matters more
 * than usual here — `bws secret create` takes the value as a positional
 * argument, so a shell would put live credentials through word-splitting, glob
 * expansion and history.
 *
 * ⚠️ Even so, argv is visible to `ps` for the lifetime of the call. The CLI
 * offers no stdin form, so this is a property of the tool rather than of this
 * wrapper. It is acceptable on a maintainer's laptop and on an ephemeral
 * runner, and it is the reason `push` is not something to run on a shared box.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Max buffer for a project's worth of secrets. The default 1MB is thin. */
const MAX_BUFFER = 16 * 1024 * 1024;

export class BwsError extends Error {}

export interface BwsSecret {
  id: string;
  key: string;
  value: string;
  note: string;
  projectId: string;
  /**
   * ISO 8601, when this secret last changed.
   *
   * Optional because it is not needed to push or pull — but it is the whole
   * basis of the staleness half of `secrets audit`, which cannot compare values
   * (GitHub secrets are write-only) and instead asks whether GitHub was updated
   * after this.
   */
  revisionDate?: string;
}

interface BwsProject {
  id: string;
  name: string;
}

/**
 * The access token, from the environment only.
 *
 * Never a flag. `bws` accepts `--access-token`, and accepting one here would
 * put a token that unlocks an entire environment into shell history and `ps`
 * for every invocation, not just the ones that write a secret.
 */
export function accessToken(): string {
  const token = process.env.BWS_ACCESS_TOKEN;
  if (!token) {
    throw new BwsError(
      "BWS_ACCESS_TOKEN is not set. Export the machine account token for the " +
        "environment you are targeting.",
    );
  }
  return token;
}

async function bws(args: string[]): Promise<string> {
  try {
    const { stdout } = await run("bws", [...args, "--output", "json"], {
      env: { ...process.env, BWS_ACCESS_TOKEN: accessToken() },
      maxBuffer: MAX_BUFFER,
      shell: false,
    });
    return stdout;
  } catch (err) {
    throw new BwsError(describeSpawnFailure(err));
  }
}

/**
 * Turns a spawn failure into something with a next step in it.
 *
 * The two that actually happen are a missing binary and a token that does not
 * cover the project, and both are unrecognisable in raw form — ENOENT says
 * nothing about Bitwarden, and an authorisation failure surfaces as a bare
 * "404 Not Found" because a project you cannot see and a project that does not
 * exist are the same answer.
 */
function describeSpawnFailure(err: unknown): string {
  const e = err as { code?: string; stderr?: string; message?: string };

  if (e.code === "ENOENT") {
    return (
      "The `bws` CLI is not installed, or is not on PATH.\n" +
      "Install it from https://bitwarden.com/help/secrets-manager-cli/ " +
      "(or `cargo install bws`), then re-run."
    );
  }

  const stderr = (e.stderr ?? "").trim();
  if (/404|not found/i.test(stderr)) {
    return (
      `${stderr}\n\n` +
      "A 404 here usually means the access token is valid but its machine " +
      "account is not assigned to this project — Secrets Manager reports " +
      "'invisible' and 'absent' identically."
    );
  }
  if (/401|unauthorized|invalid/i.test(stderr)) {
    return `${stderr}\n\nThe access token was rejected. It may have been revoked or belong to another organization.`;
  }

  return stderr || e.message || "bws failed with no output.";
}

/** Resolves a project name to its id. Names are unique within an org. */
export async function projectIdFor(name: string): Promise<string> {
  const projects = JSON.parse(await bws(["project", "list"])) as BwsProject[];
  const match = projects.find((p) => p.name === name);

  if (!match) {
    const visible = projects.map((p) => p.name).sort();
    throw new BwsError(
      `No project named "${name}".\n` +
        (visible.length > 0
          ? `This token can see: ${visible.join(", ")}`
          : "This token can see no projects at all, which usually means the " +
            "machine account has no project assignments yet."),
    );
  }

  return match.id;
}

export async function listSecrets(projectId: string): Promise<BwsSecret[]> {
  const raw = await bws(["secret", "list", projectId]);
  // An empty project returns `[]`, but an older CLI returned an empty string.
  return raw.trim() === "" ? [] : (JSON.parse(raw) as BwsSecret[]);
}

export async function createSecret(
  projectId: string,
  key: string,
  value: string,
  note: string,
): Promise<void> {
  await bws(["secret", "create", key, value, projectId, "--note", note]);
}

export async function updateSecret(
  id: string,
  value: string,
  note: string,
): Promise<void> {
  await bws(["secret", "edit", id, "--value", value, "--note", note]);
}

export async function deleteSecrets(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await bws(["secret", "delete", ...ids]);
}

export function byKey(secrets: BwsSecret[]): Map<string, BwsSecret> {
  return new Map(secrets.map((s) => [s.key, s]));
}
