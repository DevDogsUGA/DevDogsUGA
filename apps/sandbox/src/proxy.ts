import { classifyPath, usesRealtimeCarriers } from "./paths";
import {
  apikeyParamNames,
  extractCredential,
  isMemberToken,
  hashToken,
  looksLikeBrowser,
  protocolEntries,
  SECRET_PREFIX,
} from "./token";

/**
 * The proxy, as one function over injected dependencies.
 *
 * Everything the Worker entry point does beyond this is wiring. Keeping the
 * decisions here means the security properties are testable directly against a
 * mock upstream rather than only through a deployed Worker -- and the security
 * properties are the reason this component exists.
 */

/**
 * The resolved credential.
 *
 * `scope` and `secretKey` are ONE discriminated pair rather than two
 * independent fields, which is what makes "a secret-scoped credential without a
 * secret key" unrepresentable rather than merely unwanted. It used to be
 * representable, and the proxy answered it with
 * `resolved.secretKey ?? resolved.publishableKey` -- a silent downgrade to
 * `anon` for a token whose whole purpose is bypassing RLS, indistinguishable in
 * the audit log from a policy bug. `toResolution` now refuses the row instead,
 * and this shape is what stops the fallback from being rewritten later.
 */
export type Resolution =
  | { outcome: "unknown_host" }
  | { outcome: "retired_host"; environmentName: string | null }
  | { outcome: "bad_credential" }
  /** The platform could not be asked. Distinct from "the answer was no." */
  | { outcome: "lookup_failed" }
  /** The platform answered `ok` with a row the proxy cannot safely use. */
  | { outcome: "credential_unavailable" }
  | ({
      outcome: "ok";
      credentialId: string;
      environmentId: string;
      userId: string;
      projectRef: string;
      upstreamUrl: string;
      publishableKey: string;
      environmentName: string | null;
    } & (
      | { scope: "publishable"; secretKey: null }
      | { scope: "secret"; secretKey: string }
    ));

export interface ProxyDeps {
  resolve(hostname: string, tokenHash: string): Promise<Resolution>;
  log(
    credentialId: string,
    method: string,
    path: string,
    status: number,
  ): Promise<void>;
  fetchUpstream(request: Request): Promise<Response>;
  /** Deferred work; `ctx.waitUntil` in production, immediate in tests. */
  defer(work: Promise<unknown>): void;
}

/** 1 MiB. Generous for a REST call, small enough not to be a memory lever. */
export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Headers that must never reach upstream.
 *
 * `apikey` and `authorization` are rewritten rather than dropped, so they are
 * not here. These are the ones with no upstream meaning:
 *
 *   - `x-devdogs-*` is ours. An earlier design used `x-devdogs-role: secret` to
 *     request elevation; authority now follows the credential, so the header is
 *     dead. Stripping it is what makes that true rather than merely intended --
 *     a header nobody reads is one somebody will eventually start reading.
 *   - `cf-*` and `x-forwarded-*` describe our edge, not the client's request,
 *     and forwarding them tells upstream things about our infrastructure.
 */
const STRIPPED_PREFIXES = ["x-devdogs-", "cf-", "x-forwarded-", "x-real-ip"];

/**
 * What a browser is told it may send.
 *
 * Answered here rather than forwarded, because a preflight is the one request
 * that CANNOT carry a credential -- the browser strips `apikey` and
 * `Authorization` from it by design -- so the credential check would refuse
 * every one of them. It did, and that broke every cross-origin browser request
 * against a sandbox while the identical code worked against real Supabase,
 * which answers its own preflights.
 *
 * Uniform for every path and every host, so answering one discloses nothing:
 * no token was presented, so there is nothing yet to be right or wrong about.
 * The request that follows still goes through the whole credential and
 * allowlist path.
 */
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD";
const DEFAULT_ALLOWED_HEADERS =
  "authorization, apikey, content-type, x-client-info, prefer, range, accept-profile, content-profile";

function isPreflight(request: Request): boolean {
  return (
    request.method === "OPTIONS" &&
    request.headers.get("origin") !== null &&
    request.headers.get("access-control-request-method") !== null
  );
}

function preflightResponse(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": ALLOWED_METHODS,
      // Echoed, so a client sending a header we did not think of is told yes
      // by the same rule upstream would have used rather than by our guess.
      "access-control-allow-headers":
        request.headers.get("access-control-request-headers") ??
        DEFAULT_ALLOWED_HEADERS,
      "access-control-max-age": "86400",
      vary: "Origin, Access-Control-Request-Headers",
      "cache-control": "no-store",
    },
  });
}

