/**
 * The Bitwarden **Password Manager** vault, via the `bw` CLI.
 *
 * A different product from Secrets Manager and a different CLI, which is the
 * whole point: `bws` has no user authentication at all, so the access token it
 * needs has to be held somewhere a person can log in to. That somewhere is the
 * Password Manager vault, and this module is how the tool reads it back rather
 * than making somebody paste a token every session.
 *
 * Everything here degrades to `undefined`. A missing `bw`, a locked vault, a
 * declined unlock, a missing item — none of them are errors, because each has a
 * perfectly good fallback (ask). Throwing would turn a convenience into a
 * prerequisite.
 *
 * ⚠️ The token never passes through argv in either direction. Reads use
 * `bw get password <search>`, which puts only the item NAME on the command
 * line, and writes pipe base64 JSON through **stdin**, which `bw create item`
 * documents as an accepted input.
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { confirm, log, spinner } from "@clack/prompts";
import { unwrap } from "../ui.js";

const run = promisify(execFile);

/**
 * The item this looks for, and creates.
 *
 * Named for what it unlocks rather than for this tool, because the person who
 * finds it in the vault six months from now needs to know what it is, not which
 * script wrote it.
 */
export const VAULT_ITEM_NAME = "DevDogs Secrets Manager access token (admin)";

export type VaultStatus =
  "unavailable" | "unauthenticated" | "locked" | "unlocked";

/** `bw status`, or `unavailable` when the CLI is not installed. */
export async function vaultStatus(): Promise<VaultStatus> {
  try {
    const { stdout } = await run("bw", bwArgs(["status", "--response"]), {
      shell: false,
    });
    // `--response` wraps the payload; the bare form is also accepted, so read
    // whichever shape came back rather than depending on one.
    const parsed = JSON.parse(stdout) as
      | { success?: boolean; data?: { template?: { status?: string } } }
      | { status?: string };
    const status =
      ("status" in parsed && parsed.status) ||
      ("data" in parsed && parsed.data?.template?.status) ||
      undefined;

    if (status === "unlocked") return "unlocked";
    if (status === "locked") return "locked";
    return "unauthenticated";
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return "unavailable";
    return "unauthenticated";
  }
}

/**
 * A usable session key, unlocking if the person agrees.
 *
 * `BW_SESSION` is preferred and silent. Otherwise this ASKS before unlocking:
 * a tool that pops a master-password prompt unannounced is shaped exactly like
 * the thing people are told never to type their master password into.
 *
 * The password is typed straight into `bw` — stdin is inherited, so it never
 * passes through this process.
 */
async function session(status: VaultStatus): Promise<string | undefined> {
  if (process.env.BW_SESSION) return process.env.BW_SESSION;
  if (status !== "locked") return undefined;
  if (!process.stdin.isTTY) return undefined;

  const ok = unwrap(
    await confirm({
      message:
        "Your Bitwarden vault is locked. Unlock it to look for the access token?",
      initialValue: true,
    }),
  );
  if (!ok) return undefined;

  return new Promise<string | undefined>((resolve) => {
    // stdin inherited so the master password goes to `bw` and not through here;
    // stdout piped so the session key can be captured rather than printed.
    const child = spawn("bw", ["unlock", "--raw"], {
      stdio: ["inherit", "pipe", "inherit"],
      shell: false,
    });
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    child.on("error", () => resolve(undefined));
    child.on("close", (code) =>
      resolve(code === 0 && out.trim() !== "" ? out.trim() : undefined),
    );
  });
}

/**
 * Adds the session key, and `--nointeraction` always.
 *
 * The second one is not belt-and-braces. `bw` prompts for a master password on
 * stdin whenever the vault is locked — `bw get template item` against a locked
 * vault does it — and this module runs `bw` with piped stdio, where that prompt
 * has nobody to answer it and hangs until something gives up. `--nointeraction`
 * turns that into an immediate non-zero exit, which every caller here already
 * treats as "not available, ask instead".
 */
function bwArgs(args: string[], key?: string): string[] {
  const withNoInteraction = [...args, "--nointeraction"];
  return key ? [...withNoInteraction, "--session", key] : withNoInteraction;
}

/**
 * The stored token, or `undefined` for every reason it might not be there.
 *
 * `bw get password` takes a search term and fails when it matches more than one
 * item, which is the behaviour worth having: two items called something like
 * this means somebody should look, not that this should guess.
 */
export async function readTokenFromVault(): Promise<string | undefined> {
  const status = await vaultStatus();

  if (status === "unavailable" || status === "unauthenticated") {
    // Said out loud, and only here. By the time this runs the chain has already
    // found nothing in the flag or the environment, so the person is about to
    // be asked to paste a token — which is exactly when knowing the vault could
    // have answered instead is worth something.
    log.info(explainVault(status)!);
    return undefined;
  }

  const key = await session(status);
  if (status === "locked" && !key) return undefined;

  const s = spinner();
  s.start("Looking in your Bitwarden vault");
  try {
    const { stdout } = await run(
      "bw",
      bwArgs(["get", "password", VAULT_ITEM_NAME, "--raw"], key),
      { shell: false },
    );
    const token = stdout.trim();
    if (token === "") {
      s.stop("Nothing stored in the vault yet");
      return undefined;
    }
    s.stop(`Read the access token from your vault ("${VAULT_ITEM_NAME}")`);
    return token;
  } catch {
    // "not found" and "more than one match" both land here, and both mean the
    // same thing to the caller: ask instead.
    s.stop("No single matching item in your vault");
    return undefined;
  }
}

/**
 * Creates the item, with the token arriving on **stdin** as base64 JSON.
 *
 * `bw create item` documents an encoded-JSON positional AND stdin. Using stdin
 * is the difference between a live credential that is invisible and one that
 * sits in `ps` output for the length of the call.
 */
export async function saveTokenToVault(token: string): Promise<boolean> {
  const status = await vaultStatus();
  if (status === "unavailable" || status === "unauthenticated") return false;

  const key = await session(status);
  if (status === "locked" && !key) return false;

  const item = {
    organizationId: null,
    collectionIds: null,
    folderId: null,
    type: 1, // login — so `bw get password` can retrieve it in one call
    name: VAULT_ITEM_NAME,
    notes:
      "Bitwarden Secrets Manager access token for the `admin` machine account, " +
      "read/write on preflight, staging and production.\n\n" +
      "Read automatically by `pnpm devtools env`. Never put this in a .env " +
      "file: it unlocks all three projects, and the tool refuses to upload it.",
    favorite: false,
    reprompt: 0,
    login: { username: null, password: token, totp: null },
  };

  return new Promise<boolean>((resolve) => {
    const child = spawn("bw", bwArgs(["create", "item"], key), {
      stdio: ["pipe", "ignore", "pipe"],
      shell: false,
    });
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      if (code !== 0 && stderr.trim() !== "") log.warn(stderr.trim());
      resolve(code === 0);
    });
    child.stdin.end(Buffer.from(JSON.stringify(item)).toString("base64"));
  });
}

/** Why the vault could not be used, phrased as something to do about it. */
export function explainVault(status: VaultStatus): string | undefined {
  if (status === "unavailable") {
    return (
      "The `bw` CLI is not installed, so the vault could not be checked. " +
      "`pnpm bw login` — the CLI is a devtools dependency, nothing to install."
    );
  }
  if (status === "unauthenticated") {
    return "The `bw` CLI is not signed in. Run `bw login`.";
  }
  return undefined;
}
