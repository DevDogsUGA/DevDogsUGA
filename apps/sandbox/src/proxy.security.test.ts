import { beforeEach, describe, expect, it } from "vitest";
import { handleProxyRequest, MAX_BODY_BYTES, type Resolution } from "./proxy";
import { hashToken } from "./token";

/**
 * What the proxy must refuse.
 *
 * Every test here is a negative: requests that must NOT reach upstream, keys
 * that must NOT be handed out. A broken happy path gets reported by a member.
 * A hole is silent, and whoever finds it is not on our side.
 *
 * The mock upstream records every request, so "never reached upstream" is
 * asserted against what arrived rather than inferred from a status code.
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
/**
 * What `defer` was handed.
 *
 * The double used to be `void work`, which drops the promise unexecuted, so
 * index.ts's "a failed audit write must not fail a request that already
 * succeeded" had no coverage and a rejection here went unnoticed. Collected so
 * a test can await them.
 */
let deferred: Promise<unknown>[] = [];

function ok(scope: "publishable" | "secret"): Resolution {
  const base = {
    outcome: "ok" as const,
    credentialId: scope === "secret" ? "cred-secret" : "cred-pub",
    environmentId: "env-a",
    userId: "user-1",
    projectRef: "refaaa",
    upstreamUrl: UPSTREAM,
    publishableKey: REAL_PUBLISHABLE,
    environmentName: "Env A",
  };
  // The database returns null for a publishable credential. Mirroring that is
  // what makes the "cannot be elevated" tests meaningful: if the mock handed
  // back a secret key for both scopes, the proxy could be leaking it and these
  // tests would still pass.
  //
  // `scope` and `secretKey` are one discriminated pair in `Resolution`, so this
  // is the only shape that TYPECHECKS as well as the only one the database
  // produces.
  return scope === "secret"
    ? { ...base, scope: "secret", secretKey: REAL_SECRET }
    : { ...base, scope: "publishable", secretKey: null };
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
      deferred.push(work);
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
  deferred = [];
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
    // Pinned to the answer we mean. Uniformity alone is satisfied by any
    // blanket outcome; a total outage answers all three identically too. So it
    // cannot distinguish "deliberately indistinguishable" from "broken in the
    // same way three times".
    expect(JSON.parse(bodies[0]!)).toMatchObject({
      code: "invalid_credential",
    });
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
    // SQL withholds the key, so they verify the database, not the proxy:
    // deleting the proxy's elevation check broke none of them.
    //
    // This one feeds a deliberately malformed resolution: publishable scope
    // carrying a secret key, which `resolve_sandbox_credential` will not
    // produce today. If a regressed CASE expression or a hand-written call site
    // ever does produce it, the proxy must still refuse. `Resolution` no longer
    // ADMITS the pairing, `scope` and `secretKey` being one discriminated pair,
    // so the cast is the point: it reaches past the type to check that the
    // runtime still refuses a row the compiler would have caught.
    const deps = await makeDeps({
      resolve: () =>
        Promise.resolve({
          ...ok("publishable"),
          secretKey: REAL_SECRET,
        } as unknown as Resolution),
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
      // The positive assertion FIRST. `not.toContain` over a stringified array
      // is satisfied by `[]`, so without this the flagship leak guard stayed
      // green for a proxy that forwarded nothing at all. It could not tell a
      // leak-free forward from a total refusal.
      expect(upstreamCalls).toHaveLength(1);
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
    // normalized one. The origin must not see a different path than we judged.
    expect(upstreamCalls).toHaveLength(1);
    expect(new URL(upstreamCalls[0]!.url).pathname).toBe("/rest/v1/secrets");
  });

  it("refuses an unknown path before checking anything else", async () => {
    const res = await handleProxyRequest(req("/admin"), await makeDeps());
    // No credential gives 401, not 404: which paths exist is not enumerable by
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

// ─────────────────────────────────────────────────────────────────────────────
// Regressions from the 2026-08-29 review. Each block names the property that
// was not holding, not the change that made it hold.

describe("the member token in a query string", () => {
  it("never reaches upstream on a non-realtime path", async () => {
    // `target.search = url.search` copies the query verbatim, and the rewrite
    // used to be gated on realtime, so a REST request carrying `?apikey=`
    // handed the member's token to Supabase inside a URL, where it lands in
    // their access logs. The header token is what authenticates; the query
    // parameter is ignored for auth and rewritten regardless.
    const url = `https://${HOST_OK}/rest/v1/notes?select=*&apikey=${SEC}`;
    await handleProxyRequest(
      new Request(url, {
        headers: { apikey: SEC, "user-agent": CLI_UA },
      }),
      await makeDeps(),
    );
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0]!.url).not.toContain(SEC);
    expect(upstreamCalls[0]!.url).toContain(REAL_SECRET);
  });

  it("never reaches upstream under a differently-cased parameter name", async () => {
    // `URLSearchParams.has("apikey")` is byte-for-byte, so `?APIKEY=` slipped
    // past the one rewrite that did exist.
    const url = `https://${HOST_OK}/realtime/v1/websocket?APIKEY=${PUB}&vsn=1.0.0`;
    await handleProxyRequest(
      new Request(url, { headers: { "user-agent": CLI_UA } }),
      await makeDeps(),
    );
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0]!.url).not.toContain(PUB);
    expect(upstreamCalls[0]!.url).toContain(REAL_PUBLISHABLE);
  });

  it("is accepted as a realtime credential in any case", async () => {
    const url = `https://${HOST_OK}/realtime/v1/websocket?APIKEY=${PUB}`;
    const res = await handleProxyRequest(
      new Request(url, { headers: { "user-agent": CLI_UA } }),
      await makeDeps(),
    );
    expect(res.status).toBe(200);
  });
});

