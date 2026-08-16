import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What `--target <something>` on the command line resolves to.
 *
 * This is the layer a person actually meets: `runEnvCommand` asks here first,
 * so `--target development` is refused HERE and never reaches the commands'
 * own `assertVaultTarget` guard. Both exist on purpose — this one explains,
 * that one is structural — and only this one is reachable from a keyboard.
 *
 * The prompt path is not exercised: it is only taken when no target is named
 * AND stdin is a TTY, which a test runner is not. Every case below names one.
 */
vi.mock("@clack/prompts", () => ({
  cancel: vi.fn(),
  isCancel: () => false,
  select: vi.fn(() => {
    throw new Error("a named target must never reach the picker");
  }),
  log: { error: vi.fn(), message: vi.fn() },
  note: vi.fn(),
}));

import { log, note } from "@clack/prompts";
import { resolveVaultTarget } from "./pick.js";

/** Everything `explain()` printed, joined — summary, detail and hints. */
function reported(): string {
  return [
    ...vi.mocked(log.error).mock.calls.flat(),
    ...vi.mocked(log.message).mock.calls.flat(),
    ...vi.mocked(note).mock.calls.flat(),
  ].join("\n");
}

beforeEach(() => {
  vi.mocked(log.error).mockClear();
  vi.mocked(log.message).mockClear();
  vi.mocked(note).mockClear();
});

describe("resolveVaultTarget", () => {
  it("accepts each target that has a Bitwarden project", async () => {
    for (const target of ["preflight", "staging", "production"] as const) {
      expect(await resolveVaultTarget(target, "?")).toBe(target);
    }
    // The positive control: accepting is silent, so the rejection tests below
    // only mean something if something CAN pass without a report.
    expect(reported()).toBe("");
  });

  it("refuses development by naming the missing project, not by calling it unknown", async () => {
    // `development` IS a target — it has a row and a file — so "not a target"
    // would be a false statement about the fact that actually rules it out.
    expect(await resolveVaultTarget("development", "?")).toBeNull();
    expect(reported()).toMatch(/no Bitwarden project/);
    expect(reported()).not.toMatch(/is not a target/);
  });

  it("points at the targets that would work", async () => {
    await resolveVaultTarget("development", "?");
    expect(reported()).toMatch(/preflight \| staging \| production/);
  });

  it("refuses a word that is not a target at all", async () => {
    expect(await resolveVaultTarget("prod", "?")).toBeNull();
    expect(reported()).toMatch(/"prod" is not a target/);
    // All four are offered, including the one pull/push/audit cannot use:
    // somebody who typed `prod` may have meant `development`, and learning
    // that it exists but has no project is the useful half of the answer.
    expect(reported()).toMatch(/development, preflight, staging, production/);
  });

  it("refuses rather than prompting when nobody can answer", async () => {
    // stdin is not a TTY under vitest, which is the condition being relied on.
    expect(process.stdin.isTTY).toBeFalsy();
    expect(await resolveVaultTarget(undefined, "?")).toBeNull();
    expect(reported()).toMatch(/nobody here to ask/);
  });
});
