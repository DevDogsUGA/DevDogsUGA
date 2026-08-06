import { eq, lt } from "drizzle-orm";
import { env } from "~/env";
import { db } from "~/server/db";
import { supabaseConnectionsInPlatform as supabaseConnections } from "~/server/db/schema";
import {
  deleteVaultSecret,
  readVaultSecret,
  storeVaultSecret,
} from "~/server/vault";

/**
 * The member's Supabase OAuth grant: obtaining it, storing it, refreshing it.
 *
 * Tokens go to Vault and only their ids are stored in `supabaseConnections`, so
 * a leak of the platform database is not a leak of everybody's Supabase
 * accounts.
 */

const TOKEN_URL = "https://api.supabase.com/v1/oauth/token";
const AUTHORIZE_URL = "https://api.supabase.com/v1/oauth/authorize";

/**
 * The scope set the spike ran against, and the one the real app is registered
 * with. Anything beyond this is a privilege the platform has not justified.
 */
export const REQUIRED_SCOPES = [
  "projects:read",
  "projects:write",
  "secrets:read",
  "database:read",
  "database:write",
  "auth:read",
  "auth:write",
  "organizations:read",
] as const;

export type OAuthProblem =
  | "not_configured"
  | "exchange_failed"
  // Distinct from `exchange_failed` on purpose. Connecting is two steps —
  // trade the code with Supabase, then store the result — and they fail for
  // completely unrelated reasons: a bad client secret versus a Vault write or
  // a missing table. Reporting both as "exchange_failed" sent me hunting
  // through the token endpoint for a fault that could equally have been in our
  // own database, and cost two wrong diagnoses before the distinction existed.
  | "persist_failed"
  | "not_connected"
  | "refresh_failed";

export class OAuthError extends Error {
  constructor(
    readonly code: OAuthProblem,
    readonly detail?: string,
  ) {
    super(`Supabase OAuth: ${code}${detail ? ` — ${detail}` : ""}`);
    this.name = "OAuthError";
  }
}

function credentials(): { id: string; secret: string } {
  // Empty rather than absent, so the platform boots without the integration
  // configured and fails loudly at the point of use instead of at startup --
  // the same shape AIRTABLE_BASE_ID uses.
  if (!env.SUPABASE_OAUTH_CLIENT_ID || !env.SUPABASE_OAUTH_CLIENT_SECRET) {
    throw new OAuthError("not_configured");
  }
  return {
    id: env.SUPABASE_OAUTH_CLIENT_ID,
    secret: env.SUPABASE_OAUTH_CLIENT_SECRET,
  };
}

export function isConfigured(): boolean {
  return Boolean(
    env.SUPABASE_OAUTH_CLIENT_ID && env.SUPABASE_OAUTH_CLIENT_SECRET,
  );
}

export function authorizeUrl(state: string, codeChallenge: string): string {
  const { id } = credentials();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", `${env.BASE_URL}/supabase/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", REQUIRED_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  // NOTE: there is deliberately no `scope` field here. Measured: the response
  // does not include one, so what was actually granted cannot be read back --
  // only discovered by calling an endpoint and seeing whether it works.
}

/**
 * Exchange a code or a refresh token for a grant.
 *
 * Credentials go in the body AND in HTTP Basic. The body is the documented
 * contract — the OpenAPI spec declares `security: None` for this operation and
 * lists `client_id`/`client_secret` among its form fields — and Basic is kept
 * because it demonstrably works too.
 *
 * > **Measured: both mechanisms are honoured, and equivalently.** Against the
 * > live endpoint with a deliberately invalid code: Basic-only returns `404
 * > Invalid or expired OAuth authorization`, body-only returns the same, and
 * > body-only with a wrong secret returns `403 Invalid client_secret` while a
 * > wrong id returns `422 Unrecognized client_id`. So neither is a fix for the
 * > other, and sending both is belt-and-braces rather than a workaround.
 */
async function exchange(body: Record<string, string>): Promise<TokenResponse> {
  const { id, secret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: new URLSearchParams({
      ...body,
      client_id: id,
      client_secret: secret,
    }),
  });
  if (!res.ok) {
    // The body, not just the status. Supabase distinguishes "invalid
    // client_secret" from "unrecognized client_id" from "invalid or expired
    // authorization" in the message alone -- three completely different faults
    // behind one thrown code. Logging the status by itself turned a named
    // diagnosis into a guess.
    const detail = await res.text().catch(() => "<unreadable>");
    console.error(
      `[supabase-oauth] token exchange failed: ${res.status} ${detail}`,
    );
    throw new OAuthError("exchange_failed", `${res.status} ${detail}`);
  }
  return (await res.json()) as TokenResponse;
}