describe("CORS", () => {
  function preflight(path: string) {
    return new Request(`https://${HOST_OK}${path}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://team.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "apikey,authorization,content-type",
        "user-agent": BROWSER_UA,
      },
    });
  }

  it("answers a preflight, which cannot carry a credential", async () => {
    // The browser strips `apikey` and `Authorization` from a preflight by
    // design, so the credential check refused every one of them. And since
    // `apikey` makes every supabase-js call preflighted, that was every
    // cross-origin browser request. Real Supabase answers its own preflights,
    // so the same code worked in production and failed here.
    const res = await handleProxyRequest(
      preflight("/rest/v1/notes"),
      await makeDeps(),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")).toContain("apikey");
    expect(upstreamCalls).toEqual([]);
  });

  it("answers a preflight uniformly, disclosing nothing about hosts or paths", async () => {
    // No token was presented, so there is nothing yet to be right or wrong
    // about. Answering identically is what keeps it from being an oracle.
    const deps = await makeDeps();
    const shapes = await Promise.all(
      ["/rest/v1/notes", "/nope/v1/x"].map(async (p) => {
        const res = await handleProxyRequest(preflight(p), deps);
        return `${res.status}|${res.headers.get("access-control-allow-origin")}`;
      }),
    );
    expect(new Set(shapes).size).toBe(1);
    const otherHost = await handleProxyRequest(
      new Request("https://unknown-sandbox.devdogsuga.org/rest/v1/notes", {
        method: "OPTIONS",
        headers: {
          origin: "https://team.example.com",
          "access-control-request-method": "GET",
          "user-agent": BROWSER_UA,
        },
      }),
      deps,
    );
    expect(otherHost.status).toBe(204);
  });

  it("does not intercept a non-preflight OPTIONS", async () => {
    // PostgREST answers OPTIONS on a table. Only a real preflight, meaning
    // Origin plus Access-Control-Request-Method, is short-circuited.
    await handleProxyRequest(
      req("/rest/v1/notes", { token: PUB, method: "OPTIONS" }),
      await makeDeps(),
    );
    expect(upstreamCalls).toHaveLength(1);
  });

  it("puts the named error code within reach of a browser", async () => {
    // Without an Access-Control-Allow-Origin on the ERROR, the browser reports
    // an opaque CORS failure and the named `code` never reaches the console.
    const res = await handleProxyRequest(
      new Request(`https://${HOST_OK}/rest/v1/notes`, {
        headers: {
          origin: "https://team.example.com",
          "user-agent": BROWSER_UA,
        },
      }),
      await makeDeps(),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("a WebSocket handshake", () => {
  it("is returned unreconstructed", async () => {
    // `new Response` rejects any status outside 200-599, so rebuilding a 101
    // threw RangeError. That throw sat outside the try around the upstream
    // fetch, so it escaped the handler and Cloudflare served a 1101 with no
    // audit row. The `webSocket` handle would not have survived the copy
    // either.
    const handshake = {
      status: 101,
      webSocket: { accept() {} },
      headers: new Headers(),
    } as unknown as Response;
    const res = await handleProxyRequest(
      new Request(`https://${HOST_OK}/realtime/v1/websocket?apikey=${PUB}`, {
        headers: { upgrade: "websocket", "user-agent": CLI_UA },
      }),
      await makeDeps({ fetchUpstream: () => Promise.resolve(handshake) }),
    );
    expect(res).toBe(handshake);
    expect(res.status).toBe(101);
  });

  it("carries the member token in Sec-WebSocket-Protocol as a credential", async () => {
    // A browser `new WebSocket(url, ['dd_publishable_...'])` sets no headers,
    // which is the whole reason this carve-out exists. Yet the header was only
    // ever REWRITTEN on the way out, never READ on the way in, so the handshake
    // it was written for was answered 401.
    const res = await handleProxyRequest(
      new Request(`https://${HOST_OK}/realtime/v1/websocket`, {
        headers: {
          "sec-websocket-protocol": `phoenix, ${PUB}`,
          "user-agent": CLI_UA,
        },
      }),
      await makeDeps(),
    );
    expect(res.status).toBe(200);
    expect(upstreamCalls).toHaveLength(1);
    const proto = upstreamCalls[0]!.headers["sec-websocket-protocol"]!;
    expect(proto).toContain(REAL_PUBLISHABLE);
    expect(proto).not.toContain(PUB);
  });

  it("does not inject the project key into a non-realtime request", async () => {
    // The substitution ran on EVERY path class and matched a bare `dd_`
    // prefix, so a plain REST request with any `dd_`-ish subprotocol had the
    // real project key written into a header. Off realtime nothing is
    // substituted at all now, so an ordinary subprotocol travels untouched.
    await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        headers: { "sec-websocket-protocol": "phoenix, dd_anything_at_all" },
      }),
      await makeDeps(),
    );
    expect(upstreamCalls).toHaveLength(1);
    const proto = upstreamCalls[0]!.headers["sec-websocket-protocol"]!;
    expect(proto).toBe("phoenix, dd_anything_at_all");
    expect(proto).not.toContain(REAL_PUBLISHABLE);
    expect(proto).not.toContain(REAL_SECRET);
  });

  it("drops a real member token from a non-realtime subprotocol", async () => {
    // It is a credential, so forwarding it is a leak whatever the path class.
    // Dropped rather than substituted: off realtime the header means nothing
    // to upstream, and inventing a key for it would be the old bug again.
    await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        headers: { "sec-websocket-protocol": `phoenix, ${SEC}` },
      }),
      await makeDeps(),
    );
    expect(upstreamCalls).toHaveLength(1);
    const proto = upstreamCalls[0]!.headers["sec-websocket-protocol"]!;
    expect(proto).toBe("phoenix");
    expect(JSON.stringify(upstreamCalls)).not.toContain(SEC);
  });
});