function jsonError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ code, message, ...extra }), {
    status,
    headers: {
      "content-type": "application/json",
      // A proxy error is about this request's credentials, never cacheable.
      "cache-control": "no-store",
      // Without this the browser reports a CORS failure and the named `code`
      // below -- the whole point of naming them -- never reaches the console.
      "access-control-allow-origin": "*",
    },
  });
}

export async function handleProxyRequest(
  request: Request,
  deps: ProxyDeps,
): Promise<Response> {
  // Before anything that needs a credential, because a preflight carries none.
  if (isPreflight(request)) return preflightResponse(request);

  const url = new URL(request.url);

  // `url.pathname` is normalized by the URL parser: `..` and `.` segments are
  // resolved before we ever see it. Classifying the raw request target instead
  // would let `/storage/v1/../../rest/v1/...` be judged as storage while the
  // origin treats it as REST.
  const kind = classifyPath(url.pathname);
  const realtime = usesRealtimeCarriers(kind);

  const { token, userJwt, malformedBearer } = extractCredential(request, url, {
    queryParam: realtime,
    protocol: realtime,
  });

  // Credentials before routing. An unknown path from an unauthenticated caller
  // is answered the same way as an unknown path from a member -- there is no
  // reason to let anybody map which services exist without presenting a token.
  if (!token) {
    return jsonError(
      401,
      "no_credential",
      "This sandbox is reached with a DevDogs member token. Run `pnpm devtools link --team <slug>` to get one.",
    );
  }

  const resolved = await deps.resolve(url.hostname, await hashToken(token));

  switch (resolved.outcome) {
    case "unknown_host":
      return jsonError(
        410,
        "unknown_environment",
        "No sandbox environment answers to this hostname.",
      );
    case "retired_host":
      // 410 rather than 404, and named, because the likely reader is a stale
      // .env or an already-installed build. "Gone" plus the environment's name
      // is a diagnosis; "not found" looks like a network fault.
      return jsonError(
        410,
        "environment_retired",
        `The sandbox environment ${resolved.environmentName ?? "for this hostname"} has ended. Its hostname is retired and will never be reassigned.`,
      );
    case "bad_credential":
      // Deliberately one answer for "no such token", "disabled", "revoked" and
      // "belongs to another environment". Distinguishing them would turn the
      // proxy into an oracle for which tokens exist and where they belong.
      return jsonError(
        401,
        "invalid_credential",
        "This member token is not valid for this environment.",
      );
    case "lookup_failed":
      // NOT a 410. An outage used to be folded into `unknown_host`, so the
      // whole fleet answered "no sandbox environment answers to this hostname"
      // -- permanent, per RFC, and the exact wording used for a hostname that
      // never existed -- whenever the platform blinked or the 90-day proxy
      // token expired. A retry hint and a 503 say the true thing.
      return jsonError(
        503,
        "platform_unavailable",
        "The sandbox platform could not be reached to check this token. This is our fault, not your token's; try again shortly.",
        { retryAfterSeconds: 30 },
      );
    case "credential_unavailable":
      return jsonError(
        503,
        "credential_unavailable",
        "This environment's credentials are incomplete and the proxy will not guess at them. Please report this.",
      );
  }

  // Total, because `scope` and `secretKey` are one discriminated pair. There is
  // no `?? publishableKey` fallback to write here any more.
  const elevated = resolved.scope === "secret";
  const upstreamKey = elevated ? resolved.secretKey : resolved.publishableKey;

  // Mirrors upstream, which refuses secret keys from browsers unconditionally.
  // Checked BEFORE the allowlist and before any upstream contact, so a secret
  // token from a browser never reaches Supabase at all.
  if (elevated && looksLikeBrowser(request.headers.get("user-agent"))) {
    deps.defer(
      deps.log(resolved.credentialId, request.method, url.pathname, 401),
    );
    return jsonError(
      401,
      "secret_key_in_browser",
      "Secret keys cannot be used from a browser. Use the publishable token in client code, exactly as you would upstream.",
    );
  }

  // An `Authorization` bearer that is neither a member token nor a JWT is a
  // broken session, and upstream would say so. Substituting the project key for
  // it -- which is what happens when this falls through -- answers 200 as
  // `anon` instead, so the sandbox succeeds where production fails.
  if (malformedBearer) {
    deps.defer(
      deps.log(resolved.credentialId, request.method, url.pathname, 401),
    );
    return jsonError(
      401,
      "invalid_session",
      "The Authorization header is neither a member token nor a session JWT. Clear the stored session and sign in again.",
    );
  }

  if (kind === "unknown") {
    deps.defer(
      deps.log(resolved.credentialId, request.method, url.pathname, 404),
    );
    return jsonError(404, "unknown_path", "No such Supabase service.");
  }

  let upstreamOrigin: string;
  try {
    upstreamOrigin = new URL(resolved.upstreamUrl).origin;
  } catch {
    // `toResolution` validates this, so reaching here means a caller built a
    // Resolution by hand. Answered rather than thrown: `new URL` throwing here
    // used to escape the handler entirely and surface as a Cloudflare 1101.
    return jsonError(
      503,
      "credential_unavailable",
      "This environment's upstream address is not a usable URL. Please report this.",
    );
  }

  const capped = await capBody(request);
  if (!capped.ok) {
    deps.defer(
      deps.log(resolved.credentialId, request.method, url.pathname, 413),
    );
    return jsonError(413, "body_too_large", "Request body exceeds 1 MiB.");
  }

  const upstream = buildUpstreamRequest({
    request,
    url,
    kind,
    upstreamUrl: resolved.upstreamUrl,
    upstreamKey,
    userJwt,
    body: capped.body,
  });

  let response: Response;
  try {
    response = await deps.fetchUpstream(upstream);
  } catch {
    // The Worker never concludes "paused" on its own -- a transient upstream
    // error would otherwise orphan a healthy environment. It reports, and the
    // platform's reconcile decides.
    deps.defer(
      deps.log(resolved.credentialId, request.method, url.pathname, 503),
    );
    return jsonError(
      503,
      "upstream_unreachable",
      "The sandbox project did not respond. If it was paused it is being restored, which takes about four minutes.",
      { retryAfterSeconds: 240 },
    );
  }

  deps.defer(
    deps.log(
      resolved.credentialId,
      request.method,
      url.pathname,
      response.status,
    ),
  );

  return stripUpstreamHeaders(response, upstreamOrigin, url.origin);
}