async function persist(
  userId: string,
  orgSlug: string,
  tokens: TokenResponse,
): Promise<void> {
  // Replace rather than update: a re-connect issues new tokens, and leaving the
  // old Vault rows behind would accumulate live credentials nothing references.
  const existing = await db
    .select({
      access: supabaseConnections.accessTokenSecretId,
      refresh: supabaseConnections.refreshTokenSecretId,
    })
    .from(supabaseConnections)
    .where(eq(supabaseConnections.userId, userId));

  const accessId = await storeVaultSecret(
    tokens.access_token,
    `supabase_access_${userId}_${Date.now()}`,
  );
  const refreshId = await storeVaultSecret(
    tokens.refresh_token,
    `supabase_refresh_${userId}_${Date.now()}`,
  );

  await db
    .insert(supabaseConnections)
    .values({
      userId,
      orgSlug,
      accessTokenSecretId: accessId,
      refreshTokenSecretId: refreshId,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: [...REQUIRED_SCOPES],
    })
    .onConflictDoUpdate({
      target: supabaseConnections.userId,
      set: {
        orgSlug,
        accessTokenSecretId: accessId,
        refreshTokenSecretId: refreshId,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: [...REQUIRED_SCOPES],
      },
    });

  // After the row points at the new secrets, never before -- a failure between
  // the two must leave a working connection, not a row referencing deleted rows.
  for (const row of existing) {
    await deleteVaultSecret(row.access);
    await deleteVaultSecret(row.refresh);
  }
}

export async function connectSupabase(
  userId: string,
  code: string,
  verifier: string,
  orgSlug: string,
): Promise<void> {
  // `exchange` throws OAuthError("exchange_failed") with the upstream body
  // attached. Everything after it is ours, and gets its own code.
  const tokens = await exchange({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${env.BASE_URL}/supabase/callback`,
    code_verifier: verifier,
  });

  try {
    await persist(userId, orgSlug, tokens);
  } catch (error) {
    console.error("[supabase-oauth] persisting the grant failed:", error);
    throw new OAuthError(
      "persist_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Refresh one member's grant. Access tokens last 24h (measured), so the daily
 * cron has ample margin.
 */
export async function refreshConnection(userId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(supabaseConnections)
    .where(eq(supabaseConnections.userId, userId));
  if (!row) throw new OAuthError("not_connected");

  const refreshToken = await readVaultSecret(row.refreshTokenSecretId);
  if (!refreshToken) throw new OAuthError("refresh_failed");

  const tokens = await exchange({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  await persist(userId, row.orgSlug, tokens);
}

/**
 * The access token for a member, refreshed first if it is close to lapsing.
 *
 * Every Management API call goes through here rather than reading the Vault
 * directly, so there is exactly one place that can hand out a stale token.
 */
export async function accessTokenFor(userId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(supabaseConnections)
    .where(eq(supabaseConnections.userId, userId));
  if (!row) throw new OAuthError("not_connected");

  // Five minutes of headroom: a provision runs several calls over a couple of
  // minutes, and a token that expires midway leaves a half-built environment.
  if (row.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    await refreshConnection(userId);
    const token = await readVaultSecret(
      (
        await db
          .select({ id: supabaseConnections.accessTokenSecretId })
          .from(supabaseConnections)
          .where(eq(supabaseConnections.userId, userId))
      )[0]!.id,
    );
    if (!token) throw new OAuthError("refresh_failed");
    return token;
  }

  const token = await readVaultSecret(row.accessTokenSecretId);
  if (!token) throw new OAuthError("not_connected");
  return token;
}

/**
 * Refresh every grant close to lapsing. The daily cron's whole job.
 *
 * One member's failure must not stop the pass: a revoked grant is a permanent
 * state that will fail on every run, and letting it abort the loop would mean
 * one abandoned connection silently stops refreshing everybody else's.
 */
export async function refreshExpiringConnections(): Promise<{
  refreshed: number;
  failed: number;
}> {
  // Two days of headroom, so a single failed nightly run is not the difference
  // between a working grant and a lapsed one.
  const cutoff = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const due = await db
    .select({ userId: supabaseConnections.userId })
    .from(supabaseConnections)
    .where(lt(supabaseConnections.expiresAt, cutoff));

  let refreshed = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await refreshConnection(row.userId);
      refreshed += 1;
    } catch (error) {
      console.error(
        `[supabase-oauth] refresh failed for ${row.userId}:`,
        error,
      );
      failed += 1;
    }
  }
  return { refreshed, failed };
}

/**
 * Confirm the grant actually carries the scopes we asked for.
 *
 * Necessary because the token response omits `scope` entirely, so the only way
 * to know is to call something and see. Worth doing at connect time rather than
 * discovering a missing scope mid-provision, in front of a team.
 */
export async function probeScopes(token: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