describe("a platform that cannot be asked", () => {
  it("is a 503 with a retry hint, not a permanent 410", async () => {
    // Folded into `unknown_host`, an outage told every member on every host
    // "No sandbox environment answers to this hostname", the same words used
    // for a hostname that never existed, and 410 means permanently gone. The
    // proxy token carries a 90-day exp, so this is a scheduled event.
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: PUB }),
      await makeDeps({
        resolve: () => Promise.resolve({ outcome: "lookup_failed" }),
      }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      code: string;
      retryAfterSeconds: number;
    };
    expect(body.code).toBe("platform_unavailable");
    expect(body.retryAfterSeconds).toBe(30);
    expect(upstreamCalls).toEqual([]);
  });

  it("is distinguishable from a genuinely unknown host", async () => {
    const unknown = await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        host: "nope-sandbox.devdogsuga.org",
      }),
      await makeDeps(),
    );
    expect(unknown.status).toBe(410);
    expect(((await unknown.json()) as { code: string }).code).toBe(
      "unknown_environment",
    );
  });
});

describe("an incomplete credential", () => {
  it("is refused rather than downgraded", async () => {
    // A secret scope whose vault row is gone used to fall back to the
    // publishable key: the member's requests then ran as `anon`, so they saw
    // RLS denials on a token meant to bypass RLS with nothing in the log
    // saying why. `Resolution` no longer admits the pairing, and this is the
    // runtime half.
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: SEC }),
      await makeDeps({
        resolve: () => Promise.resolve({ outcome: "credential_unavailable" }),
      }),
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe(
      "credential_unavailable",
    );
    expect(upstreamCalls).toEqual([]);
  });

  it("does not let an unusable upstream address escape as an exception", async () => {
    // `new URL(upstreamUrl)` sat outside every try, so a bad column threw
    // TypeError past the handler and surfaced as a Cloudflare 1101.
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: PUB }),
      await makeDeps({
        resolve: () =>
          Promise.resolve({ ...ok("publishable"), upstreamUrl: "not a url" }),
      }),
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe(
      "credential_unavailable",
    );
  });
});

