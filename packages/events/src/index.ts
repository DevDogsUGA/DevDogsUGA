import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clubConfigSchema, type ClubConfig } from "./schema.js";
import { validateClubConfig, type ValidationIssue } from "./validator.js";

export * from "./schema.js";
export * from "./validator.js";

/**
 * The one data file today. Read by path rather than a static `import … with
 * { type: "json" }`, so both this package's `src` (the `devdogs-source`
 * export condition) and its built `dist` resolve the SAME file on disk
 * without two copies to keep in sync -- `data/` sits one level up from both.
 *
 * Kept a plain constant rather than exported: a consumer wanting the raw path
 * has no legitimate reason to bypass `getClubConfig`'s validation.
 */
const DATA_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "meetings.json",
);

export class ClubConfigError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(
      `${issues.length} events ${issues.length === 1 ? "issue" : "issues"} found:\n` +
        issues
          .map((issue) => `  [${issue.id}] ${issue.code}: ${issue.message}`)
          .join("\n"),
    );
    this.name = "ClubConfigError";
  }
}

/**
 * Parses and validates the committed data file, throwing a readable
 * `ClubConfigError` if either step fails.
 *
 * This is the ONE function most callers want. `check.ts` (the CI gate) and
 * `server/config/reconcile.ts` (the platform's runtime reader) both go
 * through it, so a config that is broken in either dimension -- wrong shape,
 * or right shape but unpublishable -- is refused identically wherever it is
 * read, rather than reconcile trusting a file CI would have rejected.
 */
export function getClubConfig(): ClubConfig {
  const raw: unknown = JSON.parse(readFileSync(DATA_FILE, "utf8"));
  return parseClubConfig(raw);
}

/** The same two-step validation `getClubConfig` runs, over an in-memory
 * value rather than the committed file -- what `check.ts` and this
 * package's own tests use to exercise malformed input. */
export function parseClubConfig(raw: unknown): ClubConfig {
  const parsed = clubConfigSchema.parse(raw);
  const issues = validateClubConfig(parsed);
  if (issues.length > 0) throw new ClubConfigError(issues);
  return parsed;
}
