import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * What `env audit` says about the REPOSITORY's own variables.
 *
 * `audit.ts` decides which collisions are findings and its own tests cover
 * that. This file covers the two things only the command can get wrong, and
 * both of them fail in the same direction — a report that looks clean:
 *
 *   * that it LOOKS at all. `gh variable list` with no `--env` is the one call
 *     in this system addressed at the repository rather than at an
 *     environment, and a wiring mistake makes it silently never happen.
 *   * that a run which could not look says so, and that a run which looked
 *     says THAT — the coverage sentence is a claim, and printing it
 *     unconditionally turns the one run that checked nothing into the one run
 *     that says it did.
 *
 * Everything remote is mocked: no filesystem, no Bitwarden, no `gh`, no
 * wrangler. Nothing here can tell you what GitHub does with these calls.
 */
const readFile = vi.hoisted(() => vi.fn(async () => ""));

vi.mock("node:fs/promises", () => ({ readFile, writeFile: vi.fn() }));

const prompts = vi.hoisted(() => ({
  log: {
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
  note: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  ...prompts,
  cancel: vi.fn(),
  isCancel: () => false,
  confirm: vi.fn(() => {
    throw new Error("audit is read-only and must never prompt");
  }),
}));

vi.mock("../bws/client.js", () => ({
  projectIdFor: vi.fn(async () => "project-id"),
  listSecrets: vi.fn(async () => []),
  createSecret: vi.fn(async () => undefined),
  updateSecret: vi.fn(async () => undefined),
  byKey: () => new Map(),
}));

vi.mock("../gh/client.js", () => ({
  // The real class, re-declared: the command's catch is what turns a thrown
  // `gh` failure into a "could not check" finding, so the tests below have to
  // throw the thing it actually catches.
  GhError: class GhError extends Error {},
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

import { listSecrets as listBwsSecrets } from "../bws/client.js";
import {
  GhError,
  listRepositoryVariables,
  listSecrets as listGhSecrets,
} from "../gh/client.js";
import { runEnvAudit } from "./commands.js";
import { loadRegistry } from "./discovery.js";

beforeAll(async () => {
  await loadRegistry();
});

let previousExitCode: typeof process.exitCode;

beforeEach(() => {
  previousExitCode = process.exitCode;
  vi.mocked(listRepositoryVariables).mockClear();
  vi.mocked(listRepositoryVariables).mockResolvedValue([]);
  prompts.note.mockClear();
  prompts.log.info.mockClear();
});

afterEach(() => {
  // `audit` sets it on any error-level finding, which would otherwise fail an
  // entirely healthy vitest run.
  process.exitCode = previousExitCode;
});

/** Everything the run printed, findings and coverage alike. */
function printed(): string {
  return [
    ...prompts.note.mock.calls.map((call) => String(call[0])),
    ...prompts.log.info.mock.calls.map((call) => String(call[0])),
  ].join("\n");
}

describe("env audit, at the repository scope", () => {
  it("looks at the repository's own variables", async () => {
    // ⚠️ The wiring assertion. Every claim below is about what the run SAID;
    // if the command never made this call, the clean-report test would pass
    // for the worst possible reason.
    await runEnvAudit({ target: "staging", yes: true });

    expect(listRepositoryVariables).toHaveBeenCalledTimes(1);
    // No arguments: the missing `--env` IS the call. A repository read that
    // quietly became an environment read would see the managed copies and
    // report the shadowing hazard as clean forever.
    expect(vi.mocked(listRepositoryVariables).mock.calls[0]).toEqual([]);
  });

  it("reports a collision it found, by name", async () => {
    // `AIRTABLE_BASE_ID` is the real case: users were told to set it by hand
    // at repository level before push started routing it.
    vi.mocked(listRepositoryVariables).mockResolvedValue([
      { name: "AIRTABLE_BASE_ID", updatedAt: "2026-01-01T00:00:00Z" },
    ]);

    await runEnvAudit({ target: "staging", yes: true });

    expect(printed()).toContain("AIRTABLE_BASE_ID");
    expect(printed()).toMatch(/shadows it/);
    expect(printed()).toContain("gh variable delete AIRTABLE_BASE_ID");
  });

  it("says the check RAN when it found nothing", async () => {
    // "No detectable drift" is a weaker claim than it reads as, and this is
    // the sentence that keeps it honest about which checks stand behind it.
    await runEnvAudit({ target: "staging", yes: true });

    expect(printed()).toMatch(/repository's own variables were listed/);
    expect(printed()).not.toMatch(/could NOT be listed/);
  });

  it("says it could NOT check when the list call fails", async () => {
    // ⚠️ The one that protects the test above. `gh variable list` needs
    // permissions the environment reads do not, so failing here while
    // everything else succeeds is ordinary — and an audit that answered it
    // with silence would report an unchecked scope as a clean one.
    vi.mocked(listRepositoryVariables).mockRejectedValue(
      // Shaped like a real one: `describe()` in the gh client appends a
      // paragraph of guidance, and only the first line belongs in a finding.
      new GhError(
        "HTTP 403: Resource not accessible by integration\n\n" +
          "Setting environment secrets needs admin on the repository.",
      ),
    );

    await runEnvAudit({ target: "staging", yes: true });

    expect(printed()).toMatch(/could not check/);
    expect(printed()).toContain("HTTP 403");
    expect(printed()).not.toContain("needs admin on the repository");
    // And the coverage claim is withdrawn, not merely accompanied by a caveat.
    expect(printed()).not.toMatch(/repository's own variables were listed/);
    expect(printed()).toMatch(/could NOT be listed/);
  });

  it("keeps a failed check out of the exit code", async () => {
    // A gap in coverage is not a defect found. Exiting 1 on every run of a
    // machine that lacks the permission is how a report stops being read.
    vi.mocked(listRepositoryVariables).mockRejectedValue(
      new GhError("HTTP 403: Resource not accessible by integration"),
    );
    process.exitCode = 0;

    await runEnvAudit({ target: "staging", yes: true });

    expect(process.exitCode).toBe(0);
  });

  it("does not let the failure hide the rest of the audit", async () => {
    // An audit that refuses to run is an audit nobody runs — the reason the
    // Cloudflare pass returns its unreadable Workers instead of throwing.
    vi.mocked(listRepositoryVariables).mockRejectedValue(
      new GhError("HTTP 403"),
    );

    await runEnvAudit({ target: "staging", yes: true });

    expect(prompts.note).toHaveBeenCalled();
    expect(printed()).toMatch(/write-only/);
  });
});

describe("env audit, the accepted wiring", () => {
  /**
   * The one line `audit.ts`'s own tests cannot cover: `runEnvAudit` passing
   * `accepted: acceptsKey`. The predicate has tests of its own; this is the
   * call site, where dropping the argument falls back to the strict default
   * ("only where `route` says") and reports every correctly-fanned-out
   * production key as a stray to delete — burying the one stray that matters.
   */
  const AT = "2026-01-01T00:00:00Z";

  beforeEach(() => {
    // The production project fans out to two GitHub environments. Both hold
    // both keys: the ordinary secret legitimately (a push writes the
    // superset), the apply-tier one half-legitimately — its `production` copy
    // is the reviewer gate failing open.
    const stored = (id: string, key: string) => ({
      id,
      key,
      value: "v",
      note: "",
      projectId: "project-id",
      revisionDate: AT,
    });
    vi.mocked(listBwsSecrets).mockResolvedValue([
      stored("s-1", "CRON_SECRET"),
      stored("s-2", "AIRTABLE_APPLY_PAT"),
    ]);
    vi.mocked(listGhSecrets).mockResolvedValue([
      { name: "CRON_SECRET", updatedAt: AT },
      { name: "AIRTABLE_APPLY_PAT", updatedAt: AT },
    ]);
  });

  afterEach(() => {
    vi.mocked(listBwsSecrets).mockResolvedValue([]);
    vi.mocked(listGhSecrets).mockResolvedValue([]);
  });

  it("does not report production-apply's superset copy as a stray", async () => {
    await runEnvAudit({ target: "production", yes: true });

    // The default predicate would flag CRON_SECRET's `production-apply` copy
    // ("also set … not where it belongs"). `acceptsKey` knows the superset.
    expect(printed()).not.toMatch(/CRON_SECRET[^\n]*not where it belongs/);
  });

  it("still names the apply-tier key sitting in the unreviewed environment", async () => {
    // The positive control for the test above — an `accepted` of "everything
    // is fine" would also produce no stray findings. This copy is the
    // reviewer gate failing open, and it must survive the superset logic.
    await runEnvAudit({ target: "production", yes: true });

    expect(printed()).toMatch(
      /AIRTABLE_APPLY_PAT[^\n]*`production`[^\n]*not where it belongs/,
    );
  });
});