describe("a broken session", () => {
  it("is refused rather than answered as anon", async () => {
    // `Bearer ${userJwt ?? upstreamKey}` substituted the PROJECT KEY for a
    // bearer it could not parse, so an expired or corrupted session got a 200
    // as `anon` where real Supabase answers 401. A sandbox succeeding where
    // production fails is the one outcome this proxy exists to prevent.
    const res = await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        headers: { authorization: "Bearer totally-invalid-session" },
      }),
      await makeDeps(),
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe(
      "invalid_session",
    );
    expect(upstreamCalls).toEqual([]);
    expect(logged).toEqual([
      { credentialId: "cred-pub", status: 401, path: "/rest/v1/notes" },
    ]);
  });

  it("still forwards a well-formed session untouched", async () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl";
    await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        headers: { authorization: `Bearer ${jwt}` },
      }),
      await makeDeps(),
    );
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0]!.headers.authorization).toBe(`Bearer ${jwt}`);
    expect(upstreamCalls[0]!.headers.apikey).toBe(REAL_PUBLISHABLE);
  });
});

describe("the response path", () => {
  it("keeps the OAuth return leg pointing at the proxy", async () => {
    // With `redirect: "manual"` the client follows this Location itself. The
    // project origin is buried in `redirect_uri`, so rewriting only the URL's
    // own origin would still send the callback, and the session cookie it sets,
    // to a domain this proxy never sees, where revoking the member token stops
    // nothing.
    const res = await handleProxyRequest(
      req("/auth/v1/authorize?provider=github", { token: PUB }),
      await makeDeps({
        fetchUpstream: () =>
          Promise.resolve(
            new Response(null, {
              status: 302,
              headers: {
                location:
                  "https://github.com/login/oauth/authorize?redirect_uri=https%3A%2F%2Frefaaa.supabase.co%2Fauth%2Fv1%2Fcallback",
              },
            }),
          ),
      }),
    );
    const location = res.headers.get("location")!;
    expect(location).not.toContain("refaaa.supabase.co");
    expect(location).toContain(encodeURIComponent(`https://${HOST_OK}`));
  });

  it("rewrites a Location that points straight at the project", async () => {
    const res = await handleProxyRequest(
      req("/auth/v1/verify", { token: PUB }),
      await makeDeps({
        fetchUpstream: () =>
          Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: `${UPSTREAM}/auth/v1/callback?code=abc` },
            }),
          ),
      }),
    );
    expect(res.headers.get("location")).toBe(
      `https://${HOST_OK}/auth/v1/callback?code=abc`,
    );
  });

  it("drops a cookie Domain the browser would never send back here", async () => {
    const res = await handleProxyRequest(
      req("/auth/v1/token", { token: PUB }),
      await makeDeps({
        fetchUpstream: () =>
          Promise.resolve(
            new Response("{}", {
              status: 200,
              headers: {
                "set-cookie":
                  "sb-refaaa-auth-token=xyz; Domain=refaaa.supabase.co; Path=/; HttpOnly",
              },
            }),
          ),
      }),
    );
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).not.toContain("refaaa.supabase.co");
    expect(cookie).toContain("sb-refaaa-auth-token=xyz");
    expect(cookie).toContain("HttpOnly");
  });

  it("still strips the origin-describing headers", async () => {
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: PUB }),
      await makeDeps({
        fetchUpstream: () =>
          Promise.resolve(
            new Response("{}", {
              headers: {
                "sb-gateway-version": "1",
                "x-sb-error-code": "PGRST",
              },
            }),
          ),
      }),
    );
    expect(res.headers.get("sb-gateway-version")).toBeNull();
    expect(res.headers.get("x-sb-error-code")).toBeNull();
  });
});

