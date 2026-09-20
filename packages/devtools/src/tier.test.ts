/**
 * Unit tests for the shared `--tier` resolver.
 *
 * `availableTiers`'s `exists` and `resolveTier`'s `available`/`isTTY`/`prompt`
 * are all injectable for exactly this file: no test here touches the real
 * filesystem, `process.stdin`, or a real terminal.
 */
import { describe, expect, it, vi } from "vitest";
import { availableTiers, resolveTier } from "./tier.js";

describe("availableTiers", () => {
  it("reports only the deploy tier whose file is present", () => {
    const exists = (relPath: string) => relPath === ".env";
    expect(availableTiers(exists)).toEqual(["development"]);
  });

  it("reports every deploy tier whose file is present, in danger order", () => {
    const exists = (relPath: string) =>
      relPath === ".env" || relPath === ".env.production";
    expect(availableTiers(exists)).toEqual(["development", "production"]);
  });

  /**
   * `.env.generated` is development's local-stack overlay (see `tier.ts`'s
   * header), not a second tier's credentials. A running local stack must
   * never make development count twice, so this asserts both that it is
   * never consulted and, as a belt-and-suspenders check, that a fixture
   * where it happens to answer "yes" still does not widen the result.
   */
  it("never consults .env.generated and never lets it add a tier", () => {
    const exists = vi.fn(
      (relPath: string) => relPath === ".env" || relPath === ".env.generated",
    );
    expect(availableTiers(exists)).toEqual(["development"]);
    expect(exists).not.toHaveBeenCalledWith(".env.generated");
  });
});

describe("resolveTier", () => {
  it("returns an explicit valid tier without consulting available/prompt", async () => {
    const prompt = vi.fn();
    const result = await resolveTier("staging", "Which tier?", {
      label: "devtools test",
      available: ["development"],
      prompt,
    });
    expect(result).toBe("staging");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("rejects an explicit invalid tier and reports it on stderr", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const result = await resolveTier("bogus", "Which tier?", {
      label: "devtools test",
    });

    expect(result).toBeNull();
    expect(stderr).toHaveBeenCalledWith(
      'devtools test: unknown tier "bogus". Expected: development, staging, production.\n',
    );
    stderr.mockRestore();
  });

  it("falls through to development with no prompt when only one tier's file is present", async () => {
    const prompt = vi.fn();
    const result = await resolveTier(undefined, "Which tier?", {
      available: ["development"],
      isTTY: true,
      prompt,
    });
    expect(result).toBe("development");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("falls through to development with no prompt outside a TTY, even with multiple tiers present", async () => {
    const prompt = vi.fn();
    const result = await resolveTier(undefined, "Which tier?", {
      available: ["development", "production"],
      isTTY: false,
      prompt,
    });
    expect(result).toBe("development");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("prompts with every deploy tier, hinting the missing one, when multiple files are present on a TTY", async () => {
    const prompt = vi.fn(async () => "production" as const);
    const result = await resolveTier(undefined, "Which tier?", {
      available: ["development", "production"],
      isTTY: true,
      prompt,
    });

    expect(result).toBe("production");
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

  it("refuses a picked tier whose file is not present and points at env pull", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const prompt = vi.fn(async () => "staging" as const);

    const result = await resolveTier(undefined, "Which tier?", {
      label: "devtools test",
      available: ["development", "production"],
      isTTY: true,
      prompt,
    });

    expect(result).toBeNull();
    expect(stderr).toHaveBeenCalledWith(
      "devtools test: .env.staging is not present — run `pnpm devtools env pull --target staging` first.\n",
    );
    stderr.mockRestore();
  });
});
