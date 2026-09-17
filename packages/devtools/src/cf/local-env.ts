import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { declarations } from "@devdogsuga/env";
import { loadRegistry } from "../env/discovery.js";

export interface TemporaryWranglerEnv {
  path: string;
  remove: () => void;
}

export function renderWranglerEnvFile(
  keys: readonly string[],
  environment: NodeJS.ProcessEnv,
): string {
  return (
    keys
      .flatMap((key) => {
        const value = environment[key];
        // dotenv preserves single-quoted values byte-for-byte, including
        // multiline private keys and literal backslash sequences.
        return value === undefined ? [] : [`${key}='${value}'`];
      })
      .join("\n") + "\n"
  );
}

/** Create an app-scoped, mode-0600 env file for a local Worker runtime. */
export async function createTemporaryWranglerEnv(
  app: string,
): Promise<TemporaryWranglerEnv> {
  await loadRegistry();
  const keys = [
    ...new Set(
      declarations()
        .filter((entry) => entry.source === app)
        .map((entry) => entry.key),
    ),
  ].sort();
  const directory = mkdtempSync(join(tmpdir(), "devtools-wrangler-env-"));
  const path = join(directory, ".dev.vars");
  writeFileSync(path, renderWranglerEnvFile(keys, process.env), {
    encoding: "utf8",
    mode: 0o600,
  });
  return {
    path,
    remove: () => rmSync(directory, { recursive: true, force: true }),
  };
}
