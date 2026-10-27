import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { approveAuthorization } from "../src/server/oauth/approveAuthorization";

/**
 * Checkpoint 3c, end to end, against a real Supabase project and (optionally)
 * the deployed platform: what a token issued to each tier of OAuth client
 * looks like, and who the consent page lets through.
 *
 *   API_URL=https://<ref>.supabase.co SECRET_KEY=... PUBLISHABLE_KEY=... \
 *   [BASE_URL=https://staging.devdogsuga.org] \
 *     tsx scripts/verify-oauth-tiers.ts
 *
 * It makes everything it needs and removes it again: two `*.devdogsuga.test`
 * accounts (admin createUser, then generateLink, then verifyOtp, the order
 * that bypasses the UGA sign-up hook), a development client and a production
 * client registered to the first, and a session for each account. Then, for
 * each client:
 *
 *   - run the authorization-code flow (PKCE) as a test account the client's
 *     owner does NOT own (the production case) or as the owner's own test
 *     account (the development case);
 *   - exchange the code and refresh it, and require every access token to have
 *     role `oauth_identity` and the client's `client_id`, to be refused by
 *     PostgREST on the platform schema, and to still work at userinfo;
 *   - require every bearer a client holds (both access tokens and the ID token,
 *     which GoTrue also accepts at /auth/v1/user and the token hook never sees)
 *     to be unable to set a password on the member: the write fails and a
 *     password sign-in with the attempted password gets no session (migration
 *     61);
 *   - as a control, require a first-party session to read the platform schema.
 *
 * With BASE_URL it also drives the real consent page with the session cookie:
 *   - 404 without an `authorization_id`, and with one nobody issued;
 *   - a redirect to sign-in for a visitor with no session;
 *   - a production authorization is approved straight through to the client's
 *     return address, with a code, for an account the owner does not own;
 *   - a development authorization is a 404 for someone who is not its owner,
 *     and the owner's form (200) for the owner.
 * Without BASE_URL the production approval is done through the same
 * `approveAuthorization` helper the page uses, and the page checks are skipped.
 *
 * It never touches a real person's account and sends no email. Exit 0 only if
 * every step passes. Needs the OAuth server and the access-token hook enabled
 * on the project (migration 57 applied); refuses a project that has no
 * `*.devdogsuga.test` bypass by failing at minting, not by guessing.
 */

const API_URL = (process.env.API_URL ?? "").replace(/\/+$/, "");
const SECRET_KEY = process.env.SECRET_KEY ?? "";
const PUBLISHABLE_KEY = process.env.PUBLISHABLE_KEY ?? "";
const BASE_URL = (process.env.BASE_URL ?? "").replace(/\/+$/, "");
if (!API_URL || !SECRET_KEY || !PUBLISHABLE_KEY) {
  console.error(
    "verify-oauth-tiers: set API_URL, SECRET_KEY and PUBLISHABLE_KEY (and BASE_URL to check the consent page).",
  );
  process.exit(2);
}

const RUN = randomBytes(4).toString("hex");
const PRODUCTION_CALLBACK = `https://verify-${RUN}.supabase.co/auth/v1/callback`;
const DEVELOPMENT_CALLBACK = `http://127.0.0.1:54321/auth/v1/callback`;

type Step = { name: string; ok: boolean; detail?: unknown };
const steps: Step[] = [];
function step(name: string, ok: boolean, detail?: unknown): boolean {
  steps.push({ name, ok, ...(detail === undefined ? {} : { detail }) });
  console.error(`${ok ? "PASS" : "FAIL"} ${name}`);
  return ok;
}

const authOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
};
const admin = createClient(API_URL, SECRET_KEY, authOptions);
const anon = createClient(API_URL, PUBLISHABLE_KEY, authOptions);

interface TestAccount {
  id: string;
  email: string;
  accessToken: string;
  session: { access_token: string; refresh_token: string };
}

