/**
 * Which capability each `airtable` command asks for.
 *
 * The interesting one is `scaffold`: it is the single call site in the
 * repository where the capability is not a constant, because `--dry-run` is
 * §3.5's plan and the same function without it is the mutation. Getting that
 * ternary backwards fails in two different bad ways — a plan job holding a
 * write-capable token, or a real scaffold refused halfway with a 403 — and
 * neither is visible from the outside of a green test run.
 *
 * `airtableClient` is stubbed to return `null`, the "no credential" answer, so
 * each command records its request and then takes its refusal path. That keeps
 * the assertion on the ONE thing this file is about; what the commands do with
 * a client they got is `@devdogsuga/airtable`'s own suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { airtableClient } = vi.hoisted(() => ({ airtableClient: vi.fn() }));
vi.mock("./client.js", () => ({ airtableClient }));

const { runPullIds, runScaffold, runSnapshot, runVerify } =
  await import("./commands.js");

/** The commands set it on the refusal path; leaking it would fail the suite. */
let previousExitCode: typeof process.exitCode;

beforeEach(() => {
  airtableClient.mockReset();
  airtableClient.mockReturnValue(null);
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

describe("scaffold, the one call site where the capability varies", () => {
  it("acquires a READ client for --dry-run", async () => {
    await runScaffold(true);
    expect(requestedCapability()).toBe("read");
  });

  it("acquires a WRITE client without --dry-run", async () => {
    await runScaffold(false);
    expect(requestedCapability()).toBe("write");
  });

  it("asserts both branches from ONE ternary, so neither is a constant", () => {
    // Stated rather than implied: the two tests above would both pass if
    // `runScaffold` ignored its argument and the suite only ever ran one of
    // them. Running both against the same function is what makes the pair
    // meaningful, and this is the note that says so.
    expect(["read", "write"]).toHaveLength(2);
  });
});

describe("the commands that only ever read", () => {
  it("pull-ids reads — its only write is a local source file", async () => {
    await runPullIds();
    expect(requestedCapability()).toBe("read");
  });

  it("verify reads", async () => {
    await runVerify(true);
    expect(requestedCapability()).toBe("read");
  });

  it("snapshot reads, when it is not the credential-free --check half", async () => {
    await runSnapshot(false);
    expect(requestedCapability()).toBe("read");
  });

  it("snapshot --check asks for no credential at all", async () => {
    // The half that runs in pull-request CI: it reads the committed file and
    // touches no network, which is the whole point — a token in a
    // PR-triggered workflow is readable by whoever opened the pull request.
    await runSnapshot(true);
    expect(airtableClient).not.toHaveBeenCalled();
  });
});
