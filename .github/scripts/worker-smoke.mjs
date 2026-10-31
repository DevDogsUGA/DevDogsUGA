/**
 * Smoke test of a Worker VERSION that is not yet serving traffic, for
 * `deploy-worker.yaml`. This is what protects sign-in: a bad build is caught
 * here, before the traffic switch, and the live version is never touched.
 *
 * A version uploaded with `wrangler versions upload` gets no traffic. It can
 * still be reached on the Worker's real hostname by sending the
 * `Cloudflare-Workers-Version-Overrides` header, which pins that request to
 * one version. So the preview is exercised on the production-shaped route, and
 * no preview URL has to be enabled (the slides Worker, behind Cloudflare
 * Access, has none).
 *
 * The checks come from `workers.json` (the one place the hosts live): every
 * public path answers 200, the protected path redirects an anonymous visitor
 * to the sign-in prefix. With `--authorize` (the platform) it also proves the
 * OAuth hand-off that every product's sign-in depends on:
 *
 *   1. register a throwaway development-tier OAuth client on the project,
 *   2. ask `/auth/v1/oauth/authorize` for a code: it must redirect to the
 *      platform's consent page,
 *   3. the consent page must 404 without an `authorization_id`,
 *   4. delete the client (always, even when a check failed).
 *
 * Run with no `--version-id` it checks whatever is live (the post-switch
 * check and the scheduled smoke test).
 *
 * `--settle <seconds>` (the preview and the post-switch check) first waits for
 * the version to stop answering 5xx. vinext's Workers Cache stage answers an empty
 * 503 when it runs on a different build than the one that took the request
 * (build-skew protection), and for roughly 20 to 40 seconds after a traffic
 * switch edge locations disagree about which version is live, so some real
 * requests meet that 503. Measured by switching staging-platform between two
 * versions under a request loop: about one request in ten, on both versions;
 * none seen on schedule-builder. The version-pinned preview is NOT immune:
 * the staging run for d76c007d had `/dashboard/permissions` answer 503 on the
 * pinned version while the deployment was still propagating. The wait ends
 * after `stable` (20) good answers in a row, 250 ms apart, and is itself a
 * reported check, so a switch that needed it says so, and a version that never
 * settles still fails. Once settled, a page that still answers 5xx is asked
 * one more time; any page that needed that is listed in the last check.
 *
 * Environment (only for --authorize):
 *   API_URL      the Supabase project's API origin.
 *   SECRET_KEY   the project's secret key.
 *
 * Usage:
 *   node worker-smoke.mjs --path apps/platform --tier staging \
 *     [--workers-json workers.json | --smoke-json '{"hosts":{...},...}'] [--worker-name staging-platform --version-id UUID] \
 *     [--authorize] [--settle SECONDS]
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { isMain } from "./is-main.mjs";

/**
 * @typedef {{ name: string, ok: boolean, detail: string }} Check
 * @typedef {{
 *   hosts: Record<string, string>,
 *   publicPaths: string[],
 *   protectedPath?: string,
 *   protectedRedirectPrefix?: string,
 *   expectedStatuses?: Record<string, number>,
 * }} SmokeConfig
 */

/**
 * Drain a response. A 5xx also yields a short excerpt of its body and its
 * `cf-ray`, so a failed check says what answered (Cloudflare's error page, the
 * Worker's own) instead of only the status.
 *
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function drain(response) {
  const text = await response.text().catch(() => "");
  if (response.status < 500) return "";
  const ray = response.headers.get("cf-ray");
  const excerpt = text.replace(/\s+/g, " ").trim().slice(0, 200);
  return `${ray ? `, cf-ray ${ray}` : ""}${excerpt ? `, body "${excerpt}"` : ""}`;
}

/** `Cloudflare-Workers-Version-Overrides: worker="version-id"`. */
export function overrideHeader(workerName, versionId) {
  return `${workerName}="${versionId}"`;
}

/**
 * @param {{
 *   smoke: SmokeConfig,
 *   tier: string,
 *   workerName?: string,
 *   versionId?: string,
 *   fetchImpl?: typeof fetch,
 *   authorize?: { apiUrl: string, secretKey: string } | null,
 *   settle?: { ms: number, stable?: number, intervalMs?: number, retryDelayMs?: number } | null,
 * }} input
 * @returns {Promise<Check[]>}
 */
