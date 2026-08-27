import { classifyPath, usesQueryParamKey } from "./paths";
import {
  extractCredential,
  hashToken,
  looksLikeBrowser,
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

export type Resolution =
  | { outcome: "unknown_host" }
  | { outcome: "retired_host"; environmentName: string | null }
  | { outcome: "bad_credential" }
  | {
      outcome: "ok";
      credentialId: string;
      environmentId: string;
      userId: string;
      projectRef: string;
      upstreamUrl: string;
      publishableKey: string;
      secretKey: string | null;
      scope: "publishable" | "secret";
      environmentName: string | null;
    };

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
    },
  });
}

export async function handleProxyRequest(
  request: Request,
  deps: ProxyDeps,
): Promise<Response> {
  const url = new URL(request.url);

  // `url.pathname` is normalized by the URL parser: `..` and `.` segments are
  // resolved before we ever see it. Classifying the raw request target instead
  // would let `/storage/v1/../../rest/v1/...` be judged as storage while the
  // origin treats it as REST.
  const kind = classifyPath(url.pathname);

  const { token, userJwt } = extractCredential(
    request,
    url,
    usesQueryParamKey(kind),
  );

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
  }

  const elevated = resolved.scope === "secret";

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

  if (kind === "unknown") {
    deps.defer(
      deps.log(resolved.credentialId, request.method, url.pathname, 404),
    );
    return jsonError(404, "unknown_path", "No such Supabase service.");
  }

  // A secret-scoped credential resolves with the key; a publishable one
  // resolves with `secretKey: null` and cannot be elevated here by any means.
  // Belt and braces over the SQL, which already refuses it.
  const upstreamKey = elevated
    ? (resolved.secretKey ?? resolved.publishableKey)
    : resolved.publishableKey;

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

  return stripUpstreamHeaders(response);
}

async function capBody(
  request: Request,
): Promise<{ ok: true; body: ArrayBuffer | null } | { ok: false }> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { ok: true, body: null };
  }
  // Content-Length is a claim, not a fact, so it is a fast path only -- the
  // real enforcement is measuring what actually arrived.
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) return { ok: false };

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) return { ok: false };
  return { ok: true, body };
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

  // Realtime carries the key in the query string. Rewriting the header set and
  // forgetting this would send the member token to Supabase in a URL.
  if (usesQueryParamKey(kind) && target.searchParams.has("apikey")) {
    target.searchParams.set("apikey", upstreamKey);
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

  // Sec-WebSocket-Protocol carries the token for realtime handshakes.
  const protocols = request.headers.get("sec-websocket-protocol");
  if (protocols) {
    headers.set(
      "sec-websocket-protocol",
      protocols
        .split(",")
        .map((p) => p.trim())
        .map((p) => (p.startsWith("dd_") ? upstreamKey : p))
        .join(", "),
    );
  }

  return new Request(target.toString(), {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });
}

/**
 * Upstream response headers that should not be relayed verbatim.
 *
 * Storage responses are explicitly NOT rewritten -- a signed URL points at the
 * real project and must keep working -- so this is confined to headers that
 * describe the origin rather than the content.
 */
function stripUpstreamHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("sb-gateway-version");
  headers.delete("x-sb-error-code");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Exported for the test suite's benefit only. */
export const __internal = { buildUpstreamRequest, capBody, SECRET_PREFIX };
