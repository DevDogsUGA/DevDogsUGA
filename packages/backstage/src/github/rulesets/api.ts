/**
 * `gh api` calls this reconciler needs: listing and reading rulesets, and
 * writing them (create/update/delete).
 *
 * `gh`, not Octokit — backstage has no Octokit dependency, and every other
 * GitHub call in this package (`../client.ts`) already goes through the
 * `gh` CLI for the same reason `bws` goes through its own CLI: `gh` already
 * owns authentication (a contributor's `gh auth login`, or `GH_TOKEN` in
 * CI), and re-deriving that here would mean a second credential path to
 * keep in step with the first.
 *
 * Reads (`listRulesets`, `getRuleset`) run unauthenticated-safe GETs and are
 * always allowed. Writes (`createRuleset`, `updateRuleset`, `deleteRuleset`)
 * need `admin` on the repository — the same requirement `gh api
 * .../rulesets -X POST` has always had — and `commands.ts` is the only
 * caller that reaches them, gated behind `--apply`.
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type {
  DesiredRuleset,
  LiveRuleset,
  LiveRulesetSummary,
} from "./types.js";

const run = promisify(execFile);
const MAX_BUFFER = 16 * 1024 * 1024;

export class GhRulesetsError extends Error {}

function describe(err: unknown): string {
  const e = err as { stdout?: string; stderr?: string; message?: string };
  const stderr = (e.stderr ?? "").trim();
  const message = e.message ?? "";
  const summary = stderr || message || "gh failed with no output.";
  // gh writes the API response to stdout even on a failed request. Only
  // retain diagnostic fields: never dump the response, request or headers.
  let response: unknown;
  try {
    response = JSON.parse(e.stdout ?? "");
  } catch {
    return summary;
  }
  if (!response || typeof response !== "object") return summary;
  const data = response as { message?: unknown; errors?: unknown };
  const clean = (value: unknown): string =>
    typeof value === "string"
      ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim()
      : "";
  const details: string[] = [];
  const responseMessage = clean(data.message);
  if (responseMessage && !summary.includes(responseMessage)) {
    details.push(responseMessage);
  }
  const errors = Array.isArray(data.errors) ? data.errors : [data.errors];
  for (const error of errors) {
    if (typeof error === "string") {
      const detail = clean(error);
      if (detail) details.push(detail);
    } else if (error && typeof error === "object") {
      const entry = error as {
        field?: unknown;
        code?: unknown;
        message?: unknown;
      };
      const detail = ["field", "code", "message"]
        .map((key) => {
          const value = clean(entry[key as keyof typeof entry]);
          return value ? `${key}: ${value}` : "";
        })
        .filter(Boolean)
        .join(", ");
      if (detail) details.push(detail);
    }
  }
  return [summary, ...details].join("\n");
}

/** `owner/repo`, e.g. `DevDogsUGA/DevDogsUGA`. */
export interface Repo {
  owner: string;
  repo: string;
}

function path(r: Repo, suffix = ""): string {
  return `repos/${r.owner}/${r.repo}/rulesets${suffix}`;
}

/** `GET /repos/{owner}/{repo}/rulesets` — id, name and target only. */
export async function listRulesets(r: Repo): Promise<LiveRulesetSummary[]> {
  try {
    const { stdout } = await run("gh", ["api", path(r), "--paginate"], {
      maxBuffer: MAX_BUFFER,
      shell: false,
    });
    return stdout.trim() === ""
      ? []
      : (JSON.parse(stdout) as LiveRulesetSummary[]);
  } catch (err) {
    throw new GhRulesetsError(describe(err));
  }
}

/**
 * `GET /repos/{owner}/{repo}/contents/{path}` on the default branch, decoded.
 * `null` when the file does not exist (404).
 */
export async function getFileContent(
  r: Repo,
  filePath: string,
): Promise<string | null> {
  try {
    const { stdout } = await run(
      "gh",
      ["api", `repos/${r.owner}/${r.repo}/contents/${filePath}`],
      { maxBuffer: MAX_BUFFER, shell: false },
    );
    const data = JSON.parse(stdout) as { content?: string; encoding?: string };
    if (typeof data.content !== "string") return null;
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch (err) {
    if (/\b404\b|Not Found/.test(describe(err))) return null;
    throw new GhRulesetsError(describe(err));
  }
}

/** `GET /repos/{owner}/{repo}/rulesets/{id}` — the full ruleset. */
export async function getRuleset(r: Repo, id: number): Promise<LiveRuleset> {
  try {
    const { stdout } = await run("gh", ["api", path(r, `/${id}`)], {
      maxBuffer: MAX_BUFFER,
      shell: false,
    });
    return JSON.parse(stdout) as LiveRuleset;
  } catch (err) {
    throw new GhRulesetsError(describe(err));
  }
}

/**
 * Runs `gh api <path> -X <method> --input -`, writing `body` on stdin (JSON)
 * and returning the parsed JSON response.
 *
 * stdin, not `-f`/`-F` field flags: this reconciler always sends the WHOLE
 * ruleset payload as one JSON document (the shape `desired.ts` already
 * builds), and `gh api`'s field flags exist for building that document one
 * key at a time from shell arguments — a worse fit than handing over the
 * object this code already has. Not `-X POST --input path` via a temp file
 * either: stdin needs no cleanup and cannot be left behind by a crash.
 */
async function writeJson(
  method: "POST" | "PUT" | "DELETE",
  apiPath: string,
  body: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", ["api", apiPath, "-X", method, "--input", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", (err) => reject(new GhRulesetsError(describe(err))));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new GhRulesetsError(describe({ stdout, stderr })));
        return;
      }
      const trimmed = stdout.trim();
      resolve(trimmed === "" ? {} : JSON.parse(trimmed));
    });

    child.stdin.end(JSON.stringify(body));
  });
}

export async function createRuleset(
  r: Repo,
  desired: DesiredRuleset,
): Promise<LiveRuleset> {
  return writeJson("POST", path(r), desired) as Promise<LiveRuleset>;
}

export async function updateRuleset(
  r: Repo,
  id: number,
  desired: DesiredRuleset,
): Promise<LiveRuleset> {
  // PUT, not PATCH: GitHub's rulesets API has no PATCH route and answers one
  // with a 404, which reads like a missing ruleset rather than a wrong verb.
  return writeJson("PUT", path(r, `/${id}`), desired) as Promise<LiveRuleset>;
}

export async function deleteRuleset(r: Repo, id: number): Promise<void> {
  await writeJson("DELETE", path(r, `/${id}`), {});
}