export async function runSmoke({
  smoke,
  tier,
  workerName,
  versionId,
  fetchImpl = fetch,
  authorize = null,
  settle = null,
}) {
  const host = smoke.hosts?.[tier];
  if (!host)
    throw new Error(`workers.json has no ${tier} host for this Worker`);
  const base = `https://${host}`;
  /** @type {Record<string, string>} */
  const headers = { "user-agent": "devdogs-smoke/1" };
  if (versionId) {
    if (!workerName) throw new Error("--version-id needs --worker-name");
    headers["cloudflare-workers-version-overrides"] = overrideHeader(
      workerName,
      versionId,
    );
  }
  const probe = (url, init = {}) =>
    fetchImpl(url, { redirect: "manual", headers, ...init });
  // After the version has settled, a page that still answers 5xx is asked once
  // more, and the retry is REPORTED (the last check), never silent. Before
  // settling there is no retry: the settle step is the wait.
  const retryOnce = Boolean(settle && settle.ms > 0);
  /** @type {string[]} */
  const retried = [];
  const get = async (url, init) => {
    let first;
    try {
      const response = await probe(url, init);
      if (!retryOnce || response.status < 500) return response;
      await response.arrayBuffer().catch(() => {});
      first = String(response.status);
    } catch (error) {
      if (!retryOnce) throw error;
      first = "an error";
    }
    await new Promise((resolve) =>
      setTimeout(resolve, settle?.retryDelayMs ?? 1000),
    );
    const response = await probe(url, init);
    retried.push(
      `${new URL(url).pathname} answered ${first}, then ${response.status}`,
    );
    return response;
  };

  /** @type {Check[]} */
  const checks = [];
  if (settle && settle.ms > 0) {
    const paths = [
      ...(smoke.publicPaths ?? []),
      ...(smoke.protectedPath ? [smoke.protectedPath] : []),
    ];
    checks.push(await settleCheck({ base, paths, get: probe, ...settle }));
  }
  for (const path of smoke.publicPaths ?? []) {
    try {
      const response = await get(`${base}${path}`);
      const extra = await drain(response);
      checks.push({
        name: `${path} answers 200`,
        ok: response.status === 200,
        detail: `status ${response.status}${extra}`,
      });
    } catch (error) {
      checks.push({
        name: `${path} answers 200`,
        ok: false,
        detail: String(error),
      });
    }
  }
  // Paths that answer something other than 200 on purpose: a websocket
  // endpoint asked for a page (426), a Worker that refuses an anonymous
  // visitor (403). Enough to prove the Worker code is running.
  for (const [path, status] of Object.entries(smoke.expectedStatuses ?? {})) {
    try {
      const response = await get(`${base}${path}`);
      const extra = await drain(response);
      checks.push({
        name: `${path} answers ${status}`,
        ok: response.status === status,
        detail: `status ${response.status}${extra}`,
      });
    } catch (error) {
      checks.push({
        name: `${path} answers ${status}`,
        ok: false,
        detail: String(error),
      });
    }
  }
  if (smoke.protectedPath) {
    try {
      const response = await get(`${base}${smoke.protectedPath}`);
      const extra = await drain(response);
      const location = response.headers.get("location") ?? "";
      const prefix = smoke.protectedRedirectPrefix ?? "/";
      const redirected = response.status >= 300 && response.status < 400;
      const path = location.startsWith("http")
        ? new URL(location).pathname
        : location;
      checks.push({
        name: `${smoke.protectedPath} sends an anonymous visitor to ${prefix}`,
        ok: redirected && path.startsWith(prefix),
        detail: `status ${response.status}, location ${location || "(none)"}${extra}`,
      });
    } catch (error) {
      checks.push({
        name: `${smoke.protectedPath} redirects`,
        ok: false,
        detail: String(error),
      });
    }
  }
  if (authorize)
    checks.push(
      ...(await authorizeChecks({
        base,
        headers,
        // The platform's own pages get the same one retry; the Supabase calls
        // do not.
        fetchImpl: (url, init) =>
          String(url).startsWith(base) && (init?.method ?? "GET") === "GET"
            ? get(String(url), init)
            : fetchImpl(url, init),
        ...authorize,
      })),
    );
  if (retried.length)
    checks.push({
      name: "pages that needed one retry after the version settled",
      ok: true,
      detail: retried.join("; "),
    });
  return checks;
}

/**
 * Waits for the live version to stop answering 5xx (see the header). Probes the
 * Worker's own pages round-robin and is done after `stable` answers in a row
 * that are not 5xx; a network error counts as a 5xx. Never throws: it returns
 * the check, which fails when the deadline passes first.
 *
 * @param {{
 *   base: string,
 *   paths: string[],
 *   get: (url: string) => Promise<Response>,
 *   ms: number,
 *   stable?: number,
 *   intervalMs?: number,
 * }} input
 * @returns {Promise<Check>}
 */
