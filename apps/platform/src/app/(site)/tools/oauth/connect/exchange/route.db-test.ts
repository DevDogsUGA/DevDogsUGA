// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { oauthConnectCodes, oauthRegistrations } from "~/server/db/schema";
import { challengeFromVerifier } from "~/server/oauth/connectCodes";
import { supabaseAdmin } from "~/supabase/admin";
import { POST } from "./route";

/**
 * `POST /tools/oauth/connect/exchange` against a real database and a real
 * local GoTrue -- the code table's whole point is the race-free
 * delete-then-validate in `route.ts`, which is exactly the kind of thing a
 * mocked db would let slip past unnoticed.
 */

const USER_ID = "c9988888-8888-8888-8888-888888888801";
const REDIRECT_URI = "http://127.0.0.1:51820/callback";

let clientId: string;
let clientSecret: string;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function freshCode(): string {
  return randomBytes(32).toString("base64url");
}

function freshVerifier(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: challengeFromVerifier(verifier) };
}

async function insertCode(options: {
  codeChallenge: string;
  expiresAt?: Date;
}): Promise<string> {
  const code = freshCode();
  await db.insert(oauthConnectCodes).values({
    codeHash: hashCode(code),
    codeChallenge: options.codeChallenge,
    clientId,
    clientSecret,
    userId: USER_ID,
    redirectUri: REDIRECT_URI,
    ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
  });
  return code;
}

async function errorBody(response: Response): Promise<string> {
  const body = (await response.json()) as { error: string };
  return body.error;
}

async function postExchange(body: unknown) {
  const request = new NextRequest(
    "http://localhost/tools/oauth/connect/exchange",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
  );
  return POST(request);
}

async function cleanupClientsFor(userId: string): Promise<void> {
  const existing = await db
    .select({ clientId: oauthRegistrations.clientId })
    .from(oauthRegistrations)
    .where(sql`${oauthRegistrations.userId} = ${userId}::uuid`);

  await db.execute(
    sql`delete from platform."oauthConnectCodes" where "userId" = ${userId}::uuid`,
  );
  await db.execute(
    sql`delete from platform."oauthRegistrations" where "userId" = ${userId}::uuid`,
  );
  for (const { clientId: id } of existing) {
    await supabaseAdmin.auth.admin.oauth.deleteClient(id);
  }
  await db.execute(sql`delete from auth.users where id = ${userId}::uuid`);
}

beforeAll(async () => {
  await cleanupClientsFor(USER_ID);

  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${USER_ID}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', ${`${USER_ID}@uga.edu`})
  `);

  const { data, error } = await supabaseAdmin.auth.admin.oauth.createClient({
    client_name: "oauth-connect-exchange-db-test",
    redirect_uris: ["https://example.test/auth/v1/callback"],
    scope: "openid email profile",
  });
  if (error || !data?.client_secret) {
    throw new Error(`Failed to create test OAuth client: ${error?.message}`);
  }
  clientId = data.client_id;
  clientSecret = data.client_secret;

  await db
    .insert(oauthRegistrations)
    .values({ userId: USER_ID, clientId, label: "exchange-db-test" });
});

afterAll(async () => {
  await cleanupClientsFor(USER_ID);
});

describe("POST /tools/oauth/connect/exchange", () => {
  it("succeeds for a valid code and verifier, and consumes the code", async () => {
    const { verifier, challenge } = freshVerifier();
    const code = await insertCode({ codeChallenge: challenge });

    const response = await postExchange({ code, code_verifier: verifier });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as {
      client_id: string;
      client_secret: string;
      issuer: string;
    };
    expect(body.client_id).toBe(clientId);
    expect(body.client_secret).toBe(clientSecret);
    expect(typeof body.issuer).toBe("string");
    expect(body.issuer.length).toBeGreaterThan(0);

    const remaining = await db.query.oauthConnectCodes.findFirst({
      where: { codeHash: hashCode(code) },
    });
    expect(remaining).toBeUndefined();
  });

  it("rejects a code that has already been exchanged", async () => {
    const { verifier, challenge } = freshVerifier();
    const code = await insertCode({ codeChallenge: challenge });

    const first = await postExchange({ code, code_verifier: verifier });
    expect(first.status).toBe(200);

    const second = await postExchange({ code, code_verifier: verifier });
    expect(second.status).toBe(400);
    expect(await errorBody(second)).toBe("invalid_grant");
  });

  it("rejects a mismatched code_verifier, and consumes the code anyway", async () => {
    const { verifier, challenge } = freshVerifier();
    const code = await insertCode({ codeChallenge: challenge });

    const wrong = await postExchange({
      code,
      code_verifier: "definitely-the-wrong-verifier",
    });
    expect(wrong.status).toBe(400);
    expect(await errorBody(wrong)).toBe("invalid_grant");

    // A failed exchange consumes the code same as a successful one -- a
    // retry with the CORRECT verifier still fails, because the row is gone.
    const retry = await postExchange({ code, code_verifier: verifier });
    expect(retry.status).toBe(400);
    expect(await errorBody(retry)).toBe("invalid_grant");
  });

  it("rejects an expired code", async () => {
    const { verifier, challenge } = freshVerifier();
    const code = await insertCode({
      codeChallenge: challenge,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const response = await postExchange({ code, code_verifier: verifier });
    expect(response.status).toBe(400);
    expect(await errorBody(response)).toBe("invalid_grant");
  });

  it("rejects an unknown code as invalid_grant", async () => {
    const response = await postExchange({
      code: freshCode(),
      code_verifier: freshVerifier().verifier,
    });
    expect(response.status).toBe(400);
    expect(await errorBody(response)).toBe("invalid_grant");
  });

  it("rejects a request missing code_verifier as invalid_request", async () => {
    const response = await postExchange({ code: freshCode() });
    expect(response.status).toBe(400);
    expect(await errorBody(response)).toBe("invalid_request");
  });
});
