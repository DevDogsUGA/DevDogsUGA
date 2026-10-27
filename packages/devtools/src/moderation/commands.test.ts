import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  SAMPLE_SECRET,
  createMemoryStore,
  createReceiver,
  generateSecret,
  type MemoryStore,
} from "@devdogsuga/sdk/moderation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isMessageType, runSamples, runSend } from "./commands.js";

/**
 * A real HTTP receiver built from the SDK's reference implementation, so these
 * run the command end to end: sign, POST over a socket, read the outcome.
 */
let server: Server;
let store: MemoryStore;
let url: string;
let secret: string;

async function listen(receiverSecret: string): Promise<void> {
  store = createMemoryStore();
  const receiver = createReceiver({ secret: receiverSecret, store });
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      void receiver
        .handle(
          Object.fromEntries(
            Object.entries(req.headers).map(([k, v]) => [
              k,
              Array.isArray(v) ? v.join(",") : v,
            ]),
          ),
          Buffer.concat(chunks).toString("utf8"),
        )
        .then((result) => {
          res.writeHead(result.status, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
}

let output: string;
beforeEach(() => {
  output = "";
  process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("moderation send", () => {
  beforeEach(async () => {
    secret = generateSecret();
    await listen(secret);
  });

  it("sends one signed action the receiver applies", async () => {
    await runSend([
      "send",
      "content.hide",
      "--to",
      url,
      "--secret",
      secret,
      "--content-type",
      "session",
      "--content-ref",
      "abc",
    ]);
    expect(output).toContain("content.hide: HTTP 200 (applied)");
    expect(store.content.get("session:abc")).toBe("hidden");
    expect(process.exitCode).toBeUndefined();
  });

  it("--replay sends the same message id twice, and the receiver ignores the second", async () => {
    await runSend([
      "send",
      "user.ban",
      "--to",
      url,
      "--secret",
      secret,
      "--replay",
    ]);
    expect(output).toContain("user.ban: HTTP 200 (applied)");
    expect(output).toContain("user.ban (replay): HTTP 200 (duplicate)");
    expect(store.applied).toHaveLength(1);
  });

  it("--stale is ignored once a newer decision has been applied", async () => {
    await runSend(["send", "content.hide", "--to", url, "--secret", secret]);
    await runSend([
      "send",
      "content.restore",
      "--to",
      url,
      "--secret",
      secret,
      "--stale",
    ]);
    expect(output).toContain("content.restore: HTTP 200 (stale)");
    expect(
      store.content.get("session:00000000-0000-4000-8000-0000000000a1"),
    ).toBe("hidden");
  });

  it("fails with a nonzero exit when the receiver refuses the signature", async () => {
    await runSend([
      "send",
      "content.hide",
      "--to",
      url,
      "--secret",
      generateSecret(),
    ]);
    expect(output).toContain("HTTP 401");
    expect(process.exitCode).toBe(1);
    expect(store.applied).toHaveLength(0);
  });

  it("refuses an unknown action before sending anything", async () => {
    await runSend(["send", "content.nuke", "--to", url, "--secret", secret]);
    expect(process.exitCode).toBe(1);
    expect(store.applied).toHaveLength(0);
  });

  it("says what to start when nothing is listening", async () => {
    await runSend([
      "send",
      "content.hide",
      "--to",
      "http://127.0.0.1:1/hook",
      "--secret",
      secret,
    ]);
    expect(process.exitCode).toBe(1);
  });
});

describe("moderation samples", () => {
  it("passes against a conforming receiver", async () => {
    await listen(SAMPLE_SECRET);
    expect(await runSamples(["samples", "--to", url])).toBe(true);
    expect(output.match(/^pass /gm)).toHaveLength(6);
    expect(output).not.toContain("FAIL");
    expect(process.exitCode).toBeUndefined();
  });

  it("fails a receiver that applies a replay or an out-of-order message", async () => {
    // A receiver with no idempotency or ordering: applies everything it can verify.
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: 200, outcome: "applied" }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

    expect(await runSamples(["samples", "--to", url])).toBe(false);
    expect(output).toContain("FAIL  replay of the hide: expected duplicate");
    expect(output).toContain(
      "FAIL  a restore dated before the hide: expected stale",
    );
    expect(process.exitCode).toBe(1);
  });
});

describe("isMessageType", () => {
  it("accepts the seven actions only", () => {
    for (const type of [
      "content.hide",
      "content.remove",
      "content.restore",
      "user.suspend",
      "user.ban",
      "user.restore",
      "user.delete",
    ]) {
      expect(isMessageType(type)).toBe(true);
    }
    expect(isMessageType("hide")).toBe(false);
  });
});
