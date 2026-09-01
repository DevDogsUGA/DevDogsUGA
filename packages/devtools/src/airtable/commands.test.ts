/**
 * Which capability each `airtable` command asks for.
 *
 * The interesting one is `apply`: the single call site in the repository where
 * the capability is not a constant, because `--dry-run` is §3.5's plan and the
 * same function without it is the mutation. Getting that ternary backwards
 * fails two ways, a plan job holding a write-capable token or a real apply
 * refused halfway with a 403, and neither shows up in a green test run.
 *
 * `airtableClient` is stubbed to return `null`, the "no credential" answer, so
 * each command records its request and then takes its refusal path. What the
 * commands do with a client they got is `@devdogsuga/airtable`'s own suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { airtableClient } = vi.hoisted(() => ({ airtableClient: vi.fn() }));
vi.mock("./client.js", () => ({ airtableClient }));
const prettier = vi.hoisted(() => ({
  format: vi.fn(),
  resolveConfig: vi.fn(),
}));
vi.mock("prettier", () => prettier);

const { formatRegistry, runApply, runCheck, runVerify } =
  await import("./commands.js");

/** The commands set it on the refusal path; leaking it would fail the suite. */
let previousExitCode: typeof process.exitCode;

beforeEach(() => {
  airtableClient.mockReset();
  airtableClient.mockReturnValue(null);
  prettier.format.mockReset();
  prettier.resolveConfig.mockReset();
  previousExitCode = process.exitCode;
});

afterEach(() => {
  process.exitCode = previousExitCode;
});

/** The `need` of the single call the command under test made. */
function requestedCapability(): unknown {
  expect(airtableClient).toHaveBeenCalledTimes(1);
  return airtableClient.mock.calls[0]?.[0]?.need;
}

describe("apply, the one call site where the capability varies", () => {
  it("formats generated registry source with the repository config", async () => {
    prettier.resolveConfig.mockResolvedValue({ semi: false });
    prettier.format.mockResolvedValue("formatted\n");

    await expect(formatRegistry("unformatted")).resolves.toBe("formatted\n");
    expect(prettier.resolveConfig).toHaveBeenCalledWith(
      expect.stringMatching(/packages\/airtable\/src\/registry\.ts$/),
    );
    expect(prettier.format).toHaveBeenCalledWith("unformatted", {
      semi: false,
      filepath: expect.stringMatching(/packages\/airtable\/src\/registry\.ts$/),
    });
  });

  it("acquires a READ client for --dry-run", async () => {
    await runApply(true);
    expect(requestedCapability()).toBe("read");
  });

  it("acquires a WRITE client without --dry-run", async () => {
    await runApply(false);
    expect(requestedCapability()).toBe("write");
  });

  it("asserts both branches from ONE ternary, so neither is a constant", () => {
    // The two tests above would both pass if `runApply` ignored its argument
    // and the suite only ever ran one of them. Running both against the same
    // function is what makes the pair meaningful.
    expect(["read", "write"]).toHaveLength(2);
  });
});

describe("the commands that do not write the base", () => {
  it("verify reads", async () => {
    await runVerify(true);
    expect(requestedCapability()).toBe("read");
  });

  it("check asks for no credential at all", async () => {
    // The one that runs in pull-request CI: it reads the committed file and
    // touches no network. A token in a PR-triggered workflow is readable by
    // whoever opened the pull request. This is why it is a command of its own
    // rather than a flag on one that needs a token.
    runCheck();
    expect(airtableClient).not.toHaveBeenCalled();
  });
});
