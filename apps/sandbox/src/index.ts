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

/** An absolute http(s) URL, which is the only thing `fetch` can be pointed at. */
function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Turn one RPC row into a Resolution.
 *
 * Every field the `ok` branch promises is CHECKED here, not asserted. The
 * previous shape was eight `!` assertions, which laundered a null column into a
 * value the type system then swore was a string: a null `publishable_key` built
 * a perfectly well-typed `ok` resolution and the proxy sent the literal string
 * "undefined" upstream as an apikey, and a null `upstream_url` threw
 * `TypeError: Invalid URL` somewhere with no try around it. Both are answers
 * this function owes the caller, so it gives them a named outcome instead.
 */
function toResolution(row: ResolveRow | undefined): Resolution {
  if (!row) return { outcome: "unknown_host" };

  switch (row.outcome) {
    case "ok": {
      // Destructured so the guard below NARROWS each one to `string`. Written
      // as `!row.credential_id` against `row` it would not, and every field
      // would need the `!` this function exists to remove.
      const {
        credential_id,
        environment_id,
        user_id,
        project_ref,
        upstream_url,
        publishable_key,
      } = row;

      if (
        !credential_id ||
        !environment_id ||
        !user_id ||
        !project_ref ||
        !upstream_url ||
        !publishable_key ||
        !isHttpUrl(upstream_url)
      ) {
        console.error(
          "[sandbox] resolve returned an `ok` row missing a required field",
        );
        return { outcome: "credential_unavailable" };
      }

      const base = {
        outcome: "ok" as const,
        credentialId: credential_id,
        environmentId: environment_id,
        userId: user_id,
        projectRef: project_ref,
        upstreamUrl: upstream_url,
        publishableKey: publishable_key,
        environmentName: row.environment_name,
      };

      if (row.scope === "secret") {
        // A secret scope WITHOUT a secret key is the vault row being gone while
        // the scope column still says `secret`. Refused rather than downgraded:
        // running such a member as `anon` gives them RLS denials on a token
        // meant to bypass RLS, and nothing in the log says why.
        if (!row.secret_key) {
          console.error(
            "[sandbox] secret-scoped credential resolved with no secret key",
          );
          return { outcome: "credential_unavailable" };
        }
        return { ...base, scope: "secret", secretKey: row.secret_key };
      }

      if (row.scope === "publishable") {
        // Any secret key on a publishable row is discarded here, so it cannot
        // be reached downstream even by mistake.
        return { ...base, scope: "publishable", secretKey: null };
      }

      console.error(`[sandbox] resolve returned unknown scope: ${row.scope}`);
      return { outcome: "credential_unavailable" };
    }
    case "retired_host":
      return { outcome: "retired_host", environmentName: row.environment_name };
    case "bad_credential":
      return { outcome: "bad_credential" };
    default:
      // An outcome this Worker does not recognize is OUR problem -- a database
      // ahead of a deploy -- not the member's. It used to fall into
      // `unknown_host`, telling them their environment was permanently gone.
      console.error(
        `[sandbox] resolve returned unknown outcome: ${row.outcome}`,
      );
      return { outcome: "lookup_failed" };
  }
}

function makeDeps(env: Env, ctx: ExecutionContext): ProxyDeps {
  return {
    async resolve(hostname, tokenHash) {
      let res: Response;
      try {
        res = await fetch(
          `${env.PLATFORM_REST_URL}/rpc/resolve_sandbox_credential`,
          {
            method: "POST",
            headers: platformHeaders(env),
            body: JSON.stringify({ hostname, token_hash: tokenHash }),
          },
        );
      } catch (error) {
        console.error("[sandbox] resolve request failed:", error);
        return { outcome: "lookup_failed" };
      }

      if (!res.ok) {
        // A platform outage must not be indistinguishable from a bad token: a
        // 401 would send members hunting for a credential problem that does not
        // exist. It must not read as a MISSING ENVIRONMENT either, which is
        // what folding it into `unknown_host` did -- an expired proxy token
        // then told every member on every host that their sandbox was gone for
        // good. `lookup_failed` is a 503 with a retry hint.
        console.error(
          `[sandbox] resolve failed: ${res.status} ${await res.text()}`,
        );
        return { outcome: "lookup_failed" };
      }

      let rows: ResolveRow[];
      try {
        rows = (await res.json()) as ResolveRow[];
      } catch (error) {
        // A gateway returning an HTML 502 with a 200 status, or any other
        // non-JSON body. `res.ok` alone did not cover it and the throw escaped.
        console.error("[sandbox] resolve returned unparseable JSON:", error);
        return { outcome: "lookup_failed" };
      }

      if (!Array.isArray(rows)) {
        console.error("[sandbox] resolve returned a non-array body");
        return { outcome: "lookup_failed" };
      }

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

function jsonResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
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
      return jsonResponse(
        503,
        "proxy_misconfigured",
        "This proxy is not configured.",
      );
    }

    try {
      return await handleProxyRequest(request, makeDeps(env, ctx));
    } catch (error) {
      // The last line. Anything that throws past `handleProxyRequest` used to
      // surface as a Cloudflare 1101 interstitial: no `code` for a client to
      // branch on, no audit row, and nothing in it that tells a member whether
      // to retry. A named 500 is worth more than a stack trace nobody sees.
      console.error("[sandbox] unhandled error:", error);
      return jsonResponse(
        500,
        "proxy_error",
        "The sandbox proxy failed to handle this request. This is our fault; please report it.",
      );
    }
  },
};
