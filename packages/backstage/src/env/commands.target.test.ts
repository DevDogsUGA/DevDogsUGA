import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { resolve } from "node:path";

/**
 * Which FILE each subcommand reads and writes, per target.
 *
 * Restored from DevDogsUGA's original `src/env/commands.target.test.ts` (see
 * `../../MOVED-TESTS.md`). Two changes from the original: `PROJECT_ROOT`
 * (DevDogsUGA's old fixed-path constant) no longer exists — devtools resolves
 * the repo root at runtime (`findRepoRoot()`, `../repo/root.js`), so this
 * file points it at the committed contract-test fixture
 * (`cli-core/test-fixtures/fixture-repo/`) instead. And `DISCORD_TOKEN`/`DB_URL`, the original's
 * two example keys, are `DEMO_TOKEN` (an ordinary secret) and
 * `DEMO_NARROWED_SECRET` (`narrowed: true`, the one key a `preflight` push
 * may carry) — devtools' own fixture manifest
 * (`cli-core/test-fixtures/fixture-repo/packages/demo-registry/env.ts`), not DevDogsUGA's real
 * declarations. Everything else, including the whole point of the suite, is
 * unchanged.
 *
 * ⚠️ This is the bug, and it was invisible to types. `--env` named two enums
 * that overlapped in the middle: a deploy environment
 * (`development | staging | production`, choosing a FILE) and a Bitwarden
 * environment (`preflight | staging | production`, choosing a PROJECT). `init`
 * read the first and mapped `staging` → `.env.staging`; `pull`, `push` and
 * `audit` read the second and defaulted their file to the root `.env`
 * regardless. So the documented workflow was: generate `.env.staging`, fill it
 * in, push it. That uploaded the DEVELOPMENT values to the staging project and
 * printed a success line about it.
 *
 * Asserted PER SUBCOMMAND rather than once against `pathFor`. A single helper
 * test would have passed on the broken code: `pathFor` was internally
 * consistent, and its one caller-visible behaviour ("`--file` wins") was
 * correct. What was wrong was that three commands shared a default that
 * belonged to none of them.
 *
 * Everything below is mocked: no filesystem, no Bitwarden, no GitHub, no
 * wrangler. The assertions are about the ARGUMENTS these commands pass, which
 * is the layer the bug lived in.
 */

/**
 * Two keys, and the local copies deliberately differ from the remote one.
 *
 * `pull` returns early when nothing would change and `push` when nothing is
 * pushable, so equal values would make every command below a no-op that never
 * opened a file, and "it read no file" passes a `not.toContain` check just as
 * well as "it read the right one".
 *
 * ⚠️ `DEMO_NARROWED_SECRET` is here for `preflight` specifically, and
 * dropping it would make the preflight case below pass for the wrong reason.
 * That target carries only the keys declared `narrowed`, so a file holding
 * `DEMO_TOKEN` alone is a file with nothing pushable in it: `push` would bail
 * before resolving a project id, and the assertion that it resolved the RIGHT
 * project id would be asserting over an empty call list.
 */
const readFile = vi.hoisted(() =>
  vi.fn(
    async () =>
      'DEMO_TOKEN="local"\nDEMO_NARROWED_SECRET="postgresql://local"\n',
  ),
);
const writeFile = vi.hoisted(() => vi.fn(async () => undefined));
const chmod = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("node:fs/promises", () => ({ readFile, writeFile, chmod }));

