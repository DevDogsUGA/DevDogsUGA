import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CLIENT_ID_HEADER,
  REASONS_PATH,
  ReportRejectedError,
  SAMPLE_CONTENT,
  SAMPLE_SECRET,
  SAMPLE_USER_ID,
  applyModerationEvent,
  buildMessage,
  computeSignature,
  createMemoryStore,
  createModerationClient,
  createReceiver,
  generateSecret,
  itemKey,
  moderationJsonSchemas,
  parseMessage,
  reportRequestSchema,
  signMessage,
  signedSamples,
  verifyMessage,
} from "./index";

const NOW = 1_800_000_000;

describe("Standard Webhooks signing", () => {
  it("agrees with an independent HMAC-SHA256 over `id.timestamp.body`", async () => {
    const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
    const id = "msg_p5jXN8AQM9LWM0D4loKWxJek";
    const body = '{"test": 2432232314}';
    const expected = createHmac(
      "sha256",
      Buffer.from(secret.slice("whsec_".length), "base64"),
    )
      .update(`${id}.1614265330.${body}`)
      .digest("base64");
    expect(await computeSignature(secret, id, 1614265330, body)).toBe(
      `v1,${expected}`,
    );
  });

  it("round-trips and rejects any change to the body, id or timestamp", async () => {
    const secret = generateSecret();
    const body = '{"a":1}';
    const headers = await signMessage(secret, body, {
      id: "msg_1",
      timestamp: NOW,
    });
    expect(await verifyMessage(secret, headers, body, { now: NOW })).toEqual({
      ok: true,
      id: "msg_1",
      timestamp: NOW,
    });
    expect(
      await verifyMessage(secret, headers, '{"a":2}', { now: NOW }),
    ).toEqual({ ok: false, reason: "bad_signature" });
    expect(
      await verifyMessage(secret, { ...headers, "webhook-id": "msg_2" }, body, {
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" });
    expect(
      await verifyMessage(generateSecret(), headers, body, { now: NOW }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("enforces the five-minute window in both directions", async () => {
    const secret = generateSecret();
    const headers = await signMessage(secret, "{}", { timestamp: NOW });
    expect(
      (await verifyMessage(secret, headers, "{}", { now: NOW + 300 })).ok,
    ).toBe(true);
    expect(
      await verifyMessage(secret, headers, "{}", { now: NOW + 301 }),
    ).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(
      await verifyMessage(secret, headers, "{}", { now: NOW - 301 }),
    ).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("refuses missing and malformed headers", async () => {
    const secret = generateSecret();
    expect(await verifyMessage(secret, {}, "{}")).toEqual({
      ok: false,
      reason: "missing_headers",
    });
    const headers = await signMessage(secret, "{}", { timestamp: NOW });
    expect(
      await verifyMessage(
        secret,
        { ...headers, "webhook-timestamp": "soon" },
        "{}",
        {
          now: NOW,
        },
      ),
    ).toEqual({ ok: false, reason: "bad_timestamp" });
    expect(
      await verifyMessage(
        secret,
        { ...headers, "webhook-signature": "v2,AAAA" },
        "{}",
        { now: NOW },
      ),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("accepts either secret during a rotation and reads Headers case-insensitively", async () => {
    const oldSecret = generateSecret();
    const newSecret = generateSecret();
    const headers = await signMessage(oldSecret, "{}", { timestamp: NOW });
    const asHeaders = new Headers({
      "Webhook-Id": headers["webhook-id"],
      "Webhook-Timestamp": headers["webhook-timestamp"],
      "Webhook-Signature": headers["webhook-signature"],
    });
    expect(
      (
        await verifyMessage([newSecret, oldSecret], asHeaders, "{}", {
          now: NOW,
        })
      ).ok,
    ).toBe(true);
  });
});

describe("messages", () => {
  it("parses every type and rejects a mismatched payload", () => {
    for (const type of [
      "content.hide",
      "content.remove",
      "content.restore",
      "user.suspend",
      "user.ban",
      "user.restore",
      "user.delete",
    ] as const) {
      expect(
        parseMessage(JSON.stringify(buildMessage({ type }))),
      ).not.toBeNull();
    }
    expect(parseMessage("not json")).toBeNull();
    expect(
      parseMessage(
        JSON.stringify({
          type: "content.hide",
          timestamp: new Date().toISOString(),
          data: { userId: SAMPLE_USER_ID, reason: null, reportId: null },
        }),
      ),
    ).toBeNull();
    expect(
      parseMessage(
        JSON.stringify({
          ...buildMessage({ type: "content.hide" }),
          type: "content.nuke",
        }),
      ),
    ).toBeNull();
  });

  it("keys content and users apart", () => {
    expect(itemKey(buildMessage({ type: "content.hide" }))).toBe(
      `content:${SAMPLE_CONTENT.contentType}:${SAMPLE_CONTENT.contentRef}`,
    );
    expect(itemKey(buildMessage({ type: "user.ban" }))).toBe(
      `user:${SAMPLE_USER_ID}`,
    );
  });

  it("exports JSON Schema for the spec package", () => {
    const schemas = moderationJsonSchemas();
    expect(Object.keys(schemas).sort()).toEqual([
      "ModerationMessage",
      "ReportError",
      "ReportRequest",
      "ReportResponse",
    ]);
    expect(schemas.ReportRequest.required).toContain("reporterUserId");
  });
});

describe("the report request", () => {
  const base = {
    reporterUserId: "00000000-0000-4000-8000-000000000001",
    authorUserId: "00000000-0000-4000-8000-000000000002",
    contentType: "session",
    contentRef: "s1",
    contentSnapshot: "text",
    reason: "spam",
  };

  it("takes an https content link and refuses every other scheme", () => {
    expect(
      reportRequestSchema.safeParse({
        ...base,
        contentUrl: "https://app.example/s/1",
      }).success,
    ).toBe(true);
    for (const contentUrl of [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "http://app.example/s/1",
      "ftp://app.example/s/1",
    ]) {
      expect(
        reportRequestSchema.safeParse({ ...base, contentUrl }).success,
        contentUrl,
      ).toBe(false);
    }
  });
});

describe("the reference receiver", () => {
  it("passes the conformance sequence: applied once, a replay ignored, an out-of-order message ignored", async () => {
    const store = createMemoryStore();
    const receiver = createReceiver({
      secret: SAMPLE_SECRET,
      store,
      verify: { now: Math.floor(Date.now() / 1000) },
    });

    const samples = await signedSamples({
      contentRef: SAMPLE_CONTENT.contentRef,
    });
    const outcomes: string[] = [];
    for (const sample of samples) {
      const response = await receiver.handle(sample.headers, sample.body);
      expect(response.status).toBe(200);
      outcomes.push(response.outcome ?? "none");
      expect(response.outcome, sample.name).toBe(sample.expected);
    }
    expect(outcomes).toEqual([
      "applied",
      "duplicate",
      "stale",
      "applied",
      "applied",
      "stale",
    ]);

    // The hide was applied once, then undone only by the newer restore.
    expect(store.applied.map((m) => m.type)).toEqual([
      "content.hide",
      "content.restore",
      "user.suspend",
    ]);
    expect(
      store.content.get(
        `${SAMPLE_CONTENT.contentType}:${SAMPLE_CONTENT.contentRef}`,
      ),
    ).toBe("visible");
    expect(store.users.get(SAMPLE_USER_ID)).toBe("suspended");
  });

  it("passes the conformance sequence again against the same store, because each run has its own message ids", async () => {
    const store = createMemoryStore();
    const receiver = createReceiver({
      secret: SAMPLE_SECRET,
      store,
      verify: { now: Math.floor(Date.now() / 1000) + 60 },
    });
    const start = Date.now();
    // Back to back and 10 s apart: the restore of one run is dated a second
    // after its hide, which must not make the next run's hide look stale.
    for (const now of [start, start + 5, start + 10_000]) {
      for (const sample of await signedSamples({ now })) {
        const response = await receiver.handle(sample.headers, sample.body);
        expect(response.outcome, sample.name).toBe(sample.expected);
      }
    }
  });

  it("refuses an unsigned or mis-signed request without touching the store", async () => {
    const store = createMemoryStore();
    const receiver = createReceiver({ secret: SAMPLE_SECRET, store });
    const [hide] = await signedSamples();
    expect((await receiver.handle({}, hide!.body)).status).toBe(401);
    expect(
      (
        await receiver.handle(
          { ...hide!.headers, "webhook-signature": "v1,AAAA" },
          hide!.body,
        )
      ).status,
    ).toBe(401);
    expect(store.applied).toHaveLength(0);
  });

  it("answers 400 for a signed body that is not a moderation message", async () => {
    const receiver = createReceiver({
      secret: SAMPLE_SECRET,
      store: createMemoryStore(),
    });
    const headers = await signMessage(SAMPLE_SECRET, '{"hello":1}');
    expect(await receiver.handle(headers, '{"hello":1}')).toEqual({
      status: 400,
      error: "invalid_body",
    });
  });

  it("serves the same contract as a fetch handler", async () => {
    const receiver = createReceiver({
      secret: SAMPLE_SECRET,
      store: createMemoryStore(),
    });
    const [hide] = await signedSamples();
    const response = await receiver.fetch(
      new Request("https://app.test/platform-moderation", {
        method: "POST",
        headers: hide!.headers,
        body: hide!.body,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "applied" });
    expect(
      (
        await receiver.fetch(
          new Request("https://app.test/x", { method: "GET" }),
        )
      ).status,
    ).toBe(405);
  });

  it("treats a replayed stale message as a duplicate, not stale twice", async () => {
    const store = createMemoryStore();
    await applyModerationEvent(
      store,
      "m1",
      buildMessage({
        type: "content.hide",
        timestamp: "2027-01-01T00:00:10.000Z",
      }),
    );
    const old = buildMessage({
      type: "content.restore",
      timestamp: "2027-01-01T00:00:00.000Z",
    });
    expect(await applyModerationEvent(store, "m2", old)).toBe("stale");
    expect(await applyModerationEvent(store, "m2", old)).toBe("duplicate");
  });
});

describe("the report client", () => {
  const request = {
    reporterUserId: "00000000-0000-4000-8000-0000000000c1",
    authorUserId: SAMPLE_USER_ID,
    contentType: "session",
    contentRef: "s-1",
    contentSnapshot: "a session title",
    reason: "spam",
  } as const;

  it("signs the exact body it sends and names its client", async () => {
    const secret = generateSecret();
    let seen: { url: string; headers: Headers; body: string } | undefined;
    const client = createModerationClient({
      baseUrl: "https://api-staging.devdogsuga.org/",
      clientId: "client-1",
      secret,
      fetch: (input, init) => {
        seen = {
          url: input as string,
          headers: new Headers(init?.headers),
          body: init?.body as string,
        };
        return Promise.resolve(
          Response.json({
            reportId: "00000000-0000-4000-8000-0000000000d1",
            corroborated: false,
            sandbox: true,
          }),
        );
      },
    });
    const result = await client.fileReport(request);
    expect(result.sandbox).toBe(true);
    expect(seen?.url).toBe(
      "https://api-staging.devdogsuga.org/moderation/v1/reports",
    );
    expect(seen?.headers.get(CLIENT_ID_HEADER)).toBe("client-1");
    expect((await verifyMessage(secret, seen!.headers, seen!.body)).ok).toBe(
      true,
    );
    expect(REASONS_PATH).toBe("/moderation/v1/reasons");
  });

  it("throws the platform's error code on a refusal", async () => {
    const client = createModerationClient({
      baseUrl: "https://api.test",
      clientId: "c",
      secret: generateSecret(),
      fetch: () =>
        Promise.resolve(
          Response.json(
            { error: { code: "rate_limited", message: "Too many reports" } },
            { status: 429 },
          ),
        ),
    });
    await expect(client.fileReport(request)).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
    await expect(client.fileReport(request)).rejects.toBeInstanceOf(
      ReportRejectedError,
    );
  });

  it("refuses a malformed report before sending anything", async () => {
    const client = createModerationClient({
      baseUrl: "https://api.test",
      clientId: "c",
      secret: generateSecret(),
      fetch: () => {
        throw new Error("must not be called");
      },
    });
    await expect(
      client.fileReport({ ...request, reason: "nope" as never }),
    ).rejects.toThrow();
  });
});
