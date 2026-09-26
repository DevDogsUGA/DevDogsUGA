// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { oauthDeviceCodes } from "~/server/db/schema";
import {
  generateDeviceCode,
  generateRawUserCode,
  hashDeviceCode,
  hashUserCode,
} from "~/server/oauth/deviceCodes";
import { verifyDeviceUserCode } from "~/server/oauth/verifyDeviceCode";
import { supabaseAdmin } from "~/supabase/admin";
import { POST as postCode } from "../code/route";
import { POST as postToken } from "./route";

/**
 * The device-code flow (TASK-352) against a real database, same reasoning
 * as `~/app/(site)/tools/oauth/connect/exchange/route.db-test.ts`: the
 * table's whole point is atomic claim-on-approval and the RFC 8628 polling
 * state machine (`authorization_pending` → `slow_down` → terminal), which a
 * mocked db would let slip past unnoticed.
 *
 * The "approve" leg itself (`~/server/actions/oauthDevice.ts`) is a Server
 * Action that needs a real signed-in request (cookies, `next/headers`) to
 * exercise directly -- same reason the connect exchange's db-test never
 * calls `approveConnect` either. Its effect (`status: "approved"`, a real
 * `clientId`/`clientSecret`) is reproduced here with a direct update, using
 * a client minted the same way `createOauthClientAndRegister` would.
 */

const LABEL = "device-db-test";
const CALLBACK_URI = "https://project.supabase.co/auth/v1/callback";

const RATE_LIMIT_SCOPES = [
  "oauth:device:code",
  "oauth:device:token",
  "oauth:device:verify",
];

function hashCode(code: string): string {
  return hashDeviceCode(code);
}

async function insertRow(options: {
  status?: "pending" | "approved" | "denied";
  clientId?: string;
  clientSecret?: string;
  interval?: number;
  lastPolledAt?: Date | null;
  expiresAt?: Date;
}): Promise<{ deviceCode: string; userCode: string }> {
  const deviceCode = generateDeviceCode().code;
  const userCode = generateRawUserCode();

  await db.insert(oauthDeviceCodes).values({
    deviceCodeHash: hashDeviceCode(deviceCode),
    userCodeHash: hashUserCode(userCode),
    label: LABEL,
    callbackUri: CALLBACK_URI,
    status: options.status ?? "pending",
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    interval: options.interval ?? 5,
    lastPolledAt: options.lastPolledAt ?? null,
    ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
  });

  return { deviceCode, userCode };
}

async function errorBody(response: Response): Promise<string> {
  const body = (await response.json()) as { error: string };
  return body.error;
}

function postTokenRequest(body: unknown, ip: string) {
  return new NextRequest("http://localhost/tools/oauth/device/token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
  });
}

function postCodeRequest(body: unknown, ip: string) {
  return new NextRequest("http://localhost/tools/oauth/device/code", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
  });
}

async function cleanupRows(): Promise<void> {
  await db.execute(
    sql`delete from platform."oauthDeviceCodes" where "label" = ${LABEL}`,
  );
  for (const scope of RATE_LIMIT_SCOPES) {
    await db.execute(
      sql`delete from platform."rateLimitHits" where "scope" = ${scope}`,
    );
  }
}

const createdClientIds: string[] = [];

beforeAll(cleanupRows);

afterAll(async () => {
  await cleanupRows();
  for (const clientId of createdClientIds) {
    await supabaseAdmin.auth.admin.oauth.deleteClient(clientId);
  }
});

