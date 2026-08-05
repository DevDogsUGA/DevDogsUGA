import { beforeEach, describe, expect, it } from "vitest";
import { handleProxyRequest, MAX_BODY_BYTES, type Resolution } from "./proxy";
import { hashToken } from "./token";

/**
 * What the proxy must refuse.
 *
 * Every test here is a negative: the assertions are about requests that must
 * NOT reach upstream, and keys that must NOT be handed out. That framing is
 * deliberate. A proxy's happy path is easy to eyeball in review and easy to
 * notice when broken -- a member says "it doesn't work". A hole is silent, and
 * the person who finds it is not on our side.
 *
 * The mock upstream records every request it receives, so "never reached
 * upstream" is asserted against what actually arrived rather than inferred from
 * a status code.
 */

const PUB = "dd_publishable_aaaaaaaaaaaaaaaa";
const SEC = "dd_secret_bbbbbbbbbbbbbbbb";
const PUB_OTHER_ENV = "dd_publishable_cccccccccccccccc";
const DISABLED = "dd_secret_dddddddddddddddd";

const UPSTREAM = "https://refaaa.supabase.co";
const REAL_PUBLISHABLE = "sb_publishable_REAL";
const REAL_SECRET = "sb_secret_REAL";

const HOST_OK = "enva-sandbox.devdogsuga.org";
const HOST_RETIRED = "envgone-sandbox.devdogsuga.org";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const CLI_UA = "node";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
}

let upstreamCalls: Recorded[] = [];
let logged: { credentialId: string; status: number; path: string }[] = [];

function ok(scope: "publishable" | "secret"): Resolution {
  return {
    outcome: "ok",
    credentialId: scope === "secret" ? "cred-secret" : "cred-pub",
    environmentId: "env-a",
    userId: "user-1",
    projectRef: "refaaa",
    upstreamUrl: UPSTREAM,
    publishableKey: REAL_PUBLISHABLE,
    // The database returns null for a publishable credential. Mirroring that
    // here is what makes the "cannot be elevated" tests meaningful -- if the
    // mock handed back a secret key for both scopes, the proxy could be leaking
    // it and these tests would still pass.
    secretKey: scope === "secret" ? REAL_SECRET : null,
    scope,
    environmentName: "Env A",
  };
}

async function makeDeps(
  overrides: Partial<Parameters<typeof handleProxyRequest>[1]> = {},
) {
  const table = new Map<string, Resolution>([
    [await hashToken(PUB), ok("publishable")],
    [await hashToken(SEC), ok("secret")],
    [await hashToken(PUB_OTHER_ENV), { outcome: "bad_credential" }],
    [await hashToken(DISABLED), { outcome: "bad_credential" }],
  ]);

  return {
    async resolve(hostname: string, tokenHash: string): Promise<Resolution> {
      if (hostname === HOST_RETIRED) {
        return { outcome: "retired_host", environmentName: "Env Gone" };
      }
      if (hostname !== HOST_OK) return { outcome: "unknown_host" };
      return table.get(tokenHash) ?? { outcome: "bad_credential" };
    },
    async log(credentialId: string, _m: string, path: string, status: number) {
      logged.push({ credentialId, status, path });
    },
    async fetchUpstream(request: Request) {
      upstreamCalls.push({
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    defer(work: Promise<unknown>) {
      void work;
    },
    ...overrides,
  };
}

function req(
  path: string,
  init: RequestInit & { host?: string; token?: string; ua?: string } = {},
) {
  const { host = HOST_OK, token, ua = CLI_UA, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token) {
    headers.set("apikey", token);
    if (!headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }
  headers.set("user-agent", ua);
  return new Request(`https://${host}${path}`, { ...rest, headers });
}

beforeEach(() => {
  upstreamCalls = [];
  logged = [];
});

// ─────────────────────────────────────────────────────────────────────────────

describe("requests carrying no usable credential", () => {
  it("refuses a request with no key at all, without contacting upstream", async () => {
    const res = await handleProxyRequest(
      req("/rest/v1/notes"),
      await makeDeps(),
    );
    expect(res.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
  });

  it("refuses an upstream publishable key presented directly", async () => {
    // A member who somehow learns the real key must not be able to use it
    // through the proxy: doing so would bypass the credential entirely, and
    // with it every revocation path and the whole audit trail.
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: REAL_PUBLISHABLE }),
      await makeDeps(),
    );
    expect(res.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
  });

  it("refuses an upstream secret key presented directly", async () => {
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: REAL_SECRET }),
      await makeDeps(),
    );
    expect(res.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
  });

  it("refuses a well-formed but unknown member token", async () => {
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: "dd_secret_not_a_real_token_at_all" }),
      await makeDeps(),
    );
    expect(res.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
  });

  it("refuses a disabled credential", async () => {
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: DISABLED }),
      await makeDeps(),
    );
    expect(res.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
  });

  it("refuses a token belonging to a different environment", async () => {
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: PUB_OTHER_ENV }),
      await makeDeps(),
    );
    expect(res.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
  });

  it("gives one indistinguishable answer to every bad-credential case", async () => {
    // Anything finer would be an oracle for which tokens exist and which
    // environment they belong to.
    const deps = await makeDeps();
    const bodies = await Promise.all(
      [DISABLED, PUB_OTHER_ENV, "dd_secret_nonexistent"].map(async (t) =>
        (
          await handleProxyRequest(req("/rest/v1/notes", { token: t }), deps)
        ).text(),
      ),
    );
    expect(new Set(bodies).size).toBe(1);
  });
});