/**
 * Read the body, enforcing the cap AS IT ARRIVES.
 *
 * The previous shape was `await request.arrayBuffer()` followed by a
 * `byteLength` comparison, which is a statement about what gets FORWARDED, not
 * about what gets ALLOCATED: a 500 MB chunked POST was fully in memory by the
 * time the comparison ran. workerd's isolate limit is 128 MB and the isolate is
 * shared, so that is a lever on co-tenant requests, not just on this one.
 *
 * Content-Length remains a fast path only -- it is a claim, not a fact -- and
 * the streaming loop below is the enforcement.
 */
async function capBody(
  request: Request,
): Promise<{ ok: true; body: ArrayBuffer | null } | { ok: false }> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { ok: true, body: null };
  }
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) return { ok: false };
  if (!request.body) return { ok: true, body: null };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      // Stop pulling. Everything read so far is dropped with the chunk array.
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.byteLength;
  }
  return { ok: true, body: body.buffer };
}

function buildUpstreamRequest(opts: {
  request: Request;
  url: URL;
  kind: ReturnType<typeof classifyPath>;
  upstreamUrl: string;
  upstreamKey: string;
  userJwt: string | null;
  body: ArrayBuffer | null;
}): Request {
  const { request, url, kind, upstreamUrl, upstreamKey, userJwt, body } = opts;

  const target = new URL(upstreamUrl);
  target.pathname = url.pathname;
  target.search = url.search;

  // EVERY `apikey` parameter, in any case, on EVERY path class.
  //
  // This used to be gated on realtime and spelled `has("apikey")`, which left
  // two ways for a member token to reach Supabase inside a URL:
  // `/rest/v1/notes?apikey=dd_secret_…` (not realtime, so no rewrite) and
  // `?APIKEY=` (realtime, but the wrong case). The query string is copied to
  // upstream unconditionally one line above, so the rewrite has to be
  // unconditional too.
  for (const name of apikeyParamNames(target.searchParams)) {
    target.searchParams.set(name, upstreamKey);
  }

  // Built from scratch rather than copied-then-edited. Copying means every
  // header not explicitly handled is forwarded, so the safe default inverts:
  // a new DevDogs header would reach upstream until somebody remembered it.
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (lower === "apikey" || lower === "authorization") continue;
    if (lower === "host" || lower === "content-length") continue;
    if (STRIPPED_PREFIXES.some((p) => lower.startsWith(p))) continue;
    headers.set(name, value);
  }

  headers.set("apikey", upstreamKey);
  // A user session passes through untouched for upstream to verify. With no
  // session the key goes in both places, which is what supabase-js does and
  // what makes an unauthenticated request run as `anon` rather than as anything
  // this proxy invented.
  headers.set("authorization", `Bearer ${userJwt ?? upstreamKey}`);

  // Sec-WebSocket-Protocol carries the token for realtime handshakes -- and
  // ONLY for realtime. Substituting the real key ran on every path class, so
  // `POST /rest/v1/notes` with a `dd_`-prefixed subprotocol had the project key
  // written into a header on a plain REST request. Off realtime the entry is
  // dropped instead: it is a member token, so forwarding it is a leak either
  // way. `isMemberToken` rather than a bare `dd_` prefix, so this agrees with
  // every other place that decides what a member token is.
  const protocols = protocolEntries(request);
  if (protocols.length > 0) {
    const rewritten =
      kind === "realtime"
        ? protocols.map((p) => (isMemberToken(p) ? upstreamKey : p))
        : protocols.filter((p) => !isMemberToken(p));
    if (rewritten.length > 0) {
      headers.set("sec-websocket-protocol", rewritten.join(", "));
    } else {
      headers.delete("sec-websocket-protocol");
    }
  }

  return new Request(target.toString(), {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });
}

