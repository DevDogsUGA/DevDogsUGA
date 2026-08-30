import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The signing-key lifecycle, with the filesystem, prompts, and the Management
 * API faked. What each block pins:
 *
 *   * generate writes a value long enough for every consumer's floor, and
 *     confirms an overwrite rather than rotating silently;
 *   * import sends the JWK whose `k` is base64url over the UTF-8 BYTES of
 *     the env string, the one encoding that matches what mint-token keys
 *     HMAC with. This test keeps the two sides of the secret agreeing;
 *   * both remote commands refuse loudly when the file lacks what they need,
 *     naming the command that fills it.
 */
const files = vi.hoisted(() => ({
  map: new Map<string, string>(),
  written: new Map<string, string>(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (path: string) => {
    const hit = [...files.map.entries()].find(([name]) =>
      String(path).endsWith(name),
    );
    if (!hit) throw new Error(`ENOENT: ${String(path)}`);
    return hit[1];
  }),
  writeFile: vi.fn(async (path: string, content: string) => {
    files.written.set(String(path), content);
  }),
}));

const prompts = vi.hoisted(() => ({
  confirmed: true,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
  note: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  log: prompts.log,
  note: prompts.note,
  confirm: vi.fn(async () => prompts.confirmed),
  isCancel: () => false,
  cancel: vi.fn(),
}));

vi.mock("../ui.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ui.js")>()),
  bail: vi.fn((message = "Cancelled."): never => {
    throw new Error(`bail: ${message}`);
  }),
}));

import type { Fetch } from "./api.js";
import {
  runSigningKeyGenerate,
  runSigningKeyImport,
  runSigningKeyStatus,
} from "./commands.js";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

function fakeApi(
  status: number,
  payload: unknown,
): { fetchImpl: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({
        url,
        method: init.method,
        headers: init.headers,
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      });
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      };
    },
  };
}

const SECRET = "s".repeat(64);

beforeEach(() => {
  files.map.clear();
  files.written.clear();
  files.map.set(
    ".env.staging",
    `PROJECT_REF="stagingref"\nSUPABASE_JWT_SIGNING_KEY="${SECRET}"\n`,
  );
  files.map.set(".env.production", 'SUPABASE_ACCESS_TOKEN="sbp_token"\n');
  prompts.confirmed = true;
  delete process.env.SUPABASE_ACCESS_TOKEN;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.SUPABASE_ACCESS_TOKEN;
});

describe("signing-key generate", () => {
  it("writes a fresh 64-character base64url secret into the target file", async () => {
    files.map.set(".env.staging", 'SUPABASE_JWT_SIGNING_KEY=""\n');
    await runSigningKeyGenerate({ target: "staging" });

    const written = [...files.written.values()][0]!;
    const value = /SUPABASE_JWT_SIGNING_KEY="([^"]+)"/.exec(written)?.[1];
    // 64 > the 32-char schema floor and mint-token's own check; base64url
    // needs no quoting or escaping anywhere the value travels.
    expect(value).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it("treats overwriting as rotation: confirmed, never silent", async () => {
    prompts.confirmed = false;
    await expect(runSigningKeyGenerate({ target: "staging" })).rejects.toThrow(
      /bail/,
    );
    expect(files.written.size).toBe(0);
  });

  it("refuses a target that is not staging or production", async () => {
    // development has no Supabase project of its own, and preflight holds no
    // deployed secrets at all. A typo must not mint into either.
    await expect(
      runSigningKeyGenerate({ target: "preflight" }),
    ).rejects.toThrow(/staging, production/);
  });
});

describe("signing-key import", () => {
  it("⚠️ sends k = base64url(utf8 bytes of the env string) — the mint-token contract", async () => {
    // mint-token keys HMAC with the STRING'S BYTES. Base64url-decoding the
    // string first (the other plausible reading of a JWK `k`) would import
    // a key that verifies none of our tokens, silently, forever.
    const api = fakeApi(201, {
      id: "kid-1",
      algorithm: "HS256",
      status: "standby",
    });
    await runSigningKeyImport({ target: "staging", fetchImpl: api.fetchImpl });

    expect(api.calls).toHaveLength(1);
    const call = api.calls[0]!;
    expect(call.url).toBe(
      "https://api.supabase.com/v1/projects/stagingref/config/auth/signing-keys",
    );
    expect(call.method).toBe("POST");
    expect(call.body).toEqual({
      algorithm: "HS256",
      private_jwk: {
        kty: "oct",
        k: Buffer.from(SECRET, "utf8").toString("base64url"),
      },
    });
    // No status field: new keys start in standby. Promotion to in_use changes
    // what signs user sessions, and is not this tool's business.
    expect(call.body).not.toHaveProperty("status");
    // The access token came from .env.production, in a header, never argv.
    expect(call.headers.Authorization).toBe("Bearer sbp_token");
  });

  it("prefers an exported SUPABASE_ACCESS_TOKEN over the file's copy", async () => {
    process.env.SUPABASE_ACCESS_TOKEN = "sbp_ambient";
    const api = fakeApi(201, {
      id: "k",
      algorithm: "HS256",
      status: "standby",
    });
    await runSigningKeyImport({ target: "staging", fetchImpl: api.fetchImpl });
    expect(api.calls[0]!.headers.Authorization).toBe("Bearer sbp_ambient");
  });

  it("refuses an empty secret, naming generate", async () => {
    files.map.set(
      ".env.staging",
      'PROJECT_REF="r"\nSUPABASE_JWT_SIGNING_KEY=""\n',
    );
    const api = fakeApi(201, {});
    await expect(
      runSigningKeyImport({ target: "staging", fetchImpl: api.fetchImpl }),
    ).rejects.toThrow(/signing-key generate/);
    expect(api.calls).toEqual([]);
  });

  it("refuses an empty PROJECT_REF — there is no project to import into", async () => {
    files.map.set(".env.staging", `SUPABASE_JWT_SIGNING_KEY="${SECRET}"\n`);
    const api = fakeApi(201, {});
    await expect(
      runSigningKeyImport({ target: "staging", fetchImpl: api.fetchImpl }),
    ).rejects.toThrow(/PROJECT_REF/);
    expect(api.calls).toEqual([]);
  });

  it("stops at the confirm — this writes to the project's auth config", async () => {
    prompts.confirmed = false;
    const api = fakeApi(201, {});
    await expect(
      runSigningKeyImport({ target: "staging", fetchImpl: api.fetchImpl }),
    ).rejects.toThrow(/bail/);
    expect(api.calls).toEqual([]);
  });

  it("surfaces a 403 as a permission problem, not a stack trace", async () => {
    const api = fakeApi(403, { message: "forbidden" });
    await expect(
      runSigningKeyImport({ target: "staging", fetchImpl: api.fetchImpl }),
    ).rejects.toThrow(/secrets:write|permission/);
  });
});

describe("signing-key status", () => {
  it("lists what the project holds", async () => {
    const api = fakeApi(200, [
      { id: "kid-1", algorithm: "HS256", status: "standby" },
    ]);
    await runSigningKeyStatus({ target: "staging", fetchImpl: api.fetchImpl });
    expect(prompts.note).toHaveBeenCalledWith(
      expect.stringContaining("kid-1"),
      expect.stringContaining("stagingref"),
    );
  });

  it("reads an empty list as still-on-legacy, not as an error", async () => {
    const api = fakeApi(200, []);
    await runSigningKeyStatus({ target: "staging", fetchImpl: api.fetchImpl });
    expect(prompts.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("legacy"),
    );
  });
});
