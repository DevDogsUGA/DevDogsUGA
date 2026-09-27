import { describe, expect, it, vi } from "vitest";
import { TeamActionError } from "./errors";

const githubLoginFor = vi.fn();
const twoFactorStatus = vi.fn();

vi.mock("~/server/github/teamSync", () => ({ githubLoginFor }));
vi.mock("~/server/github/twoFactor", () => ({ twoFactorStatus }));

async function loadRequireTwoFactor() {
  return import("./requireTwoFactor");
}

describe("requireTwoFactor", () => {
  it("does nothing when the account has no linked GitHub identity", async () => {
    githubLoginFor.mockResolvedValue(null);
    const { requireTwoFactor } = await loadRequireTwoFactor();

    await expect(requireTwoFactor("user-1")).resolves.toBeUndefined();
    expect(twoFactorStatus).not.toHaveBeenCalled();
  });

  it("passes a login with 2FA enabled", async () => {
    githubLoginFor.mockResolvedValue("ada");
    twoFactorStatus.mockResolvedValue("enabled");
    const { requireTwoFactor } = await loadRequireTwoFactor();

    await expect(requireTwoFactor("user-1")).resolves.toBeUndefined();
  });

  it("refuses a login with 2FA off", async () => {
    githubLoginFor.mockResolvedValue("ada");
    twoFactorStatus.mockResolvedValue("disabled");
    const { requireTwoFactor } = await loadRequireTwoFactor();

    const error = await requireTwoFactor("user-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TeamActionError);
    expect((error as TeamActionError).code).toBe("github_2fa_required");
  });

  it("fails closed when 2FA could not be verified", async () => {
    githubLoginFor.mockResolvedValue("ada");
    twoFactorStatus.mockResolvedValue("unverifiable");
    const { requireTwoFactor } = await loadRequireTwoFactor();

    const error = await requireTwoFactor("user-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TeamActionError);
    expect((error as TeamActionError).code).toBe("github_2fa_unverifiable");
  });
});