/** Regex-escape, for building the percent-encoded origin pattern. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace the real project origin wherever it appears in a header value.
 *
 * Both literally and percent-encoded, because the OAuth case needs the second
 * form: the `Location` on `/auth/v1/authorize` points at GitHub, not at
 * Supabase, and the project origin is buried in its `redirect_uri` parameter as
 * `https%3A%2F%2F<ref>.supabase.co%2Fauth%2Fv1%2Fcallback`. Rewriting only the
 * URL's own origin would leave the return leg pointing at the project, so the
 * callback -- and the session cookie it sets -- lands on a domain this proxy
 * never sees, where revoking the member token stops nothing.
 */
function rewriteUpstreamOrigin(
  value: string,
  upstreamOrigin: string,
  proxyOrigin: string,
): string {
  const literal = value.split(upstreamOrigin).join(proxyOrigin);
  // Case-insensitive, because percent-encoding case is not normalized: a
  // producer may write `%2f` where another writes `%2F`.
  const encoded = new RegExp(
    escapeRegExp(encodeURIComponent(upstreamOrigin)),
    "gi",
  );
  return literal.replace(encoded, encodeURIComponent(proxyOrigin));
}

/**
 * Drop a `Domain` attribute that names the upstream host.
 *
 * A cookie scoped to `<ref>.supabase.co` is one the browser will not send to
 * the proxy hostname, so the session it carries is simply lost. Removing the
 * attribute lets it default to the host that served the response, which is the
 * proxy -- the only host the member ever talks to.
 */
function stripUpstreamCookieDomain(
  cookie: string,
  upstreamHost: string,
): string {
  return cookie
    .split(";")
    .filter((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return true;
      if (part.slice(0, eq).trim().toLowerCase() !== "domain") return true;
      const domain = part
        .slice(eq + 1)
        .trim()
        .toLowerCase()
        .replace(/^\./, "");
      return domain !== upstreamHost.toLowerCase();
    })
    .join(";");
}

/**
 * Upstream response headers that should not be relayed verbatim.
 *
 * Storage responses are explicitly NOT rewritten -- a signed URL points at the
 * real project and must keep working -- so the body is never touched. What IS
 * rewritten is the small set of headers that ROUTE the next request: `Location`
 * and `Set-Cookie`. The request path builds its headers from an empty `Headers`
 * because the safe default inverts; this path was a deny-list of two names,
 * which is the posture that comment rejects, and it is how the OAuth return leg
 * escaped the proxy.
 */
function stripUpstreamHeaders(
  response: Response,
  upstreamOrigin: string,
  proxyOrigin: string,
): Response {
  // A WebSocket handshake cannot be rebuilt. `new Response` rejects any status
  // outside 200-599, so reconstructing a 101 throws `RangeError` -- outside the
  // try around the upstream fetch, so it escaped the handler and Cloudflare
  // served a 1101 with no audit row. The `webSocket` handle would not survive
  // the copy either. Returned exactly as it came.
  if (response.status === 101 || response.webSocket) return response;

  const headers = new Headers(response.headers);
  headers.delete("sb-gateway-version");
  headers.delete("x-sb-error-code");

  const location = headers.get("location");
  if (location) {
    headers.set(
      "location",
      rewriteUpstreamOrigin(location, upstreamOrigin, proxyOrigin),
    );
  }

  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    const upstreamHost = new URL(upstreamOrigin).host;
    headers.delete("set-cookie");
    for (const cookie of cookies) {
      headers.append(
        "set-cookie",
        stripUpstreamCookieDomain(cookie, upstreamHost),
      );
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Exported for the test suite's benefit only. */
export const __internal = {
  buildUpstreamRequest,
  capBody,
  rewriteUpstreamOrigin,
  stripUpstreamCookieDomain,
  SECRET_PREFIX,
};
