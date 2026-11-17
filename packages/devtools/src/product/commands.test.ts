import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DONE } from "@devdogsuga/cli-core/dispatch";
import {
  createProductHandlers,
  defaultDeps,
  regenerateAfterSync,
} from "./commands.js";
import { CLI, makeProduct, recordingRunner, writeFiles } from "./fixtures.js";
import type { DbTarget } from "./target.js";

const LOCAL: DbTarget = {
  kind: "local",
  apiUrl: "http://127.0.0.1:54321",
  dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  publishableKey: "p",
  secretKey: "sb_secret_s",
};

const APPLIED = {
  migration: "20261011_devtools_sync.sql",
  applied: true,
  destructive: [],
};
const MATCHED = { migration: null, applied: false, destructive: [] };

describe("regenerateAfterSync (Q82: db sync regenerates the types)", () => {
  it("regenerates after a sync that changed the database", async () => {
    const product = makeProduct();
    const { run, calls } = recordingRunner(() => ({ stdout: "export {};\n" }));
    await regenerateAfterSync(product, CLI, LOCAL, APPLIED, { run });
    expect(calls).toHaveLength(1);
    expect(
      readFileSync(join(product.root, "lib/database.types.ts"), "utf8"),
    ).toContain("export {};");
  });

  it("regenerates when nothing changed but the types are missing or stale", async () => {
    const product = makeProduct();
    const { run, calls } = recordingRunner(() => ({ stdout: "x" }));
    await regenerateAfterSync(product, CLI, LOCAL, MATCHED, { run });
    expect(calls).toHaveLength(1);
    // Current now: a second no-op sync leaves them alone.
    await regenerateAfterSync(product, CLI, LOCAL, MATCHED, { run });
    expect(calls).toHaveLength(1);
    // The schema moves on without a sync (an edit pulled in by git).
    writeFiles(product.root, {
      "supabase/schemas/dogpack/tables/new.sql": "create table dogpack.n ();\n",
    });
    await regenerateAfterSync(product, CLI, LOCAL, MATCHED, { run });
    expect(calls).toHaveLength(2);
  });

  it("writes nothing on a dry run", async () => {
    const product = makeProduct();
    const { run, calls } = recordingRunner();
    await regenerateAfterSync(product, CLI, null, APPLIED, { run });
    expect(calls).toHaveLength(0);
    expect(existsSync(join(product.root, "lib/database.types.ts"))).toBe(false);
  });

  it("warns instead of failing when the generator does, because the sync worked", async () => {
    const product = makeProduct();
    const { run } = recordingRunner(() => ({ code: 1, stderr: "boom" }));
    await expect(
      regenerateAfterSync(product, CLI, LOCAL, APPLIED, { run }),
    ).resolves.toBeUndefined();
  });
});

describe("product doctor Flutter check", () => {
  it.each(["3.50.0", "3.47.5", "3.51.0", null])(
    "reports %s without failing",
    async (version) => {
      const product = makeProduct({
        files: { "pubspec.yaml": 'environment:\n  flutter: ">=3.50.0"\n' },
      });
      const previous = process.cwd();
      const { run, calls } = recordingRunner(({ command }) => {
        if (command === "flutter")
          return version === null
            ? { code: 1 }
            : { stdout: JSON.stringify({ frameworkVersion: version }) };
        return { stdout: "2.117.0" };
      });
      try {
        process.chdir(product.root);
        const handler = createProductHandlers({ ...defaultDeps, run });
        await expect(handler.doctor!([])).resolves.toBe(DONE);
        expect(calls.find((c) => c.command === "flutter")?.args).toEqual([
          "--version",
          "--machine",
        ]);
      } finally {
        process.chdir(previous);
        rmSync(product.root, { recursive: true, force: true });
      }
    },
  );
});