async function makeAccount(role: string): Promise<TestAccount> {
  const email = `v3c-${RUN}-${role}@verify.devdogsuga.test`;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      is_test_account: true,
      name: `Verify ${role}`,
      full_name: `Verify ${role}`,
    },
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser ${email}: ${created.error?.message}`);
  }
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (link.error) throw new Error(`generateLink: ${link.error.message}`);
  const verified = await anon.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (verified.error || !verified.data.session) {
    throw new Error(`verifyOtp: ${verified.error?.message}`);
  }
  const { session } = verified.data;
  return {
    id: created.data.user.id,
    email,
    accessToken: session.access_token,
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    },
  };
}

function sessionCookie(
  account: TestAccount,
  tokens: { access_token: string; refresh_token: string } = account.session,
): string {
  const name = `sb-${new URL(API_URL).hostname.split(".")[0]}-auth-token`;
  const encoded = `base64-${Buffer.from(
    JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: account.id, email: account.email },
    }),
  ).toString("base64url")}`;
  const CHUNK = 3180;
  if (encoded.length <= CHUNK) return `${name}=${encoded}`;
  const parts: string[] = [];
  for (let i = 0; i * CHUNK < encoded.length; i++) {
    parts.push(`${name}.${i}=${encoded.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  }
  return parts.join("; ");
}

function jwtPayload(token: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
  ) as Record<string, unknown>;
}

interface Client {
  id: string;
  secret: string;
  redirectUri: string;
}

async function makeClient(
  tier: "development" | "production",
  owner: TestAccount,
) {
  const redirectUri =
    tier === "production" ? PRODUCTION_CALLBACK : DEVELOPMENT_CALLBACK;
  const created = await admin.auth.admin.oauth.createClient({
    client_name: `verify-oauth-tiers-${RUN}-${tier}`,
    redirect_uris: [redirectUri],
    scope: "openid email profile",
  });
  if (created.error || !created.data.client_secret) {
    throw new Error(`createClient ${tier}: ${created.error?.message}`);
  }
  const registered = await admin
    .schema("platform")
    .from("oauthRegistrations")
    .insert({
      clientId: created.data.client_id,
      // "production" is a DevDogs app that skips consent; "development" is
      // a member's Testing app (the tier column is retired).
      userId: tier === "production" ? null : owner.id,
      label: `verify-oauth-tiers-${RUN}-${tier}`,
      status: tier === "production" ? "in_production" : "testing",
      asksForConsent: tier !== "production",
    });
  if (registered.error) {
    throw new Error(`register ${tier}: ${registered.error.message}`);
  }
  return {
    id: created.data.client_id,
    secret: created.data.client_secret,
    redirectUri,
  } satisfies Client;
}