describe("the body cap", () => {
  /** A body that reports how much of it was actually pulled. */
  function countingBody(chunkSize: number, chunks: number) {
    const state = { pulled: 0 };
    const stream = new ReadableStream({
      pull(controller) {
        if (state.pulled >= chunks) {
          controller.close();
          return;
        }
        state.pulled += 1;
        controller.enqueue(new Uint8Array(chunkSize));
      },
    });
    return { stream, state };
  }

  it("stops reading instead of buffering the whole body first", async () => {
    // `await request.arrayBuffer()` measured AFTER allocating, which makes the
    // cap a statement about what gets forwarded rather than about what gets
    // allocated: a 500 MB chunked POST was entirely in memory before the
    // comparison ran, against a shared 128 MB isolate.
    const chunk = 256 * 1024;
    const { stream, state } = countingBody(chunk, 400); // 100 MiB if drained
    const res = await handleProxyRequest(
      new Request(`https://${HOST_OK}/rest/v1/notes`, {
        method: "POST",
        body: stream,
        headers: { apikey: PUB, "user-agent": CLI_UA },
        // @ts-expect-error -- undici requires this for a stream body; it is not
        // in workerd's RequestInit.
        duplex: "half",
      }),
      await makeDeps(),
    );
    expect(res.status).toBe(413);
    expect(upstreamCalls).toEqual([]);
    // Enough to reach the cap, plus the one chunk that breaches it, plus the
    // one the stream keeps queued ahead of the reader. Bounded by the cap
    // either way. The point is that it is not 400, which is what
    // `arrayBuffer()` would have pulled before measuring anything.
    expect(state.pulled).toBeLessThanOrEqual(MAX_BODY_BYTES / chunk + 2);
    expect(state.pulled * chunk).toBeLessThan(2 * MAX_BODY_BYTES);
  });

  it("forwards a body under the cap intact", async () => {
    await handleProxyRequest(
      req("/rest/v1/notes", {
        token: PUB,
        method: "POST",
        body: new Uint8Array(1024),
      }),
      await makeDeps(),
    );
    expect(upstreamCalls).toHaveLength(1);
  });
});

describe("deferred audit writes", () => {
  it("do not fail a request that already succeeded", async () => {
    // index.ts documents this property; the `defer` double used to drop the
    // promise unexecuted, so nothing covered it.
    const res = await handleProxyRequest(
      req("/rest/v1/notes", { token: PUB }),
      await makeDeps({ log: () => Promise.reject(new Error("audit down")) }),
    );
    expect(res.status).toBe(200);
    expect(deferred).toHaveLength(1);
    await expect(deferred[0]).rejects.toThrow("audit down");
  });
});
