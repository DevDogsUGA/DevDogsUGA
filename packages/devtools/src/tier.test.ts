/**
 * Unit tests for the per-command `--tier` resolver.
 *
 * `availableTiers` itself now lives in, and is tested by,
 * `@devdogsuga/env/session`'s own `session.test.ts` — see `tier.ts`'s header.
 * `resolveTier`'s `available`/`isTTY`/`prompt`/`deployEnv` are all injectable
 * for exactly this file: no test here touches the real filesystem,
 * `process.stdin`, a real terminal, or the real `DEPLOY_ENV`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTier } from "./tier.js";

describe("resolveTier", () => {
  // `resolveTier` reads `process.env.DEPLOY_ENV` as the entered-tier default, so
  // clear it for the cases that mean to exercise the picker and restore it after
  // — a developer with `DEPLOY_ENV` exported must not turn these red. The two
  // entered-tier cases pass `deployEnv` explicitly instead.
  const saved = process.env.DEPLOY_ENV;
  beforeEach(() => {
    delete process.env.DEPLOY_ENV;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = saved;
  });

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

  it("honours an already-entered tier over the prompt when none was passed", async () => {
    const prompt = vi.fn();
    const result = await resolveTier(undefined, "Which tier?", {
      available: ["development", "production"],
      isTTY: true,
      deployEnv: "production",
      prompt,
    });
    expect(result).toBe("production");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("ignores an empty or unknown entered tier and asks as usual", async () => {
    const prompt = vi.fn(async () => "development" as const);
    const result = await resolveTier(undefined, "Which tier?", {
      available: ["development", "production"],
      isTTY: true,
      deployEnv: "",
      prompt,
    });
    expect(result).toBe("development");
    expect(prompt).toHaveBeenCalledOnce();
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
