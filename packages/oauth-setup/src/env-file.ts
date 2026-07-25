import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Writes `values` into `.env.local` in `cwd`, updating any existing
 * `KEY=...` lines in place and appending keys that aren't present yet.
 * Leaves all other lines (comments, unrelated vars) untouched.
 */
export function upsertEnvLocal(
  cwd: string,
  values: Record<string, string>,
): void {
  const path = join(cwd, ".env.local");
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const lines = existing.length > 0 ? existing.split("\n") : [];

  const remaining = new Map(Object.entries(values));

  const updated = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (!match) return line;

    // The regex has exactly one capture group, so a match always fills it;
    // noUncheckedIndexedAccess can't see that, hence the explicit guard.
    const key = match[1];
    if (key === undefined) return line;

    const value = remaining.get(key);
    if (value === undefined) return line;

    remaining.delete(key);
    return `${key}=${formatValue(value)}`;
  });

  for (const [key, value] of remaining) {
    updated.push(`${key}=${formatValue(value)}`);
  }

  writeFileSync(path, `${updated.join("\n").replace(/\n*$/, "")}\n`);
}

function formatValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