describe("the secret key", () => {
  it("is never sent upstream for a publishable credential", async () => {
    await handleProxyRequest(
      req("/rest/v1/notes", { token: PUB }),
      await makeDeps(),
    );
    const sent = JSON.stringify(upstreamCalls);
    expect(sent).toContain(REAL_PUBLISHABLE);
    expect(sent).not.toContain(REAL_SECRET);
  });

  it("is refused even if the database hands one to a publishable credential", async () => {
    // The independent check. Every other test in this block passes because the
    // SQL withholds the key, which means they verify the database rather than
    // the proxy -- confirmed by negative control: deleting the proxy's
    // elevation check broke none of them.
    //
    // So this one feeds a deliberately malformed resolution: publishable scope
    // carrying a secret key, which `resolve_sandbox_credential` will not
    // produce today. If it ever does -- a regressed CASE expression, a
    // hand-written call site -- the proxy must still refuse to use it.
    const deps = await makeDeps({
      resolve: () =>
        Promise.resolve({ ...ok("publishable"), secretKey: REAL_SECRET }),
    });
    await handleProxyRequest(req("/rest/v1/notes", { token: PUB }), deps);
    expect(upstreamCalls[0]!.headers.apikey).toBe(REAL_PUBLISHABLE);
    expect(JSON.stringify(upstreamCalls)).not.toContain(REAL_SECRET);
  });

  it("cannot be requested with the retired x-devdogs-role header", async () => {
    // The header that used to grant elevation. It is dead, and this is what
    // keeps it dead rather than merely undocumented.
    await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        headers: { "x-devdogs-role": "secret" },
      }),
      await makeDeps(),
    );
    const sent = JSON.stringify(upstreamCalls);
    expect(sent).not.toContain(REAL_SECRET);
    expect(upstreamCalls[0]!.headers.apikey).toBe(REAL_PUBLISHABLE);
  });

  it("does not leak through any DevDogs header reaching upstream", async () => {
    await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        headers: {
          "x-devdogs-role": "secret",
          "x-devdogs-anything": "1",
          "cf-connecting-ip": "1.2.3.4",
          "x-forwarded-for": "1.2.3.4",
        },
      }),
      await makeDeps(),
    );
    const names = Object.keys(upstreamCalls[0]!.headers);
    expect(names.filter((n) => n.startsWith("x-devdogs-"))).toEqual([]);
    expect(names.filter((n) => n.startsWith("cf-"))).toEqual([]);
    expect(names.filter((n) => n.startsWith("x-forwarded-"))).toEqual([]);
  });

  it("is sent for a secret credential from a non-browser client", async () => {
    await handleProxyRequest(
      req("/rest/v1/notes", { token: SEC, ua: CLI_UA }),
      await makeDeps(),
    );
    expect(upstreamCalls[0]!.headers.apikey).toBe(REAL_SECRET);
  });

  it("is refused to a browser, without contacting upstream", async () => {
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: SEC, ua: BROWSER_UA }),
      await makeDeps(),
    );
    expect(res.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
    // Attributable: the attempt is logged against the credential that made it.
    expect(logged).toEqual([
      { credentialId: "cred-secret", status: 401, path: "/rest/v1/notes" },
    ]);
  });
});

describe("the member token", () => {
  it("never reaches upstream in any header", async () => {
    for (const token of [PUB, SEC]) {
      upstreamCalls = [];
      await handleProxyRequest(
        req("/rest/v1/notes", { token }),
        await makeDeps(),
      );
      expect(JSON.stringify(upstreamCalls)).not.toContain(token);
    }
  });

  it("never reaches upstream in a realtime query string", async () => {
    const url = `https://${HOST_OK}/realtime/v1/websocket?apikey=${PUB}&vsn=1.0.0`;
    await handleProxyRequest(
      new Request(url, { headers: { "user-agent": CLI_UA } }),
      await makeDeps(),
    );
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0]!.url).not.toContain(PUB);
    expect(upstreamCalls[0]!.url).toContain(REAL_PUBLISHABLE);
  });

  it("never reaches upstream in Sec-WebSocket-Protocol", async () => {
    await handleProxyRequest(
      req("/realtime/v1/websocket", {
        token: PUB,
        headers: { "sec-websocket-protocol": `phoenix, ${PUB}` },
      }),
      await makeDeps(),
    );
    const proto = upstreamCalls[0]!.headers["sec-websocket-protocol"]!;
    expect(proto).not.toContain(PUB);
    expect(proto).toContain("phoenix");
  });

  it("is not accepted as a query param outside realtime", async () => {
    // Accepting it everywhere would put credentials in URLs, where they land in
    // access logs and Referer headers.
    const url = `https://${HOST_OK}/rest/v1/notes?apikey=${PUB}`;
    const res = await handleProxyRequest(
      new Request(url, { headers: { "user-agent": CLI_UA } }),
      await makeDeps(),
    );
    expect(res.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
  });
});