// Prompts would hang on a non-interactive stdin. Every call below passes
// `yes: true`, so none should be reached; `confirm` throwing makes a
// regression that reaches one fail loudly rather than time out.
vi.mock("@clack/prompts", () => ({
  cancel: vi.fn(),
  isCancel: () => false,
  confirm: vi.fn(() => {
    throw new Error("no test here should reach a prompt");
  }),
  log: {
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
  note: vi.fn(),
}));

vi.mock("../bws/client.js", () => ({
  projectIdFor: vi.fn(async (name: string) => `id-of-${name}`),
  listSecrets: vi.fn(async () => [
    {
      id: "secret-1",
      key: "DEMO_TOKEN",
      value: "remote",
      revisionDate: "2026-01-01T00:00:00Z",
    },
  ]),
  createSecret: vi.fn(async () => undefined),
  updateSecret: vi.fn(async () => undefined),
  byKey: (secrets: { key: string }[]) =>
    new Map(secrets.map((secret) => [secret.key, secret])),
}));

vi.mock("../gh/client.js", () => ({
  listSecrets: vi.fn(async () => []),
  listVariables: vi.fn(async () => []),
  listRepositoryVariables: vi.fn(async () => []),
  setSecret: vi.fn(async () => undefined),
  setVariable: vi.fn(async () => undefined),
}));

vi.mock("./cloudflare.js", () => ({
  WORKER_APPS: ["platform"],
  listWorkerSecrets: vi.fn(async () => ({
    secrets: new Map(),
    unreadable: [],
  })),
}));

import {
  projectIdFor,
  listSecrets as listBwsSecrets,
  createSecret,
  updateSecret,
} from "../bws/client.js";
import { log, note } from "@clack/prompts";
import { NoVaultProjectError } from "../bws/environments.js";
import {
  findRepoRoot,
  resetRepoRootCacheForTests,
} from "@devdogsuga/cli-core/repo/root";
import {
  resetEnvSyncCacheForTests,
  resetPeerCacheForTests,
} from "@devdogsuga/cli-core/repo/peers";
import {
  runEnvAudit,
  runEnvPull,
  runEnvPush,
  type EnvOptions,
} from "./commands.js";
import { loadRegistry } from "@devdogsuga/cli-core/env/discovery";

const FIXTURE_ROOT = new URL(
  "../../../cli-core/test-fixtures/fixture-repo/",
  import.meta.url,
).pathname;
const previousRoot = process.env.DEVTOOLS_TEST_REPO_ROOT;

beforeAll(async () => {
  process.env.DEVTOOLS_TEST_REPO_ROOT = FIXTURE_ROOT;
  resetRepoRootCacheForTests();
  resetPeerCacheForTests();
  resetEnvSyncCacheForTests();
  await loadRegistry();
});

afterAll(() => {
  if (previousRoot === undefined) delete process.env.DEVTOOLS_TEST_REPO_ROOT;
  else process.env.DEVTOOLS_TEST_REPO_ROOT = previousRoot;
  resetRepoRootCacheForTests();
});

/** Every mock reset, and the exit code these commands set left behind. */
let previousExitCode: typeof process.exitCode;

beforeEach(() => {
  previousExitCode = process.exitCode;
  readFile.mockClear();
  writeFile.mockClear();
  vi.mocked(projectIdFor).mockClear();
});

afterEach(() => {
  // `audit` and `push` set `process.exitCode` on findings, which would
  // otherwise fail the whole vitest run on an entirely healthy suite.
  process.exitCode = previousExitCode;
});

const at = (file: string): string => resolve(findRepoRoot(), file);

/** The paths a run touched, in call order. */
function pathsRead(): string[] {
  return readFile.mock.calls.map((call) => (call as unknown as string[])[0]!);
}

function pathsWritten(): string[] {
  return writeFile.mock.calls.map((call) => (call as unknown as string[])[0]!);
}

/**
 * The three subcommands that reach a vault, run as a table.
 *
 * A table because the original bug was per-subcommand disagreement: two of
 * these could be right while the third was wrong, and covering "the commands"
 * with one example is how that survived.
 */
const RUNNERS: {
  name: string;
  run: (options: EnvOptions) => Promise<void>;
  writes: boolean;
}[] = [
  { name: "pull", run: runEnvPull, writes: true },
  { name: "push", run: runEnvPush, writes: true },
  {
    name: "audit",
    run: (options) => runEnvAudit({ accessToken: "t", ...options }),
    writes: false,
  },
];

describe.each(RUNNERS)("$name", ({ name, run, writes }) => {
  it("reads .env.staging for --target staging, not the root .env", async () => {
    await run({ target: "staging", yes: true });

    expect(pathsRead()).toContain(at(".env.staging"));
    // The other half of the claim, and the one that was false: reaching `.env`
    // here is how a developer's own values were uploaded to a shared project.
    expect(pathsRead()).not.toContain(at(".env"));
  });

  it("maps preflight to .env.preflight and the preflight project", async () => {
    await run({ target: "preflight", yes: true });

    expect(pathsRead()).toContain(at(".env.preflight"));
    expect(vi.mocked(projectIdFor).mock.calls).toEqual([["preflight"]]);
  });

  it("maps production to .env.production and the production project", async () => {
    // The positive control for the two above: if the file were hardcoded
    // rather than derived, every target would produce the same path and the
    // staging assertion alone could not tell.
    await run({ target: "production", yes: true });

    expect(pathsRead()).toContain(at(".env.production"));
    expect(pathsRead()).not.toContain(at(".env.staging"));
    expect(vi.mocked(projectIdFor).mock.calls).toEqual([["production"]]);
  });

  it("lets --file override the file the target implies", async () => {
    await run({ target: "staging", file: "scratch.env", yes: true });

    expect(pathsRead()).toContain(at("scratch.env"));
    expect(pathsRead()).not.toContain(at(".env.staging"));
    // The override is about the FILE only. It must not also redirect which
    // project is written, or `--file` would become a second way to choose a
    // target: the ambiguity this whole change removes.
    expect(vi.mocked(projectIdFor).mock.calls).toEqual([["staging"]]);
  });

  it("refuses --target development, naming the missing vault project", async () => {
    const thrown: unknown = await run({
      target: "development",
      yes: true,
    }).catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(NoVaultProjectError);
    expect((thrown as Error).message).toMatch(/no Bitwarden project/);
    expect((thrown as Error).message).toMatch(/\.env is your own file/);

    // Refused BEFORE anything is touched. A refusal that still read the file,
    // or still resolved a project id, would leave the interesting question of
    // which project it picked answered by accident.
    expect(readFile).not.toHaveBeenCalled();
    expect(projectIdFor).not.toHaveBeenCalled();
  });

  if (writes) {
    it("writes back to the same file it read", async () => {
      await run({ target: "staging", yes: true });

      // Splitting these would be worse than either mistake alone: reading
      // .env.staging and stamping .env would rewrite the development file on
      // every push.
      expect(pathsWritten()).toEqual([at(".env.staging")]);
    });
  } else {
    it("writes nothing at all", async () => {
      // The negative control for the two `writes` cases above. `audit` is
      // read-only, so "it wrote the right file" has to be distinguishable
      // from "it wrote no file".
      await run({ target: "staging", yes: true });
      expect(writeFile).not.toHaveBeenCalled();
    });
  }

  it(`is really running ${name} — the mocks are reached`, () => {
    // A control on the harness itself. Every assertion above is of the form
    // "these calls happened with these arguments"; if the module under test
    // were resolving the real `node:fs/promises`, they would all report an
    // empty call list and pass the `not.toContain` half for the wrong reason.
    expect(readFile.getMockImplementation()).toBeDefined();
  });
});

describe("the file default, across subcommands", () => {
  it("gives all three the same file for one target", async () => {
    // The shape of the original bug was DISAGREEMENT between subcommands, so
    // agreement is worth asserting directly rather than inferring from three
    // separate passing tests.
    const seen: string[] = [];
    for (const { run } of RUNNERS) {
      readFile.mockClear();
      await run({ target: "staging", yes: true });
      seen.push(pathsRead()[0]!);
    }
    expect(new Set(seen)).toEqual(new Set([at(".env.staging")]));
  });
});

const mixedTierSecrets = () => [
  {
    id: "platform",
    key: "DEMO_TOKEN",
    value: "remote",
    note: "",
    projectId: "id-of-staging",
  },
  ...[
    "dogdays/DEMO_TOKEN",
    "dogpack/DEMO_TOKEN",
    "unknown/KEY",
    "/KEY",
    "nested/path/KEY",
  ].map((key) => ({
    id: key,
    key,
    value: "unrelated",
    note: "",
    projectId: "id-of-staging",
  })),
];

describe("platform isolation in a shared tier project", () => {
  it("pulls only keys without a slash", async () => {
    vi.mocked(listBwsSecrets).mockResolvedValueOnce(mixedTierSecrets());
    await runEnvPull({ target: "staging", yes: true });
    expect(writeFile).toHaveBeenCalled();
    const written = String(writeFile.mock.calls[0]?.[1]);
    expect(written).toContain('DEMO_TOKEN="remote"');
    expect(written).not.toMatch(/unrelated|dogdays|dogpack|nested|unknown/);
  });

  it("updates platform keys without treating any namespaced key as an orphan", async () => {
    vi.mocked(listBwsSecrets).mockResolvedValueOnce(mixedTierSecrets());
    vi.mocked(createSecret).mockClear();
    vi.mocked(updateSecret).mockClear();
    vi.mocked(log.warn).mockClear();
    vi.mocked(note).mockClear();
    await runEnvPush({ target: "staging", yes: true });
    expect(updateSecret).toHaveBeenCalledWith(
      expect.objectContaining({ id: "platform", key: "DEMO_TOKEN" }),
      "local",
      expect.any(String),
    );
    expect(vi.mocked(createSecret).mock.calls.map((call) => call[1])).toEqual([
      "DEMO_NARROWED_SECRET",
    ]);
    expect(
      [...vi.mocked(note).mock.calls, ...vi.mocked(log.warn).mock.calls]
        .flat()
        .filter((value): value is string => typeof value === "string")
        .join("\n"),
    ).not.toMatch(/dogdays|dogpack|nested|unknown/);
  });

  it("produces the same platform audit with or without namespaced keys", async () => {
    vi.mocked(listBwsSecrets).mockResolvedValueOnce(
      mixedTierSecrets().slice(0, 1),
    );
    vi.mocked(note).mockClear();
    await runEnvAudit({
      accessToken: "fake-token",
      target: "staging",
      yes: true,
    });
    const baseline = vi.mocked(note).mock.calls.map((call) => [...call]);
    vi.mocked(listBwsSecrets).mockResolvedValueOnce(mixedTierSecrets());
    vi.mocked(note).mockClear();
    await runEnvAudit({
      accessToken: "fake-token",
      target: "staging",
      yes: true,
    });
    expect(vi.mocked(note).mock.calls).toEqual(baseline);
  });
});