/** Starts an authorization and returns its id (the consent page's query). */
async function startAuthorization(client: Client, verifier: string) {
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(`${API_URL}/auth/v1/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: client.id,
    response_type: "code",
    redirect_uri: client.redirectUri,
    scope: "openid email profile",
    state: `state-${RUN}`,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  const response = await fetch(url, { redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  const id = new URL(location, API_URL).searchParams.get("authorization_id");
  return { status: response.status, location, authorizationId: id };
}

async function tokenRequest(client: Client, params: Record<string, string>) {
  const response = await fetch(`${API_URL}/auth/v1/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString("base64")}`,
    },
    body: new URLSearchParams(params).toString(),
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      error?: string;
    },
  };
}

/**
 * A bearer a client holds must not be able to take the account over through
 * GoTrue's user endpoint: setting a password would let it sign in as the member
 * with a first-party session. (Linking an identity is guarded in the database
 * too, and covered by `tokenGuards.db-test.ts`: completing a link needs a
 * provider's consent screen.)
 */
async function checkCannotSetPassword(
  label: string,
  token: string,
  account: TestAccount,
) {
  const password = `Verify-${randomBytes(12).toString("base64url")}`;
  const response = await fetch(`${API_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  const signIn = await anon.auth.signInWithPassword({
    email: account.email,
    password,
  });
  step(
    `${label}: cannot set a password on the member`,
    response.status >= 400 && signIn.data.session === null,
    { status: response.status, signedIn: signIn.data.session !== null },
  );
}

async function checkToken(
  label: string,
  token: string,
  client: Client,
  userId: string,
  account: TestAccount,
) {
  const claims = jwtPayload(token);
  step(
    `${label}: token role is oauth_identity`,
    claims.role === "oauth_identity",
    {
      role: claims.role,
    },
  );
  step(
    `${label}: token carries the client and the signed-in user`,
    claims.client_id === client.id && claims.sub === userId,
    {
      client_id: claims.client_id,
      sub: claims.sub,
    },
  );
  await checkCannotSetPassword(label, token, account);
  const data = await fetch(`${API_URL}/rest/v1/profile?select=userId&limit=1`, {
    headers: {
      apikey: PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      "accept-profile": "platform",
    },
  });
  step(
    `${label}: PostgREST refuses the token on the platform schema`,
    data.status === 401 || data.status === 403,
    {
      status: data.status,
    },
  );
  const discovery = (await (
    await fetch(`${API_URL}/auth/v1/.well-known/openid-configuration`)
  ).json()) as { userinfo_endpoint?: string };
  if (discovery.userinfo_endpoint) {
    const info = await fetch(discovery.userinfo_endpoint, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await info.json()) as { sub?: string };
    step(
      `${label}: userinfo still identifies the user`,
      info.status === 200 && body.sub === userId,
      {
        status: info.status,
      },
    );
  }
}

async function runFlow(options: {
  label: string;
  client: Client;
  signer: TestAccount;
  approve: (authorizationId: string) => Promise<string>;
}) {
  const { label, client, signer } = options;
  const verifier = randomBytes(32).toString("base64url");
  const started = await startAuthorization(client, verifier);
  if (
    !step(
      `${label}: authorize redirects to the consent page`,
      started.status === 302 && started.authorizationId !== null,
      {
        status: started.status,
        location: started.location.replace(
          /authorization_id=[^&]+/,
          "authorization_id=<id>",
        ),
      },
    )
  ) {
    return;
  }

  const redirectUrl = await options.approve(started.authorizationId!);
  const code = new URL(redirectUrl).searchParams.get("code");
  if (
    !step(
      `${label}: approval returns to the client with a code`,
      redirectUrl.startsWith(client.redirectUri) && code !== null,
      {
        redirectUrl: redirectUrl.replace(/code=[^&]+/, "code=<code>"),
      },
    )
  ) {
    return;
  }

  const exchanged = await tokenRequest(client, {
    grant_type: "authorization_code",
    code: code!,
    redirect_uri: client.redirectUri,
    code_verifier: verifier,
  });
  if (
    !step(
      `${label}: code exchange succeeds`,
      exchanged.status === 200 && !!exchanged.body.access_token,
      {
        status: exchanged.status,
        error: exchanged.body.error,
      },
    )
  ) {
    return;
  }
  await checkToken(
    `${label} (exchange)`,
    exchanged.body.access_token!,
    client,
    signer.id,
    signer,
  );
  if (exchanged.body.id_token) {
    await checkCannotSetPassword(
      `${label} (ID token)`,
      exchanged.body.id_token,
      signer,
    );
  }
  if (BASE_URL) {
    // The platform reads the member out of the session cookie. A client's
    // tokens in that cookie must not sign anyone in.
    const bearers: [string, string | undefined][] = [
      ["access token", exchanged.body.access_token],
      ["ID token", exchanged.body.id_token],
    ];
    for (const [name, token] of bearers) {
      if (!token) continue;
      const page = await accountPage(
        sessionCookie(signer, {
          access_token: token,
          refresh_token: exchanged.body.refresh_token ?? "unused",
        }),
      );
      step(
        `${label}: the ${name} in the session cookie does not sign in to the platform`,
        page.status >= 300 &&
          page.status < 400 &&
          (page.location ?? "").includes("/auth"),
        page,
      );
    }
  }

  if (exchanged.body.refresh_token) {
    const refreshed = await tokenRequest(client, {
      grant_type: "refresh_token",
      refresh_token: exchanged.body.refresh_token,
    });
    if (
      step(
        `${label}: refresh succeeds`,
        refreshed.status === 200 && !!refreshed.body.access_token,
        {
          status: refreshed.status,
        },
      )
    ) {
      await checkToken(
        `${label} (refresh)`,
        refreshed.body.access_token!,
        client,
        signer.id,
        signer,
      );
    }
  }
}

async function consentPage(authorizationId: string | null, cookie?: string) {
  const query =
    authorizationId === null
      ? ""
      : `?authorization_id=${encodeURIComponent(authorizationId)}`;
  const response = await fetch(`${BASE_URL}/oauth/consent${query}`, {
    redirect: "manual",
    // A browser-shaped request: curl-like clients are served the terminal twin.
    headers: {
      "user-agent": "Mozilla/5.0 (verify-oauth-tiers)",
      accept: "text/html",
      ...(cookie ? { cookie } : {}),
    },
  });
  return {
    status: response.status,
    location: response.headers.get("location"),
  };
}

async function accountPage(cookie: string) {
  const response = await fetch(`${BASE_URL}/account`, {
    redirect: "manual",
    headers: {
      "user-agent": "Mozilla/5.0 (verify-oauth-tiers)",
      accept: "text/html",
      cookie,
    },
  });
  return {
    status: response.status,
    location: response.headers.get("location"),
  };
}

const cleanup: (() => Promise<unknown>)[] = [];

try {
  const owner = await makeAccount("owner");
  cleanup.push(() => admin.auth.admin.deleteUser(owner.id));
  const stranger = await makeAccount("stranger");
  cleanup.push(() => admin.auth.admin.deleteUser(stranger.id));

  const production = await makeClient("production", owner);
  cleanup.unshift(async () => {
    await admin
      .schema("platform")
      .from("oauthRegistrations")
      .delete()
      .eq("clientId", production.id);
    await admin.auth.admin.oauth.deleteClient(production.id);
  });
  const development = await makeClient("development", owner);
  cleanup.unshift(async () => {
    await admin
      .schema("platform")
      .from("oauthRegistrations")
      .delete()
      .eq("clientId", development.id);
    await admin.auth.admin.oauth.deleteClient(development.id);
  });

  // Control: a first-party session is not downgraded and reads the schema.
  const control = await fetch(
    `${API_URL}/rest/v1/profile?select=userId&limit=1`,
    {
      headers: {
        apikey: PUBLISHABLE_KEY,
        authorization: `Bearer ${stranger.accessToken}`,
        "accept-profile": "platform",
      },
    },
  );
  step(
    "control: a first-party session reads the platform schema",
    control.status === 200,
    {
      status: control.status,
      role: jwtPayload(stranger.accessToken).role,
    },
  );

  // Production: a test account the client's owner does not own.
  await runFlow({
    label: "production client, non-owner's account",
    client: production,
    signer: stranger,
    approve: async (authorizationId) => {
      if (BASE_URL) {
        const response = await consentPage(
          authorizationId,
          sessionCookie(stranger),
        );
        const ok =
          response.status >= 300 &&
          response.status < 400 &&
          (response.location ?? "").startsWith(production.redirectUri);
        step(
          "production client: the consent page approves it without a form",
          ok,
          response,
        );
        return response.location ?? "";
      }
      const signerClient = createClient(API_URL, PUBLISHABLE_KEY, authOptions);
      await signerClient.auth.setSession(stranger.session);
      return approveAuthorization(signerClient, authorizationId);
    },
  });

  // Development: the owner's own test account (the owner is the account here).
  await runFlow({
    label: "development client, owner's account",
    client: development,
    signer: owner,
    approve: async (authorizationId) => {
      const signerClient = createClient(API_URL, PUBLISHABLE_KEY, authOptions);
      await signerClient.auth.setSession(owner.session);
      return approveAuthorization(signerClient, authorizationId);
    },
  });

  if (BASE_URL) {
    const none = await consentPage(null, sessionCookie(owner));
    step(
      "consent without an authorization_id is a 404",
      none.status === 404,
      none,
    );
    const bogus = await consentPage(
      "not-an-authorization",
      sessionCookie(owner),
    );
    step(
      "consent with an id nobody issued is a 404",
      bogus.status === 404,
      bogus,
    );

    const fresh = await startAuthorization(
      production,
      randomBytes(32).toString("base64url"),
    );
    const anonymous = await consentPage(fresh.authorizationId);
    step(
      "consent sends a visitor with no session to sign in",
      anonymous.status >= 300 &&
        anonymous.status < 400 &&
        (anonymous.location ?? "").includes("/auth"),
      anonymous,
    );

    const devAuthorization = await startAuthorization(
      development,
      randomBytes(32).toString("base64url"),
    );
    const strangerOnDev = await consentPage(
      devAuthorization.authorizationId,
      sessionCookie(stranger),
    );
    step(
      "a development authorization is a 404 for someone who is not its owner",
      strangerOnDev.status === 404,
      strangerOnDev,
    );
    const ownerOnDev = await consentPage(
      devAuthorization.authorizationId,
      sessionCookie(owner),
    );
    step(
      "a development authorization shows its owner the form",
      ownerOnDev.status === 200,
      ownerOnDev,
    );
  } else {
    steps.push({ name: "consent page checks skipped (no BASE_URL)", ok: true });
  }
} catch (error) {
  step(
    "run completed without an error",
    false,
    error instanceof Error ? error.message : String(error),
  );
} finally {
  for (const undo of cleanup) {
    try {
      await undo();
    } catch (error) {
      console.error("cleanup failed:", error);
    }
  }
}

const failed = steps.filter((s) => !s.ok);
console.log(
  JSON.stringify(
    {
      apiUrl: API_URL,
      baseUrl: BASE_URL || null,
      run: RUN,
      passed: steps.length - failed.length,
      failed: failed.length,
      steps,
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 1);
