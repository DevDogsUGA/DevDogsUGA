import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `twoFactorStatus` against a faked Octokit, never the network.
 *
 * Each test re-imports the module after `vi.resetModules()` so its two
 * module-level latches -- the 30s disabled-login cache and the
 * once-per-process dev-bypass notice -- start fresh and do not leak an
 * answer or a console call from a previous test into this one.
 */

const appEnv = { DEPLOY_ENV: "development", GITHUB_ORG: "DevDogsUGA" };

let listMembers: ReturnType<typeof vi.fn>;
let listOutsideCollaborators: ReturnType<typeof vi.fn>;

vi.mock("~/env", () => ({ env: appEnv }));
vi.mock("./client", () => ({
  octokit: () => ({
    rest: {
      orgs: {
        get listMembers() {
          return listMembers;
        },
        get listOutsideCollaborators() {
          return listOutsideCollaborators;
        },
      },
    },
    // The fake `paginate` just calls whichever endpoint it was handed and
    // returns its resolved array -- real `paginate` does that plus the
    // actual HTTP pagination, which is Octokit's problem to have tested, not
    // this module's.
    paginate: (endpoint: () => unknown) => endpoint(),
  }),
}));

async function loadTwoFactor() {
  vi.resetModules();
  return import("./twoFactor");
}

beforeEach(() => {
  appEnv.DEPLOY_ENV = "development";
  listMembers = vi.fn();
  listOutsideCollaborators = vi.fn();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("twoFactorStatus", () => {
  it("is enabled for a login in neither disabled list", async () => {
    listMembers.mockResolvedValue([]);
    listOutsideCollaborators.mockResolvedValue([]);
    const { twoFactorStatus } = await loadTwoFactor();

    expect(await twoFactorStatus("ada")).toBe("enabled");
  });

  it("is disabled for a login GitHub reports as an org member without 2FA", async () => {
    listMembers.mockResolvedValue([{ login: "ada" }]);
    listOutsideCollaborators.mockResolvedValue([]);
    const { twoFactorStatus } = await loadTwoFactor();

    expect(await twoFactorStatus("Ada")).toBe("disabled");
  });

  it("is disabled for a login GitHub reports as an outside collaborator without 2FA", async () => {
    listMembers.mockResolvedValue([]);
    listOutsideCollaborators.mockResolvedValue([{ login: "grace" }]);
    const { twoFactorStatus } = await loadTwoFactor();

    expect(await twoFactorStatus("grace")).toBe("disabled");
  });

  it("matches case-insensitively", async () => {
    listMembers.mockResolvedValue([{ login: "Ada-Lovelace" }]);
    listOutsideCollaborators.mockResolvedValue([]);
    const { twoFactorStatus } = await loadTwoFactor();

    expect(await twoFactorStatus("ada-lovelace")).toBe("disabled");
  });

  it("caches the disabled-login lists across calls in the same window", async () => {
    listMembers.mockResolvedValue([]);
    listOutsideCollaborators.mockResolvedValue([]);
    const { twoFactorStatus } = await loadTwoFactor();

    await twoFactorStatus("ada");
    await twoFactorStatus("grace");

    expect(listMembers).toHaveBeenCalledTimes(1);
    expect(listOutsideCollaborators).toHaveBeenCalledTimes(1);
  });

  it("is unverifiable in a deployed environment when the GitHub call fails", async () => {
    appEnv.DEPLOY_ENV = "production";
    listMembers.mockRejectedValue(new Error("boom"));
    listOutsideCollaborators.mockResolvedValue([]);
    const { twoFactorStatus } = await loadTwoFactor();

    expect(await twoFactorStatus("ada")).toBe("unverifiable");
    expect(console.error).toHaveBeenCalled();
  });

  it("passes, with a one-time notice, in local development when the GitHub call fails", async () => {
    appEnv.DEPLOY_ENV = "development";
    listMembers.mockRejectedValue(new Error("boom"));
    listOutsideCollaborators.mockResolvedValue([]);
    const { twoFactorStatus } = await loadTwoFactor();

    const first = await twoFactorStatus("ada");
    const second = await twoFactorStatus("grace");

    expect(first).toBe("enabled");
    expect(second).toBe("enabled");
    expect(console.info).toHaveBeenCalledTimes(1);
  });
});
