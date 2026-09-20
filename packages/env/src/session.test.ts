/**
 * Unit tests for the shared tier-session policy.
 *
 * `availableTiers`'s `exists` and `resolveSessionTier`'s `available`/`isTTY`/
 * `prompt`/`deployEnv` are all injected: no test here touches the real
 * filesystem, `process.stdin`, or a real terminal. `enterEnvironment` is
 * intentionally untested — see `session.ts`'s header for why.
 */
import { describe, expect, it, vi } from "vitest";
import { availableTiers, resolveSessionTier } from "./session.js";

describe("availableTiers", () => {
  it("reports only the deploy tier whose file is present", async () => {
    const exists = (relPath: string) => relPath === ".env";
    expect(await availableTiers("/repo", exists)).toEqual(["development"]);
  });

  it("reports every deploy tier whose file is present, in danger order", async () => {
    const exists = (relPath: string) =>
      relPath === ".env" || relPath === ".env.production";
    expect(await availableTiers("/repo", exists)).toEqual([
      "development",
      "production",
    ]);
  });

  /**
   * `.env.generated` is development's local-stack overlay, not a second
   * tier's credentials. A running local stack must never make development
   * count twice, so this asserts both that it is never consulted and, as a
   * belt-and-suspenders check, that a fixture where it happens to answer
   * "yes" still does not widen the result.
   */
  it("never consults .env.generated and never lets it add a tier", async () => {
    const exists = vi.fn(
      (relPath: string) => relPath === ".env" || relPath === ".env.generated",
    );
    expect(await availableTiers("/repo", exists)).toEqual(["development"]);
    expect(exists).not.toHaveBeenCalledWith(".env.generated");
  });
});

describe("resolveSessionTier", () => {
  it("accepts an explicit valid tier without consulting deployEnv/available/prompt", async () => {
    const prompt = vi.fn();
    const result = await resolveSessionTier({
      explicit: "staging",
      deployEnv: "production",
      available: ["development"],
      isTTY: true,
      prompt,
    });
    expect(result).toEqual({
      ok: true,
      tier: "staging",
      resolvedBy: "explicit",
    });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("refuses an explicit invalid tier without falling through to deployEnv", async () => {
    const result = await resolveSessionTier({
      explicit: "bogus",
      deployEnv: "staging",
      available: ["development"],
      isTTY: false,
    });
    expect(result).toEqual({
      ok: false,
      reason:
        'unknown tier "bogus". Expected: development, staging, production.',
    });
  });

  it("falls through to a valid DEPLOY_ENV when no explicit tier was given", async () => {
    const prompt = vi.fn();
    const result = await resolveSessionTier({
      deployEnv: "production",
      available: ["development"],
      isTTY: true,
      prompt,
    });
    expect(result).toEqual({
      ok: true,
      tier: "production",
      resolvedBy: "deployEnv",
    });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("refuses an invalid DEPLOY_ENV rather than running as development", async () => {
    const result = await resolveSessionTier({
      deployEnv: "example",
      available: ["development"],
      isTTY: false,
    });
    expect(result).toEqual({
      ok: false,
      reason:
        'DEPLOY_ENV="example" is not one of development, staging, production.',
    });
  });

  it("falls through to the sole available tier with no explicit/deployEnv and no prompt", async () => {
    const prompt = vi.fn();
    const result = await resolveSessionTier({
      available: ["staging"],
      isTTY: true,
      prompt,
    });
    expect(result).toEqual({ ok: true, tier: "staging", resolvedBy: "sole" });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("falls through to development when zero tier files are present", async () => {
    const result = await resolveSessionTier({
      available: [],
      isTTY: true,
    });
    expect(result).toEqual({
      ok: true,
      tier: "development",
      resolvedBy: "sole",
    });
  });

  it("prompts with every deploy tier, hinting the missing one, when multiple files are present on a TTY", async () => {
    const prompt = vi.fn(async () => "production" as const);
    const result = await resolveSessionTier({
      available: ["development", "production"],
      isTTY: true,
      prompt,
      promptMessage: "Which tier?",
    });

    expect(result).toEqual({
      ok: true,
      tier: "production",
      resolvedBy: "prompt",
    });
    expect(prompt).toHaveBeenCalledWith("Which tier?", [
      { value: "development", label: "development", hint: "the default" },
      {
        value: "staging",
        label: "staging",
        hint: "needs env pull --target staging",
      },
      { value: "production", label: "production", hint: "⚠️  live data" },
    ]);
  });

  it("refuses a picked tier whose file is not present, naming env pull", async () => {
    const prompt = vi.fn(async () => "staging" as const);
    const result = await resolveSessionTier({
      available: ["development", "production"],
      isTTY: true,
      prompt,
    });
    expect(result).toEqual({
      ok: false,
      reason:
        ".env.staging is not present — run `pnpm devtools env pull --target staging` first.",
    });
  });

  it("refuses ambiguously when multiple files are present but no prompt was given", async () => {
    const result = await resolveSessionTier({
      available: ["development", "production"],
      isTTY: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/\.env, \.env\.production/);
      expect(result.reason).toMatch(/--tier <tier>/);
      expect(result.reason).toMatch(/DEPLOY_ENV=<tier>/);
      expect(result.reason).toMatch(/pnpm devtools/);
    }
  });

  it("refuses ambiguously when multiple files are present but the terminal is not a TTY", async () => {
    const prompt = vi.fn();
    const result = await resolveSessionTier({
      available: ["development", "production"],
      isTTY: false,
      prompt,
    });
    expect(result.ok).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });
});
