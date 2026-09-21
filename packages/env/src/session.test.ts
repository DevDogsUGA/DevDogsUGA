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
        'unknown tier "bogus". Expected: development, development:local, ' +
        "development:remote, staging, production.",
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

/**
 * The development-database half of the policy. The table's shape mirrors the
 * tier's own: explicit wins, then the ambient variable, then "nothing to
 * choose" resolves silently, then a real choice is asked on a TTY and
 * refused off one. `remoteCandidate: undefined` (the caller did not look —
 * `with-env`'s stance) and `null` (looked, found nothing) both resolve
 * UNQUALIFIED, so the load probe keeps deciding and no wrapped script
 * regresses; only a real candidate makes it a question.
 */
describe("resolveSessionTier: the development database", () => {
  it("parses an explicit qualified selector outright", async () => {
    const prompt = vi.fn();
    const result = await resolveSessionTier({
      explicit: "development:remote",
      available: ["development"],
      isTTY: true,
      prompt,
      remoteCandidate: "db.example.com",
    });
    expect(result).toEqual({
      ok: true,
      tier: "development",
      devDatabase: "remote",
      resolvedBy: "explicit",
    });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("refuses a qualifier on a non-development tier", async () => {
    const result = await resolveSessionTier({
      explicit: "staging:local",
      available: ["development", "staging"],
      isTTY: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toMatch(/unknown tier "staging:local"/);
  });

  it("honours a valid DEV_DB when the tier lands on bare development", async () => {
    const prompt = vi.fn();
    const result = await resolveSessionTier({
      devDb: "remote",
      available: ["development"],
      isTTY: true,
      prompt,
      remoteCandidate: "db.example.com",
    });
    expect(result).toEqual({
      ok: true,
      tier: "development",
      devDatabase: "remote",
      resolvedBy: "sole",
    });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("refuses an invalid DEV_DB rather than falling back to the probe", async () => {
    const result = await resolveSessionTier({
      devDb: "prod",
      available: ["development"],
      isTTY: false,
    });
    expect(result).toEqual({
      ok: false,
      reason: 'DEV_DB="prod" is not one of: local, remote.',
    });
  });

  it("resolves unqualified when the caller did not look for a candidate", async () => {
    const result = await resolveSessionTier({
      available: ["development"],
      isTTY: false,
    });
    expect(result).toEqual({
      ok: true,
      tier: "development",
      resolvedBy: "sole",
    });
  });

  it("resolves unqualified when the caller looked and found no candidate", async () => {
    const result = await resolveSessionTier({
      available: ["development"],
      isTTY: false,
      remoteCandidate: null,
    });
    expect(result).toEqual({
      ok: true,
      tier: "development",
      resolvedBy: "sole",
    });
  });

  it("asks which development database when a candidate exists on a TTY", async () => {
    const prompt = vi.fn(async () => "development:local");
    const result = await resolveSessionTier({
      available: ["development"],
      isTTY: true,
      prompt,
      remoteCandidate: "db.example.com",
      localStackOnline: true,
    });
    expect(result).toEqual({
      ok: true,
      tier: "development",
      devDatabase: "local",
      resolvedBy: "prompt",
    });
    expect(prompt).toHaveBeenCalledWith("Which development database?", [
      {
        value: "development:local",
        label: "development:local",
        hint: "Docker stack · online",
      },
      {
        value: "development:remote",
        label: "development:remote",
        hint: "db.example.com",
      },
    ]);
  });

  it("refuses off a TTY when a candidate exists and nothing answered", async () => {
    const prompt = vi.fn();
    const result = await resolveSessionTier({
      available: ["development"],
      isTTY: false,
      prompt,
      remoteCandidate: "db.example.com",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/db\.example\.com/);
      expect(result.reason).toMatch(/--tier development:local/);
      expect(result.reason).toMatch(/--tier development:remote/);
      expect(result.reason).toMatch(/DEV_DB=local\|remote/);
    }
    expect(prompt).not.toHaveBeenCalled();
  });

  it("applies the same discipline to DEPLOY_ENV=development", async () => {
    // The inherited-variable path a devtools child or an exported shell
    // takes. With a candidate and no TTY the refusal must fire here too, or
    // DEPLOY_ENV=development would be a way around the whole question.
    const result = await resolveSessionTier({
      deployEnv: "development",
      available: ["development", "production"],
      isTTY: false,
      remoteCandidate: "db.example.com",
    });
    expect(result.ok).toBe(false);
  });

  it("expands development into its two qualified rows in the multi-tier picker", async () => {
    const prompt = vi.fn(async () => "development:remote");
    const result = await resolveSessionTier({
      available: ["development", "production"],
      isTTY: true,
      prompt,
      remoteCandidate: "db.example.com",
      localStackOnline: false,
    });
    expect(result).toEqual({
      ok: true,
      tier: "development",
      devDatabase: "remote",
      resolvedBy: "prompt",
    });
    expect(prompt).toHaveBeenCalledWith(
      "Which environment should this session use?",
      [
        {
          value: "development:local",
          label: "development:local",
          hint: "Docker stack · offline",
        },
        {
          value: "development:remote",
          label: "development:remote",
          hint: "db.example.com",
        },
        {
          value: "staging",
          label: "staging",
          hint: "needs env pull --target staging",
        },
        { value: "production", label: "production", hint: "⚠️  live data" },
      ],
    );
  });

  it("keeps a single development row in the picker when no candidate exists", async () => {
    const prompt = vi.fn(async () => "development");
    const result = await resolveSessionTier({
      available: ["development", "production"],
      isTTY: true,
      prompt,
      remoteCandidate: null,
    });
    expect(result).toEqual({
      ok: true,
      tier: "development",
      resolvedBy: "prompt",
    });
    const choices = prompt.mock.calls[0]![1] as { value: string }[];
    expect(choices.map((c) => c.value)).toEqual([
      "development",
      "staging",
      "production",
    ]);
  });
});
