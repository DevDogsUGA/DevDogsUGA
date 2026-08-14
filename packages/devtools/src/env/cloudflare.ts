/**
 * Reading the secret NAMES set on each Worker.
 *
 * Cloudflare never returns a secret's value, so this contributes presence only.
 * That is still worth having: `wrangler deploy --secrets-file` **preserves what
 * it omits**, so a renamed or dropped variable leaves its secret on the Worker
 * indefinitely, and nothing else in the system can see it.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { PROJECT_ROOT } from "../instance.js";

const run = promisify(execFile);

/** The apps with a wrangler config, and therefore Worker secrets. */
export const WORKER_APPS = ["platform", "sandbox", "schedule-builder"] as const;

export class CloudflareError extends Error {}

interface WranglerSecret {
  name: string;
}

/**
 * Secret names per Worker for one environment.
 *
 * Failures are returned as an empty set for that Worker rather than thrown, and
 * the caller is told which ones could not be read. A Worker that has never been
 * deployed is the common case during setup, and it must not stop the audit from
 * reporting everything it CAN see — an audit that refuses to run is an audit
 * nobody runs.
 */
export async function listWorkerSecrets(
  environment: string,
): Promise<{ secrets: Map<string, Set<string>>; unreadable: string[] }> {
  const secrets = new Map<string, Set<string>>();
  const unreadable: string[] = [];

  for (const app of WORKER_APPS) {
    const worker = `${environment}-${app}`;
    try {
      const { stdout } = await run(
        "pnpm",
        [
          "exec",
          "wrangler",
          "secret",
          "list",
          "--env",
          environment,
          "--format",
          "json",
        ],
        { cwd: join(PROJECT_ROOT, "apps", app), shell: false },
      );

      // wrangler prints its banner on stdout too, so take the JSON array only.
      const start = stdout.indexOf("[");
      const parsed =
        start === -1
          ? []
          : (JSON.parse(stdout.slice(start)) as WranglerSecret[]);

      secrets.set(worker, new Set(parsed.map((s) => s.name)));
    } catch {
      unreadable.push(worker);
    }
  }

  return { secrets, unreadable };
}
