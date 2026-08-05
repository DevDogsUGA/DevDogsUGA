import { handleProxyRequest, type ProxyDeps, type Resolution } from "./proxy";

/**
 * The Worker entry point: wiring, and nothing else.
 *
 * Every decision lives in `handleProxyRequest`, which takes its dependencies as
 * arguments so the security properties can be tested against a mock upstream
 * rather than a deployed Worker. What is left here is the two things that can
 * only exist at the edge -- the real credential lookup and the real fetch.
 */

export interface Env {
  /**
   * The platform project's PostgREST endpoint. Not the sandbox's -- this is how
   * the Worker asks the platform who a token belongs to.
   */
  PLATFORM_REST_URL: string;
  /**
   * A JWT carrying `{"role": "sandbox_proxy"}`, signed with the platform
   * project's signing key and minted at deploy time.
   *
   * NOT a Supabase secret key. `sb_secret_…` keys authorize as `service_role`
   * and cannot be bound to a custom role, so one here would hand this Worker
   * the ability to read every table in the platform database. This token
   * reaches exactly two functions.
   */
  SANDBOX_PROXY_TOKEN: string;
}

interface ResolveRow {
  outcome: string;
  credential_id: string | null;
  environment_id: string | null;
  user_id: string | null;
  project_ref: string | null;
  upstream_url: string | null;
  publishable_key: string | null;
  secret_key: string | null;
  scope: "publishable" | "secret" | null;
  environment_name: string | null;
}

function platformHeaders(env: Env): HeadersInit {
  return {
    apikey: env.SANDBOX_PROXY_TOKEN,
    Authorization: `Bearer ${env.SANDBOX_PROXY_TOKEN}`,
    "Content-Type": "application/json",
    // The functions live in `platform`, not the exposed default schema.
    "Accept-Profile": "platform",
    "Content-Profile": "platform",
  };
}

function toResolution(row: ResolveRow | undefined): Resolution {
  if (!row) return { outcome: "unknown_host" };
  switch (row.outcome) {
    case "ok":
      return {
        outcome: "ok",
        credentialId: row.credential_id!,
        environmentId: row.environment_id!,
        userId: row.user_id!,
        projectRef: row.project_ref!,
        upstreamUrl: row.upstream_url!,
        publishableKey: row.publishable_key!,
        secretKey: row.secret_key,
        scope: row.scope!,
        environmentName: row.environment_name,
      };
    case "retired_host":
      return { outcome: "retired_host", environmentName: row.environment_name };
    case "bad_credential":
      return { outcome: "bad_credential" };
    default:
      return { outcome: "unknown_host" };
  }
}

function makeDeps(env: Env, ctx: ExecutionContext): ProxyDeps {
  return {
    async resolve(hostname, tokenHash) {
      const res = await fetch(
        `${env.PLATFORM_REST_URL}/rpc/resolve_sandbox_credential`,
        {
          method: "POST",
          headers: platformHeaders(env),
          body: JSON.stringify({ hostname, token_hash: tokenHash }),
        },
      );
      if (!res.ok) {
        // A platform outage must not be indistinguishable from a bad token: a
        // 401 would send members hunting for a credential problem that does not
        // exist. Treated as unknown_host so the caller gets a 410 explaining the
        // environment could not be looked up, and the failure is loud.
        console.error(
          `[sandbox] resolve failed: ${res.status} ${await res.text()}`,
        );
        return { outcome: "unknown_host" };
      }
      const rows = (await res.json()) as ResolveRow[];
      return toResolution(rows[0]);
    },

    async log(credentialId, method, path, status) {
      const res = await fetch(
        `${env.PLATFORM_REST_URL}/rpc/log_proxy_request`,
        {
          method: "POST",
          headers: platformHeaders(env),
          body: JSON.stringify({
            credential_id: credentialId,
            method,
            path,
            status,
          }),
        },
      );
      // Logged, never thrown. A failed audit write must not fail a request that
      // already succeeded -- the alternative is an outage in the log taking the
      // whole sandbox down mid-event.
      if (!res.ok) {
        console.error(`[sandbox] log failed: ${res.status}`);
      }
    },

    fetchUpstream(request) {
      return fetch(request);
    },

    defer(work) {
      // Audit writes must not sit in the response path. `waitUntil` keeps the
      // Worker alive for them after the response is sent.
      ctx.waitUntil(
        work.catch((error: unknown) => {
          console.error("[sandbox] deferred work failed:", error);
        }),
      );
    },
  };
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Refuse to run misconfigured rather than fall back to something permissive.
    if (!env.SANDBOX_PROXY_TOKEN || !env.PLATFORM_REST_URL) {
      console.error(
        "[sandbox] missing SANDBOX_PROXY_TOKEN or PLATFORM_REST_URL",
      );
      return new Response(
        JSON.stringify({
          code: "proxy_misconfigured",
          message: "This proxy is not configured.",
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }

    return handleProxyRequest(request, makeDeps(env, ctx));
  },
};