export async function settleCheck({
  base,
  paths,
  get,
  ms,
  stable = 20,
  intervalMs = 250,
}) {
  const name = "the version answers without a 5xx";
  const started = Date.now();
  /** @type {Record<string, number>} */
  const bad = {};
  let badCount = 0;
  let good = 0;
  let last = "";
  for (let i = 0; ; i++) {
    const path = paths[i % Math.max(paths.length, 1)] ?? "/";
    let status;
    try {
      const response = await get(`${base}${path}`);
      await response.arrayBuffer().catch(() => {});
      status = response.status;
    } catch {
      status = 0;
    }
    if (status > 0 && status < 500) good += 1;
    else {
      good = 0;
      badCount += 1;
      bad[status || "error"] = (bad[status || "error"] ?? 0) + 1;
      last = `${status || "error"} on ${path}`;
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    const history = badCount
      ? `${badCount} 5xx or errored answers first (${Object.entries(bad)
          .map(([code, n]) => `${code} x${n}`)
          .join(", ")}), over ${seconds}s`
      : "no 5xx";
    if (good >= stable)
      return {
        name,
        ok: true,
        detail: `${stable} answers in a row after ${history}`,
      };
    if (Date.now() - started >= ms)
      return {
        name,
        ok: false,
        detail: `still failing after ${seconds}s: ${history}; last ${last || "none"}`,
      };
    if (intervalMs > 0)
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * The OAuth hand-off, with a throwaway client.
 *
 * @param {{ base: string, headers: Record<string, string>, fetchImpl: typeof fetch, apiUrl: string, secretKey: string }} input
 * @returns {Promise<Check[]>}
 */
export async function authorizeChecks({
  base,
  headers,
  fetchImpl,
  apiUrl,
  secretKey,
}) {
  /** @type {Check[]} */
  const checks = [];
  const api = apiUrl.replace(/\/+$/, "");
  const adminHeaders = {
    "content-type": "application/json",
    apikey: secretKey,
    authorization: `Bearer ${secretKey}`,
  };
  const redirectUri = "https://example.invalid/smoke/callback";
  await sweepStaleClients({ api, adminHeaders, fetchImpl });
  const created = await fetchImpl(`${api}/auth/v1/admin/oauth/clients`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      client_name: THROWAWAY_NAME,
      redirect_uris: [redirectUri],
      client_type: "public",
    }),
  });
  const body = await created.json().catch(() => ({}));
  const clientId = body.client_id;
  checks.push({
    name: "register a throwaway OAuth client",
    ok: created.ok && typeof clientId === "string",
    detail: `status ${created.status}`,
  });
  let location = "";
  try {
    if (typeof clientId === "string") {
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: "openid",
        state: "smoke",
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      const authorize = await fetchImpl(
        `${api}/auth/v1/oauth/authorize?${params}`,
        { redirect: "manual" },
      );
      location = authorize.headers.get("location") ?? "";
      const target = location ? new URL(location, api) : null;
      checks.push({
        name: "authorize redirects to the platform consent page",
        ok:
          authorize.status >= 300 &&
          authorize.status < 400 &&
          target !== null &&
          target.origin === new URL(base).origin &&
          target.pathname === "/oauth/consent" &&
          target.searchParams.has("authorization_id"),
        detail: `status ${authorize.status}, location ${target ? `${target.origin}${target.pathname}` : "(none)"}`,
      });
    }
    if (typeof clientId === "string") {
      // The authorize request above goes to Supabase, which never sees the
      // version under test. Following its redirect to the consent page does:
      // `headers` carries the version override, so this is the new build
      // answering a real authorization_id. The platform answers a throwaway
      // client (registered only through GoTrue, so it has no
      // platform.oauthRegistrations row) with a 404, before sign-in; a client
      // it knows gets a redirect to sign in. Either is a build that took the
      // hand-off. A 5xx or a connection error is not.
      checks.push(await followConsent({ base, headers, fetchImpl, location }));
    }
    const consent = await fetchImpl(`${base}/oauth/consent`, {
      redirect: "manual",
      headers,
    });
    await consent.arrayBuffer().catch(() => {});
    checks.push({
      name: "the consent page 404s without an authorization_id",
      ok: consent.status === 404,
      detail: `status ${consent.status}`,
    });
  } finally {
    if (typeof clientId === "string") {
      const removed = await fetchImpl(
        `${api}/auth/v1/admin/oauth/clients/${clientId}`,
        {
          method: "DELETE",
          headers: adminHeaders,
        },
      );
      checks.push({
        name: "delete the throwaway OAuth client",
        ok: removed.status === 204 || removed.ok,
        detail: `status ${removed.status}`,
      });
    }
  }
  return checks;
}

/**
 * GET the consent URL Supabase redirected to, against `base` (so the version
 * override applies), and check the platform answers it without failing. A 404
 * is the correct answer for the throwaway client (the consent page 404s any
 * client without a platform registration), so only a 5xx or a network error
 * fails this check.
 *
 * @param {{ base: string, headers: Record<string, string>, fetchImpl: typeof fetch, location: string }} input
 * @returns {Promise<Check>}
 */