describe("the path allowlist", () => {
  it.each([
    "/",
    "/admin",
    "/pg",
    "/graphql/v1/",
    "/restaurants",
    "/rest",
    "/.env",
    "/metrics",
  ])("refuses %s without forwarding it", async (path) => {
    const res = await handleProxyRequest(
      req(path, { token: PUB }),
      await makeDeps(),
    );
    expect(res.status).toBe(404);
    expect(upstreamCalls).toEqual([]);
  });

  it("is not fooled by traversal into an allowed prefix", async () => {
    // `new URL()` normalizes this to /admin before classification. Asserting it
    // because a hand-rolled startsWith on the raw target would answer "storage"
    // for a request the origin treats as /admin.
    const res = await handleProxyRequest(
      req("/storage/v1/../../admin", { token: PUB }),
      await makeDeps(),
    );
    expect(res.status).toBe(404);
    expect(upstreamCalls).toEqual([]);
  });

  it("does not let traversal change which service a request reaches", async () => {
    await handleProxyRequest(
      req("/storage/v1/../../rest/v1/secrets", { token: PUB }),
      await makeDeps(),
    );
    // Whatever it is classified as, the URL sent upstream must be the
    // normalized one -- the origin must not see a different path than we judged.
    expect(upstreamCalls).toHaveLength(1);
    expect(new URL(upstreamCalls[0]!.url).pathname).toBe("/rest/v1/secrets");
  });

  it("refuses an unknown path before checking anything else", async () => {
    const res = await handleProxyRequest(req("/admin"), await makeDeps());
    // No credential -> 401, not 404: the path surface is not enumerable by
    // anonymous callers.
    expect(res.status).toBe(401);
  });
});

describe("hostname handling", () => {
  it("answers an unknown host with 410, not a forward", async () => {
    const res = await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        host: "nope-sandbox.devdogsuga.org",
      }),
      await makeDeps(),
    );
    expect(res.status).toBe(410);
    expect(upstreamCalls).toEqual([]);
  });

  it("answers a retired host with 410 and names the environment", async () => {
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: PUB, host: HOST_RETIRED }),
      await makeDeps(),
    );
    expect(res.status).toBe(410);
    expect(await res.text()).toContain("Env Gone");
    expect(upstreamCalls).toEqual([]);
  });
});

describe("session pass-through", () => {
  it("forwards a user JWT untouched and still swaps the apikey", async () => {
    const jwt = "eyJhbGciOi.eyJzdWIiOiJ1c2VyIn0.sig";
    await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        headers: { authorization: `Bearer ${jwt}` },
      }),
      await makeDeps(),
    );
    expect(upstreamCalls[0]!.headers.authorization).toBe(`Bearer ${jwt}`);
    expect(upstreamCalls[0]!.headers.apikey).toBe(REAL_PUBLISHABLE);
  });

  it("sends the key in Authorization when there is no session", async () => {
    // What makes an unauthenticated request run as `anon` upstream rather than
    // as anything this proxy invented. The sandbox must be able to represent a
    // logged-out user, which is the state every public page starts in.
    await handleProxyRequest(
      req("/rest/v1/notes", { token: PUB }),
      await makeDeps(),
    );
    expect(upstreamCalls[0]!.headers.authorization).toBe(
      `Bearer ${REAL_PUBLISHABLE}`,
    );
  });

  it("does not let a user JWT stand in for a member token", async () => {
    const jwt = "eyJhbGciOi.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig";
    const res = await handleProxyRequest(
      new Request(`https://${HOST_OK}/rest/v1/notes`, {
        headers: { authorization: `Bearer ${jwt}`, "user-agent": CLI_UA },
      }),
      await makeDeps(),
    );
    expect(res.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
  });
});

describe("resource limits", () => {
  it("refuses a body over the cap without forwarding it", async () => {
    const res = await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        method: "POST",
        body: new Uint8Array(MAX_BODY_BYTES + 1),
      }),
      await makeDeps(),
    );
    expect(res.status).toBe(413);
    expect(upstreamCalls).toEqual([]);
  });

  it("does not trust a lying Content-Length", async () => {
    // A small declared length with a large actual body must still be caught,
    // which is why the cap is enforced on what arrives rather than what is
    // claimed.
    const res = await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        method: "POST",
        body: new Uint8Array(MAX_BODY_BYTES + 1),
        headers: { "content-length": "10" },
      }),
      await makeDeps(),
    );
    expect(res.status).toBe(413);
    expect(upstreamCalls).toEqual([]);
  });
});

describe("upstream failure", () => {
  it("reports 503 and never concludes the project is paused", async () => {
    const deps = await makeDeps({
      fetchUpstream: () => Promise.reject(new Error("boom")),
    });
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: PUB }),
      deps,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { retryAfterSeconds: number };
    // ~4 minutes, from the measured 196s restore. A token 30 seconds would
    // train people to retry into a wall.
    expect(body.retryAfterSeconds).toBe(240);
  });
});
