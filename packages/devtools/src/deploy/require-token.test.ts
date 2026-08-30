/**
 * `deploy require-token` is the guard between a contributor and wrangler's
 * browser OAuth prompt.
 *
 * Two assertions here pull in opposite directions. The guard must refuse when
 * the token is absent, or a contributor gets a login flow that "works",
 * against policy §9. It must NOT refuse when the token is present, or every
 * devops deploy is blocked by its own guard. A suite that only checked the
 * first would stay green if the function threw unconditionally, which is why
 * the pass case comes first.
 */
import { describe, expect, it, vi } from "vitest";
import { runRequireToken } from "./require-token.js";
import { DeployError } from "./report.js";

describe("letting a deploy through", () => {
  it("returns when CLOUDFLARE_API_TOKEN is set", () => {
    // THE POSITIVE CONTROL for the whole file: without it, a guard that always
    // threw would satisfy every other test here.
    expect(() =>
      runRequireToken({ CLOUDFLARE_API_TOKEN: "a-token" }),
    ).not.toThrow();
  });

  it("says nothing at all, on either stream, on the way through", () => {
    // Silence on success is deliberate: this sits inside a `&&` chain in front
    // of a deploy, and a guard that announces itself on every run is a guard
    // people stop reading.
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      runRequireToken({ CLOUDFLARE_API_TOKEN: "a-token" });
      expect(out).not.toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });
});

describe("refusing a deploy", () => {
  /** @returns The refusal, message and detail joined as cli.ts would render it. */
  function refuse(env: Record<string, string | undefined>): string {
    try {
      runRequireToken(env);
    } catch (err) {
      // A DeployError, not a bare Error: that is what makes cli.ts print a
      // message with actionable detail instead of a stack trace.
      expect(err).toBeInstanceOf(DeployError);
      const e = err as DeployError;
      return `${e.message}\n${e.detail.join("\n")}`;
    }
    throw new Error("expected runRequireToken to refuse, but it returned");
  }

  it("refuses when CLOUDFLARE_API_TOKEN is absent", () => {
    expect(refuse({})).toContain("CLOUDFLARE_API_TOKEN");
  });

  it("refuses when it is set but EMPTY", () => {
    // `CLOUDFLARE_API_TOKEN=` in a half-filled env file is the realistic shape
    // of this failure, and an empty string would sail past an
    // `"CLOUDFLARE_API_TOKEN" in env` check.
    expect(refuse({ CLOUDFLARE_API_TOKEN: "" })).toContain(
      "CLOUDFLARE_API_TOKEN",
    );
  });

  it("carries the policy, not just the fact", () => {
    // The whole reason this exists rather than letting wrangler prompt: the
    // refusal has to say who owns the credential, or it reads as a broken
    // setup that the reader should try to fix themselves.
    const message = refuse({});
    expect(message).toContain("devops");
    expect(message).toContain("env pull --target production");
  });

  it("writes nothing itself — cli.ts owns the rendering", () => {
    // It must not print AND throw: cli.ts renders the DeployError through
    // say(), so a write here would duplicate the refusal in the deploy log.
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      expect(() => runRequireToken({})).toThrow(DeployError);
      expect(out).not.toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });

  it("is not fooled by a similarly-named variable", () => {
    // wrangler reads several CLOUDFLARE_* names; only the API token authorizes
    // a deploy, and accepting a neighbour would let the guard pass with no
    // credential at all.
    for (const name of [
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_KEY",
      "CLOUDFLARE_EMAIL",
      "CF_API_TOKEN",
    ]) {
      expect(() => runRequireToken({ [name]: "value" }), name).toThrow(
        DeployError,
      );
    }
  });
});