async function followConsent({ base, headers, fetchImpl, location }) {
  const name = "the new build answers the consent hand-off";
  let target;
  try {
    target = location ? new URL(location, base) : null;
  } catch {
    target = null;
  }
  if (
    !target ||
    target.origin !== new URL(base).origin ||
    !target.searchParams.has("authorization_id")
  ) {
    return {
      name,
      ok: false,
      detail: `no consent URL to follow (${location || "none"})`,
    };
  }
  try {
    const response = await fetchImpl(
      `${base}${target.pathname}${target.search}`,
      { redirect: "manual", headers },
    );
    const extra = await drain(response);
    return {
      name,
      ok: response.status < 500,
      detail: `status ${response.status}${extra}${response.status === 404 ? " (expected: the throwaway client has no platform registration)" : ""}`,
    };
  } catch (error) {
    return { name, ok: false, detail: String(error) };
  }
}

/** The name every throwaway client carries, which is how a leftover is found. */
const THROWAWAY_NAME = "deploy smoke (throwaway)";

/**
 * Deletes throwaway clients an earlier run left behind (a cancelled job never
 * reaches its `finally`). Only a client with exactly the throwaway name and
 * older than half an hour is touched, and a failure here is never a smoke
 * failure: the sweep is best effort.
 *
 * @param {{ api: string, adminHeaders: Record<string, string>, fetchImpl: typeof fetch, now?: number }} input
 */
export async function sweepStaleClients({
  api,
  adminHeaders,
  fetchImpl,
  now = Date.now(),
}) {
  try {
    const listed = await fetchImpl(
      `${api}/auth/v1/admin/oauth/clients?per_page=200`,
      { headers: adminHeaders },
    );
    if (!listed.ok) return 0;
    const body = await listed.json();
    const clients = Array.isArray(body) ? body : (body?.clients ?? []);
    let removed = 0;
    for (const client of clients) {
      const created = Date.parse(client?.created_at ?? "");
      if (
        client?.client_name !== THROWAWAY_NAME ||
        typeof client?.client_id !== "string" ||
        !Number.isFinite(created) ||
        now - created < 30 * 60 * 1000
      )
        continue;
      const response = await fetchImpl(
        `${api}/auth/v1/admin/oauth/clients/${client.client_id}`,
        { method: "DELETE", headers: adminHeaders },
      );
      if (response.ok) removed += 1;
    }
    return removed;
  } catch {
    return 0;
  }
}

/** @param {Check[]} checks */
export function renderChecks(checks, title) {
  return [
    `### ${title}`,
    "",
    ...checks.map(
      (c) => `- ${c.ok ? "pass" : "**FAIL**"}: ${c.name} (${c.detail})`,
    ),
  ].join("\n");
}

/* c8 ignore start */
if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const path = flag("--path") ?? "(inline config)";
  const tier = flag("--tier");
  if (!tier || (!flag("--path") && !flag("--smoke-json"))) {
    process.stderr.write(
      "--tier and one of --path or --smoke-json are required\n",
    );
    process.exit(2);
  }
  /** @type {SmokeConfig | undefined} */
  let smoke;
  if (flag("--smoke-json")) {
    smoke = JSON.parse(flag("--smoke-json"));
  } else {
    const workers = JSON.parse(
      readFileSync(flag("--workers-json") ?? "workers.json", "utf8"),
    );
    smoke = workers.find((w) => w.path === path)?.smoke;
  }
  if (!smoke) {
    process.stderr.write(`workers.json has no smoke config for ${path}\n`);
    process.exit(2);
  }
  const authorize = argv.includes("--authorize")
    ? {
        apiUrl: process.env.API_URL ?? "",
        secretKey: process.env.SECRET_KEY ?? "",
      }
    : null;
  if (authorize && (!authorize.apiUrl || !authorize.secretKey)) {
    process.stderr.write("--authorize needs API_URL and SECRET_KEY\n");
    process.exit(2);
  }
  runSmoke({
    smoke,
    tier,
    workerName: flag("--worker-name"),
    versionId: flag("--version-id"),
    authorize,
    settle: flag("--settle") ? { ms: Number(flag("--settle")) * 1000 } : null,
  }).then(
    (checks) => {
      const title = `Smoke test: ${path} (${tier})${flag("--version-id") ? `, version ${flag("--version-id")}` : ", live"}`;
      const text = renderChecks(checks, title);
      process.stdout.write(`${text}\n`);
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `${text}
`,
        );
      }
      process.exit(checks.every((c) => c.ok) ? 0 : 1);
    },
    (error) => {
      process.stderr.write(`worker-smoke: ${error.message}\n`);
      process.exit(1);
    },
  );
}
/* c8 ignore stop */