describe("POST /tools/oauth/device/token", () => {
  it("issue -> approve -> token 200 -> second token call invalid_grant", async () => {
    const codeResponse = await postCode(
      postCodeRequest(
        { label: LABEL, callback_uri: CALLBACK_URI },
        "203.0.113.1",
      ),
    );
    expect(codeResponse.status).toBe(200);
    const issued = (await codeResponse.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      verification_uri_complete: string;
      expires_in: number;
      interval: number;
    };
    expect(issued.device_code.length).toBeGreaterThanOrEqual(43);
    expect(issued.user_code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
    expect(issued.verification_uri).toMatch(/\/tools\/oauth\/device$/);
    expect(issued.verification_uri_complete).toContain(issued.user_code);
    expect(issued.expires_in).toBe(600);
    expect(issued.interval).toBe(5);

    // Simulate a human approving at `GET /tools/oauth/device`: mint a real
    // client the same way `createOauthClientAndRegister` would, and mark
    // the row approved -- see the module doc comment for why this test
    // doesn't call the Server Action itself.
    const { data, error } = await supabaseAdmin.auth.admin.oauth.createClient({
      client_name: LABEL,
      redirect_uris: [CALLBACK_URI],
      scope: "openid email profile",
    });
    if (error || !data?.client_secret) {
      throw new Error(`Failed to create test OAuth client: ${error?.message}`);
    }
    createdClientIds.push(data.client_id);

    await db
      .update(oauthDeviceCodes)
      .set({
        status: "approved",
        clientId: data.client_id,
        clientSecret: data.client_secret,
      })
      .where(eq(oauthDeviceCodes.deviceCodeHash, hashCode(issued.device_code)));

    const first = await postToken(
      postTokenRequest({ device_code: issued.device_code }, "203.0.113.2"),
    );
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const body = (await first.json()) as {
      client_id: string;
      client_secret: string;
      issuer: string;
    };
    expect(body.client_id).toBe(data.client_id);
    expect(body.client_secret).toBe(data.client_secret);
    expect(typeof body.issuer).toBe("string");
    expect(body.issuer.length).toBeGreaterThan(0);

    const second = await postToken(
      postTokenRequest({ device_code: issued.device_code }, "203.0.113.2"),
    );
    expect(second.status).toBe(400);
    expect(await errorBody(second)).toBe("invalid_grant");
  });

  it("reports authorization_pending for a pending, unpolled code", async () => {
    const { deviceCode } = await insertRow({ status: "pending" });

    const response = await postToken(
      postTokenRequest({ device_code: deviceCode }, "203.0.113.3"),
    );
    expect(response.status).toBe(400);
    expect(await errorBody(response)).toBe("authorization_pending");

    const row = await db.query.oauthDeviceCodes.findFirst({
      where: { deviceCodeHash: hashCode(deviceCode) },
    });
    expect(row?.lastPolledAt).not.toBeNull();
  });

  it("reports slow_down and bumps the interval when polled too soon", async () => {
    const { deviceCode } = await insertRow({ status: "pending", interval: 5 });

    const first = await postToken(
      postTokenRequest({ device_code: deviceCode }, "203.0.113.4"),
    );
    expect(await errorBody(first)).toBe("authorization_pending");

    const second = await postToken(
      postTokenRequest({ device_code: deviceCode }, "203.0.113.4"),
    );
    expect(second.status).toBe(400);
    expect(await errorBody(second)).toBe("slow_down");

    const row = await db.query.oauthDeviceCodes.findFirst({
      where: { deviceCodeHash: hashCode(deviceCode) },
    });
    expect(row?.interval).toBe(10);
  });

  it("reports access_denied and deletes the row", async () => {
    const { deviceCode } = await insertRow({ status: "denied" });

    const response = await postToken(
      postTokenRequest({ device_code: deviceCode }, "203.0.113.5"),
    );
    expect(response.status).toBe(400);
    expect(await errorBody(response)).toBe("access_denied");

    const row = await db.query.oauthDeviceCodes.findFirst({
      where: { deviceCodeHash: hashCode(deviceCode) },
    });
    expect(row).toBeUndefined();
  });

  it("reports expired_token and deletes the row", async () => {
    const { deviceCode } = await insertRow({
      status: "pending",
      expiresAt: new Date(Date.now() - 60_000),
    });

    const response = await postToken(
      postTokenRequest({ device_code: deviceCode }, "203.0.113.6"),
    );
    expect(response.status).toBe(400);
    expect(await errorBody(response)).toBe("expired_token");

    const row = await db.query.oauthDeviceCodes.findFirst({
      where: { deviceCodeHash: hashCode(deviceCode) },
    });
    expect(row).toBeUndefined();
  });

  it("reports invalid_grant for an unknown device_code", async () => {
    const response = await postToken(
      postTokenRequest(
        { device_code: generateDeviceCode().code },
        "203.0.113.7",
      ),
    );
    expect(response.status).toBe(400);
    expect(await errorBody(response)).toBe("invalid_grant");
  });

  it("rejects a request missing device_code as invalid_request", async () => {
    const response = await postToken(postTokenRequest({}, "203.0.113.8"));
    expect(response.status).toBe(400);
    expect(await errorBody(response)).toBe("invalid_request");
  });

  it("rate-limits repeated polls from the same IP", async () => {
    const { deviceCode } = await insertRow({ status: "pending" });
    const ip = "203.0.113.9";

    let lastResponse: Response | undefined;
    for (let i = 0; i < 61; i++) {
      lastResponse = await postToken(
        postTokenRequest({ device_code: deviceCode }, ip),
      );
    }

    expect(lastResponse?.status).toBe(429);
    expect(await errorBody(lastResponse!)).toBe("rate_limited");
    expect(lastResponse?.headers.get("retry-after")).toBeTruthy();
  });
});

describe("POST /tools/oauth/device/code", () => {
  it("rejects an invalid body as invalid_request", async () => {
    const response = await postCode(
      postCodeRequest(
        { label: "", callback_uri: CALLBACK_URI },
        "198.51.100.1",
      ),
    );
    expect(response.status).toBe(400);
    expect(await errorBody(response)).toBe("invalid_request");
  });

  it("rate-limits repeated issuance from the same IP", async () => {
    const ip = "198.51.100.2";

    let lastResponse: Response | undefined;
    for (let i = 0; i < 11; i++) {
      lastResponse = await postCode(
        postCodeRequest({ label: LABEL, callback_uri: CALLBACK_URI }, ip),
      );
    }

    expect(lastResponse?.status).toBe(429);
    expect(await errorBody(lastResponse!)).toBe("rate_limited");
    expect(lastResponse?.headers.get("retry-after")).toBeTruthy();
  });
});

describe("verifyDeviceUserCode", () => {
  const VERIFY_USER_ID = "d1111111-1111-1111-1111-111111111111";

  it("finds a pending row by its normalized user_code", async () => {
    const { userCode } = await insertRow({ status: "pending" });
    const normalized = userCode; // already normalized (raw, unformatted)

    const result = await verifyDeviceUserCode({
      normalizedUserCode: normalized,
      userId: "d2222222-2222-2222-2222-222222222222",
    });

    expect(result.outcome).toBe("found");
    if (result.outcome === "found") {
      expect(result.row.label).toBe(LABEL);
    }
  });

  it("reports not_found for an unknown user_code", async () => {
    const result = await verifyDeviceUserCode({
      normalizedUserCode: generateRawUserCode(),
      userId: "d3333333-3333-3333-3333-333333333333",
    });
    expect(result.outcome).toBe("not_found");
  });

  it("rate-limits repeated submissions from the same signed-in user", async () => {
    let lastResult:
      Awaited<ReturnType<typeof verifyDeviceUserCode>> | undefined;
    for (let i = 0; i < 11; i++) {
      lastResult = await verifyDeviceUserCode({
        normalizedUserCode: generateRawUserCode(),
        userId: VERIFY_USER_ID,
      });
    }

    expect(lastResult?.outcome).toBe("rate_limited");
  });
});
