import { describe, expect, it } from "vitest";
import {
  beginInvocation,
  recordEnteredTier,
  recordResolved,
  reproducibleCommand,
} from "./invocation.js";

describe("invocation recorder", () => {
  it("prints nothing before an invocation begins", () => {
    // A fresh module — no begin — has nothing to reproduce.
    expect(reproducibleCommand()).toBeNull();
  });

  it("stays quiet for a typed command that answered no prompts", () => {
    beginInvocation(["env", "example", "--check"], false);
    expect(reproducibleCommand()).toBeNull();
  });

  it("prints the wizard's built argv even with no in-command prompt", () => {
    beginInvocation(["db", "start"], true);
    expect(reproducibleCommand()).toBe("pnpm devtools db start");
  });

  it("appends what a prompt resolved onto a typed command", () => {
    beginInvocation(["workflows", "run", "--app", "schedule-builder"], false);
    recordResolved("--workflow", "SCRAPE_WORKFLOW");
    recordResolved("--tier", "development");
    expect(reproducibleCommand()).toBe(
      "pnpm devtools workflows run --app schedule-builder " +
        "--workflow SCRAPE_WORKFLOW --tier development",
    );
  });

  it("prefixes the entered tier as a --tier flag, reproducing it for every command", () => {
    beginInvocation(["db", "status", "--target", "remote"], true);
    recordEnteredTier("staging");
    // `--tier` is the global flag `launch.ts` strips off ANY invocation
    // before `cli.ts` runs, so leading with it here reproduces the tier
    // regardless of whether `db` itself parses `--tier`.
    expect(reproducibleCommand()).toBe(
      "pnpm devtools --tier staging db status --target remote",
    );
  });

  it("adds no prefix for the development default", () => {
    beginInvocation(["db", "status"], true);
    recordEnteredTier("development");
    expect(reproducibleCommand()).toBe("pnpm devtools db status");
  });

  it("clears a prior entered tier on the next begin", () => {
    beginInvocation(["cf", "preview", "--app", "platform"], true);
    recordEnteredTier("production");
    expect(reproducibleCommand()).toBe(
      "pnpm devtools --tier production cf preview --app platform",
    );
    // A fresh invocation must not inherit the previous one's tier prefix.
    beginInvocation(["db", "start"], true);
    expect(reproducibleCommand()).toBe("pnpm devtools db start");
  });

  it("ignores an empty fragment", () => {
    beginInvocation(["oauth"], false);
    recordResolved();
    // No real resolution happened, so there is nothing worth printing.
    expect(reproducibleCommand()).toBeNull();
  });

  it("resets the interactive flag on begin, so a prior walk does not leak", () => {
    // The test above left the recorder interactive; a fresh non-menu begin
    // with a fully-typed command must fall back to silence.
    beginInvocation(["db", "reset", "--target", "local"], false);
    expect(reproducibleCommand()).toBeNull();
  });
});
