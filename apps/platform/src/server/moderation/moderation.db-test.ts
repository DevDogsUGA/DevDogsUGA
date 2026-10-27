// @vitest-environment node
import {
  CLIENT_ID_HEADER,
  SAMPLE_CONTENT,
  createMemoryStore,
  createModerationClient,
  createReceiver,
  type ReportRequest,
} from "@devdogsuga/sdk/moderation";
import { sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// The Worker bindings the code under test reads: a queue that records what is
// sent to it. Everything else (the database, the SQL, the signing) is real.
const queued: { body: { deliveryId: string } }[] = [];
vi.mock("cloudflare:workers", () => ({
  env: {
    MODERATION_DELIVERIES: {
      sendBatch: (messages: { body: { deliveryId: string } }[]) => {
        queued.push(...messages);
        return Promise.resolve();
      },
    },
  },
}));

// The console's server action asks who is signed in. The ban call at its end is
// never reached for these decisions.
let signedInAs = "";
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(signedInAs),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("~/supabase/admin", () => ({
  supabaseAdmin: { auth: { admin: { updateUserById: vi.fn() } } },
}));

const alerts = vi.hoisted(() => ({ postAlert: vi.fn() }));
vi.mock("~/server/alerts", () => alerts);

import { env } from "~/env";
import { db } from "~/server/db";
import { resolveReport, updateUserRole } from "~/server/actions/moderation";
import { registerExternalApp } from "~/server/actions/moderationDeliveries";
import oauthModerationAction from "~/server/actions/oauthModeration";
import { handleFileReport } from "./api";
import { attemptDelivery } from "./delivery";
import { databaseDeliveryStore, resetForResend } from "./deliveryStore";
import { markDeadLettered } from "./deadLetter";
import { requeueStaleDeliveries } from "./queue";
import { databaseReportApi, findClient } from "./store";
import { deriveClientSecret } from "./secrets";
import { deleteMembers, insertMember } from "../loaders/publicProfileFixtures";

/**
 * Checkpoint 3d, against a real database: a report filed over the signed API
 * goes through the console's decision action and out as a signed delivery that
 * a receiver applies once, ignores a replay of, and ignores when it arrives
 * out of order.
 *
 * Ids are all `e3...` and swept before and after.
 */

const id = (kind: string, n: number) =>
  `e3000000-0000-4000-${kind}-0000000000${String(n).padStart(2, "0")}`;
const REPORTER = id("a000", 1);
const AUTHOR = id("a000", 2);
const MODERATOR = id("a000", 3);
const OTHER_REPORTER = id("a000", 4);
const OWNER = id("a000", 5);
const MEMBERS = [REPORTER, AUTHOR, MODERATOR, OTHER_REPORTER, OWNER] as const;

const PROD_CLIENT = id("b000", 1);
const OTHER_CLIENT = id("b000", 2);
const DEV_CLIENT = id("b000", 3);
const CLIENTS = [PROD_CLIENT, OTHER_CLIENT, DEV_CLIENT];

const MODERATOR_ROLE = id("c000", 1);
const SUSPENDER_ROLE = id("c000", 2);
const SLUGS = ["e3-dogpack", "e3-second"];
const ENDPOINT = "https://dogpack.example.com/functions/v1/platform-moderation";
const KEY = env.MODERATION_SIGNING_KEY!;
const slugList = sql.join(
  SLUGS.map((slug) => sql`${slug}`),
  sql`, `,
);

async function cleanup() {
  await db.execute(sql`
    delete from platform."moderationDeliveries"
    where "clientId" in (${sql.join(
      CLIENTS.map((c) => sql`${c}::uuid`),
      sql`, `,
    )})
       or "appId" in (select id from platform.apps where slug in (${slugList}))
  `);
  await db.execute(
    sql`delete from platform."oauthRegistrations" where "clientId" in (${sql.join(
      CLIENTS.map((c) => sql`${c}::uuid`),
      sql`, `,
    )})`,
  );
  await deleteMembers(MEMBERS);
  await db.execute(sql`delete from platform.apps where slug in (${slugList})`);
  await db.execute(
    sql`delete from auth.oauth_clients where id in (${sql.join(
      CLIENTS.map((c) => sql`${c}::uuid`),
      sql`, `,
    )})`,
  );
  await db.execute(
    sql`delete from platform.roles where id in (${MODERATOR_ROLE}::uuid, ${SUSPENDER_ROLE}::uuid)`,
  );
}

async function registerApp(
  slug: string,
  client: string,
  types = [
    {
      contentType: "session",
      label: "Study session",
      urlTemplate: "https://dogpack.example.com/s/{ref}",
    },
  ],
  { registration = true } = {},
) {
  // register_external_app needs a production registration (what /tools/oauth
  // writes); a test that wants another tier has already made its own.
  if (registration) {
    await db.execute(sql`
      insert into platform."oauthRegistrations" ("clientId", "userId", label, status)
      values (${client}::uuid, ${OWNER}::uuid, 'production', 'in_production')
      on conflict ("clientId") do nothing
    `);
  }
  const [row] = await db.execute<{ id: string }>(sql`
    select "platform".register_external_app(
      ${slug}, ${`App ${slug}`}, ${client}::uuid, ${ENDPOINT}, ${JSON.stringify(types)}::jsonb
    ) as id
  `);
  return row!.id;
}

beforeAll(async () => {
  await cleanup();
  for (const member of MEMBERS) {
    await insertMember({ id: member, verified: false });
  }
  for (const client of CLIENTS) {
    await db.execute(sql`
      insert into auth.oauth_clients (
        id, client_secret_hash, registration_type, redirect_uris, grant_types,
        client_name, client_type, token_endpoint_auth_method, created_at, updated_at
      ) values (
        ${client}::uuid, '', 'manual', 'http://localhost:3000/cb',
        'authorization_code,refresh_token', 'moderation db-test',
        'public', 'none', now(), now()
      )
    `);
  }
  await db.execute(sql`
    insert into platform."oauthRegistrations" ("clientId", "userId", label)
    values (${DEV_CLIENT}::uuid, ${OWNER}::uuid, 'dev')
  `);
  // The moderator also holds canManageOAuthApps: registering an app and
  // managing a production client's moderation both need it. The suspender has
  // the old gate (canManageSuspensions) and nothing else.
  await db.execute(sql`
    insert into platform.roles (id, title, rank, "canModerate", "canManageSuspensions", "canManageOAuthApps")
    values (${MODERATOR_ROLE}::uuid, 'e3 moderator', 987654.5, true, true, true),
           (${SUSPENDER_ROLE}::uuid, 'e3 suspender', 987654.6, false, true, false)
  `);
  await db.execute(sql`
    insert into platform."userRoles" ("userId", "roleId")
    values (${MODERATOR}::uuid, ${MODERATOR_ROLE}::uuid),
           (${OTHER_REPORTER}::uuid, ${SUSPENDER_ROLE}::uuid)
  `);
});

afterAll(cleanup);

beforeEach(async () => {
  queued.length = 0;
  alerts.postAlert.mockClear();
  signedInAs = MODERATOR;
  await db.execute(sql`delete from platform."rateLimitHits"`);
  await db.execute(
    sql`delete from platform.reports where "reporterUserId" in (${sql.join(
      MEMBERS.map((m) => sql`${m}::uuid`),
      sql`, `,
    )})`,
  );
  await db.execute(
    sql`delete from platform."moderationDeliveries" where "clientId" in (${sql.join(
      CLIENTS.map((c) => sql`${c}::uuid`),
      sql`, `,
    )})`,
  );
  await db.execute(
    sql`delete from platform."moderationClients" where "clientId" in (${sql.join(
      CLIENTS.map((c) => sql`${c}::uuid`),
      sql`, `,
    )})`,
  );
  await db.execute(sql`delete from platform.apps where slug in (${slugList})`);
  await db.execute(
    sql`delete from platform."sandboxReports" where "clientId" in (${sql.join(
      CLIENTS.map((c) => sql`${c}::uuid`),
      sql`, `,
    )})`,
  );
});

const report = (overrides: Partial<ReportRequest> = {}): ReportRequest => ({
  reporterUserId: REPORTER,
  authorUserId: AUTHOR,
  contentType: "session",
  contentRef: SAMPLE_CONTENT.contentRef,
  contentSnapshot: "Study session: come learn recursion",
  reason: "spam",
  ...overrides,
});

/** The app's backend: a signed client whose fetch is the API handler itself. */
async function appClient(clientId: string, version = 1) {
  const secret = await deriveClientSecret(KEY, clientId, version);
  return createModerationClient({
    baseUrl: "https://api.test",
    clientId,
    secret,
    fetch: (input, init) => {
      const request = new Request(input, init);
      expect(request.headers.get(CLIENT_ID_HEADER)).toBe(clientId);
      return handleFileReport(request, databaseReportApi());
    },
  });
}

/** The app's receiver, and the fetch the platform's delivery posts to it. */
async function appReceiver(clientId: string, version = 1) {
  const store = createMemoryStore();
  const receiver = createReceiver({
    secret: await deriveClientSecret(KEY, clientId, version),
    store,
  });
  const received: { id: string | null; outcome: string | undefined }[] = [];
  const fetchToApp: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    const result = await receiver.handle(headers, init?.body as string);
    received.push({ id: headers.get("webhook-id"), outcome: result.outcome });
    return Response.json(result, { status: result.status });
  };
  return { store, received, fetchToApp };
}

const deliver = (deliveryId: string, fetchToApp: typeof fetch) =>
  attemptDelivery(deliveryId, {
    store: databaseDeliveryStore,
    signingKey: KEY,
    fetch: fetchToApp,
  });

async function deliveriesOf(reportId: string) {
  return db.execute<{
    id: string;
    type: string;
    status: string;
    attempts: number;
    payload: { type: string; timestamp: string; data: Record<string, unknown> };
  }>(sql`
    select id, type, status, attempts, payload
    from platform."moderationDeliveries"
    where "reportId" = ${reportId}::uuid
    order by "createdAt"
  `);
}

describe("a report round trip through the console", () => {
  it("files over the signed API, decides in the console, and is applied once, replay ignored", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    const app = await appClient(PROD_CLIENT);
    const filed = await app.fileReport(report());
    expect(filed).toMatchObject({ corroborated: false, sandbox: false });

    // The moderator's queue has it, against the right app.
    const [row] = await db.execute<{ slug: string; status: string }>(sql`
      select a.slug, r.status from platform.reports r
      join platform.apps a on a.id = r."appId" where r.id = ${filed.reportId}::uuid
    `);
    expect(row).toEqual({ slug: "e3-dogpack", status: "open" });

    // The console decision: hide the content and suspend the author.
    await resolveReport(
      filed.reportId,
      "suspend",
      "no_action",
      "quarantine",
      "private note that must not leave the platform",
      false,
    );

    // Written in the decision's transaction, and queued after it.
    const deliveries = await deliveriesOf(filed.reportId);
    expect(deliveries.map((d) => d.type).sort()).toEqual([
      "content.hide",
      "user.suspend",
    ]);
    expect(deliveries.every((d) => d.status === "pending")).toBe(true);
    expect(queued.map((m) => m.body.deliveryId).sort()).toEqual(
      deliveries.map((d) => d.id).sort(),
    );
    const suspend = deliveries.find((d) => d.type === "user.suspend")!;
    // The reason is the report's category, never the moderator's note.
    expect(suspend.payload.data).toEqual({
      userId: AUTHOR,
      reason: "spam",
      reportId: filed.reportId,
    });
    expect(JSON.stringify(deliveries)).not.toContain("private note");

    // The consumer's job: attempt each delivery against the app's receiver.
    const { store, received, fetchToApp } = await appReceiver(PROD_CLIENT);
    for (const d of deliveries) {
      expect(await deliver(d.id, fetchToApp)).toEqual({
        ack: true,
        result: "delivered",
      });
    }
    expect(received.map((r) => r.outcome)).toEqual(["applied", "applied"]);
    expect(store.content.get(`session:${SAMPLE_CONTENT.contentRef}`)).toBe(
      "hidden",
    );
    expect(store.users.get(AUTHOR)).toBe("suspended");

    // A replay of an already-delivered message is skipped by the platform, and
    // ignored by the receiver when it does arrive (a duplicate queue delivery).
    expect(await deliver(deliveries[0]!.id, fetchToApp)).toEqual({
      ack: true,
      result: "skipped",
    });
    await db.execute(sql`
      update platform."moderationDeliveries" set status = 'pending'
      where id = ${deliveries[0]!.id}::uuid
    `);
    expect(await deliver(deliveries[0]!.id, fetchToApp)).toMatchObject({
      ack: true,
      result: "delivered",
    });
    expect(received.at(-1)).toEqual({
      id: `msg_${deliveries[0]!.id}`,
      outcome: "duplicate",
    });
    expect(store.applied).toHaveLength(2);
  });

  it("ignores an out-of-order message: a newer decision is not undone by an older one", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    const { store, received, fetchToApp } = await appReceiver(PROD_CLIENT);

    // Two decisions about the same user, a moment apart: suspend, then restore.
    await updateUserRole(AUTHOR, "suspended", "first");
    await new Promise((resolve) => setTimeout(resolve, 15));
    await updateUserRole(AUTHOR, "member");

    const rows = await db.execute<{ id: string; type: string }>(sql`
      select id, type from platform."moderationDeliveries"
      where "appId" = (select id from platform.apps where slug = 'e3-dogpack')
        and payload #>> '{data,userId}' = ${AUTHOR}
      order by "createdAt"
    `);
    expect(rows.map((r) => r.type)).toEqual(["user.suspend", "user.restore"]);

    // The restore arrives first, then the late suspend.
    await deliver(rows[1]!.id, fetchToApp);
    await deliver(rows[0]!.id, fetchToApp);
    expect(received.map((r) => r.outcome)).toEqual(["applied", "stale"]);
    expect(store.users.get(AUTHOR)).toBe("active");
  });

  it("keeps a failing delivery pending, parks it when retries run out, and a resend lands it", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    const filed = await (await appClient(PROD_CLIENT)).fileReport(report());
    await resolveReport(filed.reportId, "no_action", "no_action", "quarantine");
    const [delivery] = await deliveriesOf(filed.reportId);

    const down = () =>
      Promise.resolve(new Response("bad gateway", { status: 502 }));
    expect(await deliver(delivery!.id, down)).toMatchObject({
      ack: false,
      retryAfterSeconds: 30,
    });
    expect(await deliver(delivery!.id, down)).toMatchObject({
      ack: false,
      retryAfterSeconds: 60,
    });
    const [pending] = await deliveriesOf(filed.reportId);
    expect(pending).toMatchObject({ status: "pending", attempts: 2 });

    // The queue gave up: the DLQ consumer marks it failed.
    await markDeadLettered(delivery!.id);
    const [failed] = await deliveriesOf(filed.reportId);
    expect(failed!.status).toBe("failed");
    expect(alerts.postAlert).toHaveBeenCalledTimes(1);
    // A failed delivery is not retried by a stray queue message.
    const { fetchToApp, received } = await appReceiver(PROD_CLIENT);
    expect(await deliver(delivery!.id, fetchToApp)).toEqual({
      ack: true,
      result: "skipped",
    });
    expect(received).toHaveLength(0);

    // The console's resend resets it; now it lands.
    expect(await resetForResend(delivery!.id)).toBe(true);
    expect(await deliver(delivery!.id, fetchToApp)).toEqual({
      ack: true,
      result: "delivered",
    });
    expect(received.map((r) => r.outcome)).toEqual(["applied"]);
    // A delivered one cannot be reset.
    expect(await resetForResend(delivery!.id)).toBe(false);
  });

  it("re-queues what the queue never received, and only that", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    const filed = await (await appClient(PROD_CLIENT)).fileReport(report());
    await resolveReport(filed.reportId, "no_action", "no_action", "quarantine");
    const [delivery] = await deliveriesOf(filed.reportId);

    // resolveReport queued it, so it is stamped and not stale.
    expect(queued).toHaveLength(1);
    queued.length = 0;
    expect(await requeueStaleDeliveries()).toBe(0);

    // Lose the queue's copy: the stamp is old.
    await db.execute(sql`
      update platform."moderationDeliveries"
      set "queuedAt" = now() - interval '2 hours' where id = ${delivery!.id}::uuid
    `);
    expect(await requeueStaleDeliveries()).toBe(1);
    expect(queued.map((m) => m.body.deliveryId)).toEqual([delivery!.id]);
    expect(await requeueStaleDeliveries()).toBe(0);
  });

  it("does not re-queue a delivery that is still working through its retry backoff", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    const filed = await (await appClient(PROD_CLIENT)).fileReport(report());
    await resolveReport(filed.reportId, "no_action", "no_action", "quarantine");
    const [delivery] = await deliveriesOf(filed.reportId);
    queued.length = 0;

    // The receiver is down: six failed attempts, so the next one is due 960s
    // after the sixth. The queue stamp is old, but the last attempt is recent.
    const down = () =>
      Promise.resolve(new Response("bad gateway", { status: 502 }));
    for (let i = 0; i < 6; i++) await deliver(delivery!.id, down);
    await db.execute(sql`
      update platform."moderationDeliveries"
      set "queuedAt" = now() - interval '80 minutes',
          "lastAttemptAt" = now() - interval '20 minutes'
      where id = ${delivery!.id}::uuid
    `);
    expect(await requeueStaleDeliveries()).toBe(0);
    expect(queued).toHaveLength(0);

    // Once even the last attempt is older than the longest backoff, the queue
    // has lost it.
    await db.execute(sql`
      update platform."moderationDeliveries"
      set "queuedAt" = now() - interval '2 hours',
          "lastAttemptAt" = now() - interval '2 hours'
      where id = ${delivery!.id}::uuid
    `);
    expect(await requeueStaleDeliveries()).toBe(1);
  });

  it("records a failed delivery for an app with no endpoint instead of dropping it", async () => {
    const appId = await registerApp("e3-dogpack", PROD_CLIENT);
    await db.execute(
      sql`update platform."moderationClients" set "endpointUrl" = null where "appId" = ${appId}::uuid`,
    );
    const filed = await (await appClient(PROD_CLIENT)).fileReport(report());
    await resolveReport(filed.reportId, "no_action", "no_action", "quarantine");
    const [delivery] = await deliveriesOf(filed.reportId);
    expect(delivery!.status).toBe("failed");
    expect(queued).toHaveLength(0);
  });

  it("sends nothing to a soft-deleted client even if its registration row survived", async () => {
    const appId = await registerApp("e3-dogpack", PROD_CLIENT);
    const filed = await (await appClient(PROD_CLIENT)).fileReport(report());
    await resolveReport(filed.reportId, "no_action", "no_action", "quarantine");
    const [delivery] = await deliveriesOf(filed.reportId);
    expect(await databaseDeliveryStore.load(delivery!.id)).toMatchObject({
      clientId: PROD_CLIENT,
    });

    // Migration 61's trigger drops the row when GoTrue soft-deletes the client
    // (the foreign key stays satisfied: the row is only marked). Put one back, as
    // a stale write would, and the reads must still refuse it.
    try {
      await db.execute(
        sql`update auth.oauth_clients set deleted_at = now() where id = ${PROD_CLIENT}::uuid`,
      );
      const [dropped] = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from platform."moderationClients" where "clientId" = ${PROD_CLIENT}::uuid`,
      );
      expect(dropped!.n).toBe(0);
      await db.execute(
        sql`insert into platform."moderationClients" ("clientId", "appId", "endpointUrl") values (${PROD_CLIENT}::uuid, ${appId}::uuid, ${ENDPOINT})`,
      );
      expect(await findClient(PROD_CLIENT)).toBeNull();
      expect(await databaseDeliveryStore.load(delivery!.id)).toMatchObject({
        clientId: null,
        endpointUrl: null,
      });
    } finally {
      await db.execute(
        sql`update auth.oauth_clients set deleted_at = null where id = ${PROD_CLIENT}::uuid`,
      );
    }
  });

  it("delivers a global suspension to every external app, and a scoped one to the report's app only", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    await registerApp("e3-second", OTHER_CLIENT);
    const filed = await (await appClient(PROD_CLIENT)).fileReport(report());
    await resolveReport(
      filed.reportId,
      "ban",
      "suspend",
      "no_action",
      undefined,
      true,
    );
    const rows = await db.execute<{
      slug: string;
      type: string;
      user: string;
    }>(sql`
      select a.slug, d.type, d.payload #>> '{data,userId}' as "user"
      from platform."moderationDeliveries" d join platform.apps a on a.id = d."appId"
      where d."reportId" = ${filed.reportId}::uuid
      order by a.slug, d.type, "user"
    `);
    expect(
      rows.map(
        (r) =>
          `${r.slug} ${r.type} ${r.user === AUTHOR ? "author" : "reporter"}`,
      ),
    ).toEqual([
      "e3-dogpack user.ban author",
      "e3-dogpack user.suspend reporter",
      "e3-second user.ban author",
      "e3-second user.suspend reporter",
    ]);

    await db.execute(
      sql`delete from platform."userSuspensions" where "userId" in (${AUTHOR}::uuid, ${REPORTER}::uuid)`,
    );
    const scoped = await (
      await appClient(PROD_CLIENT)
    ).fileReport(report({ contentRef: "another" }));
    await resolveReport(
      scoped.reportId,
      "suspend",
      "no_action",
      "no_action",
      undefined,
      false,
    );
    const scopedRows = await db.execute<{ slug: string }>(sql`
      select a.slug from platform."moderationDeliveries" d join platform.apps a on a.id = d."appId"
      where d."reportId" = ${scoped.reportId}::uuid
    `);
    expect(scopedRows.map((r) => r.slug)).toEqual(["e3-dogpack"]);
  });
});

describe("the report API's database rules", () => {
  it("corroborates an open report instead of duplicating it", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    const app = await appClient(PROD_CLIENT);
    const first = await app.fileReport(report());
    const second = await app.fileReport(
      report({ reporterUserId: OTHER_REPORTER, reason: "harassment" }),
    );
    expect(second).toMatchObject({
      reportId: first.reportId,
      corroborated: true,
    });
    const [count] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from platform."reportCorroborations" where "reportId" = ${first.reportId}::uuid`,
    );
    expect(count!.n).toBe(1);
  });

  it("does not count the reporter's own resend as a corroboration", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    const app = await appClient(PROD_CLIENT);
    const first = await app.fileReport(report());
    const again = await app.fileReport(report());
    expect(again).toMatchObject({ reportId: first.reportId });
    const [count] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from platform."reportCorroborations" where "reportId" = ${first.reportId}::uuid`,
    );
    expect(count!.n).toBe(0);
  });

  it("refuses an undeclared content type, unknown users, suspended and test reporters", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    const app = await appClient(PROD_CLIENT);

    await expect(
      app.fileReport(report({ contentType: "comment" })),
    ).rejects.toMatchObject({
      status: 422,
      code: "unknown_content_type",
    });
    await expect(
      app.fileReport(report({ authorUserId: id("a000", 99) })),
    ).rejects.toMatchObject({ status: 422, code: "unknown_user" });

    await db.execute(
      sql`insert into platform."userSuspensions" ("userId", service) values (${REPORTER}::uuid, 'global')`,
    );
    await expect(app.fileReport(report())).rejects.toMatchObject({
      status: 403,
      code: "reporter_not_allowed",
    });
    await db.execute(
      sql`delete from platform."userSuspensions" where "userId" = ${REPORTER}::uuid`,
    );

    await db.execute(
      sql`insert into platform."oauthTestAccounts" ("testUserId", "ownerUserId") values (${REPORTER}::uuid, ${OWNER}::uuid)`,
    );
    await expect(app.fileReport(report())).rejects.toMatchObject({
      status: 403,
      code: "reporter_not_allowed",
    });
    await db.execute(
      sql`delete from platform."oauthTestAccounts" where "testUserId" = ${REPORTER}::uuid`,
    );
  });

  it("limits a reporter to ten reports an hour", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    const app = await appClient(PROD_CLIENT);
    for (let i = 0; i < 10; i++) {
      await app.fileReport(report({ contentRef: `item-${i}` }));
    }
    await expect(
      app.fileReport(report({ contentRef: "item-11" })),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("requires a description for 'other'", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    await expect(
      (await appClient(PROD_CLIENT)).fileReport(report({ reason: "other" })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a rotated-away secret and accepts the new one", async () => {
    await registerApp("e3-dogpack", PROD_CLIENT);
    await db.execute(
      sql`update platform."moderationClients" set "secretVersion" = 2 where "clientId" = ${PROD_CLIENT}::uuid`,
    );
    await expect(
      (await appClient(PROD_CLIENT, 1)).fileReport(report()),
    ).rejects.toMatchObject({
      status: 401,
      code: "bad_signature",
    });
    await expect(
      (await appClient(PROD_CLIENT, 2)).fileReport(report()),
    ).resolves.toMatchObject({ sandbox: false });
  });

  it("sends a development client's report to its sandbox, where no moderator queue sees it", async () => {
    await db.execute(
      sql`insert into platform."moderationClients" ("clientId", "endpointUrl") values (${DEV_CLIENT}::uuid, ${ENDPOINT})`,
    );
    const result = await (await appClient(DEV_CLIENT)).fileReport(report());
    expect(result.sandbox).toBe(true);

    const [sandbox] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from platform."sandboxReports" where "clientId" = ${DEV_CLIENT}::uuid`,
    );
    expect(sandbox!.n).toBe(1);
    const [real] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from platform.reports where "reporterUserId" = ${REPORTER}::uuid`,
    );
    expect(real!.n).toBe(0);
  });

  it("refuses a client that never turned moderation on", async () => {
    await expect(
      (await appClient(OTHER_CLIENT)).fileReport(report()),
    ).rejects.toMatchObject({
      status: 401,
      code: "unknown_client",
    });
  });
});

describe("registering an external app", () => {
  it("moves a registration to a replacement client and prunes undeclared types", async () => {
    const appId = await registerApp("e3-dogpack", PROD_CLIENT, [
      { contentType: "session", label: "Session", urlTemplate: null as never },
      { contentType: "profile", label: "Profile", urlTemplate: null as never },
    ]);
    await db.execute(
      sql`insert into platform."moderationClients" ("clientId") values (${OTHER_CLIENT}::uuid) on conflict do nothing`,
    );
    expect(
      await registerApp("e3-dogpack", OTHER_CLIENT, [
        {
          contentType: "session",
          label: "Session",
          urlTemplate: null as never,
        },
      ]),
    ).toBe(appId);

    const clients = await db.execute<{
      clientId: string;
      appId: string | null;
    }>(
      sql`select "clientId", "appId" from platform."moderationClients" where "clientId" in (${PROD_CLIENT}::uuid, ${OTHER_CLIENT}::uuid) order by "clientId"`,
    );
    expect(clients).toEqual([
      { clientId: PROD_CLIENT, appId: null },
      { clientId: OTHER_CLIENT, appId: appId },
    ]);
    const types = await db.execute<{ contentType: string }>(
      sql`select "contentType" from platform."externalContentTypes" where "appId" = ${appId}::uuid`,
    );
    expect(types.map((t) => t.contentType)).toEqual(["session"]);
  });

  it("shows the secret once, when registering is what first creates the client's moderation record", async () => {
    const form = (client: string) => {
      const data = new FormData();
      data.set("slug", "e3-dogpack");
      data.set("displayName", "DogPack");
      data.set("clientId", client);
      data.set("endpointUrl", ENDPOINT);
      data.set("contentTypes", "session | Study session");
      return data;
    };
    const first = await registerExternalApp(
      { ok: true, message: null },
      form(PROD_CLIENT),
    );
    expect(first).toMatchObject({ ok: true });
    expect(first.secret).toBe(await deriveClientSecret(KEY, PROD_CLIENT, 1));
    // The app can now sign reports with what was shown.
    await expect(
      (await appClient(PROD_CLIENT)).fileReport(report()),
    ).resolves.toMatchObject({ sandbox: false });

    // A second registration of the same client shows nothing.
    const again = await registerExternalApp(
      { ok: true, message: null },
      form(PROD_CLIENT),
    );
    expect(again.ok).toBe(true);
    expect(again.secret).toBeUndefined();
  });

  it("will not turn a platform app into an external one", async () => {
    await expect(
      db.execute(sql`
        select "platform".register_external_app('platform', 'x', ${PROD_CLIENT}::uuid, ${ENDPOINT},
          '[{"contentType":"a","label":"A"}]'::jsonb)
      `),
    ).rejects.toThrow();
  });

  it("keeps platform apps unchanged: quarantine still runs in the database", async () => {
    // The existing path is untouched by the external branch.
    const [app] = await db.execute<{ kind: string; schemaName: string }>(
      sql`select kind, "schemaName" from platform.apps where slug = 'platform'`,
    );
    expect(app).toEqual({ kind: "internal", schemaName: "platform" });
    await expect(
      db.execute(
        sql`insert into platform.apps (slug, "schemaName", "displayName") values ('e3-bad', null, 'bad')`,
      ),
    ).rejects.toThrow();
  });
});

describe("a development client's failing endpoint", () => {
  it("is marked failed when its retries run out, without alerting officers", async () => {
    await db.execute(
      sql`insert into platform."moderationClients" ("clientId", "endpointUrl") values (${DEV_CLIENT}::uuid, ${ENDPOINT})`,
    );
    const [row] = await db.execute<{ id: string }>(sql`
      insert into platform."moderationDeliveries" ("clientId", type, payload, sandbox, status)
      values (${DEV_CLIENT}::uuid, 'content.hide', '{"type":"content.hide"}'::jsonb, true, 'pending')
      returning id
    `);
    await markDeadLettered(row!.id);
    const [after] = await db.execute<{ status: string }>(
      sql`select status from platform."moderationDeliveries" where id = ${row!.id}::uuid`,
    );
    expect(after!.status).toBe("failed");
    expect(alerts.postAlert).not.toHaveBeenCalled();
  });
});

/**
 * `oauthRegistrations.status`: a Testing app cannot be registered as a
 * production moderation app, and an In production client nobody registered is
 * refused instead of sandboxed. The moderation API still speaks in
 * "development" / "production" tiers, derived from the status.
 */
describe("OAuth status", () => {
  const registration = async (
    client: string,
    tier: "development" | "production",
  ) => {
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "clientId" = ${client}::uuid`,
    );
    await db.execute(
      sql`insert into platform."oauthRegistrations" ("clientId", "userId", label, status) values (${client}::uuid, ${OWNER}::uuid, 'x', ${tier === "production" ? "in_production" : "testing"}::platform."oauthStatus")`,
    );
  };

  it("reports the tier, and null for a client with no registration", async () => {
    await registration(DEV_CLIENT, "development");
    const tier = async (client: string) => {
      const [row] = await db.execute<{ tier: string | null }>(
        sql`select platform.moderation_client_tier(${client}::uuid) as tier`,
      );
      return row!.tier;
    };
    expect(await tier(DEV_CLIENT)).toBe("development");
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "clientId" = ${PROD_CLIENT}::uuid`,
    );
    expect(await tier(PROD_CLIENT)).toBeNull();
  });

  it("will not register a development client as a production app, and registers a production one", async () => {
    await registration(DEV_CLIENT, "development");
    await registration(PROD_CLIENT, "production");
    const refused = await registerApp("e3-dogpack", DEV_CLIENT).catch(
      (error: unknown) => error,
    );
    expect(String((refused as Error).cause)).toContain(
      "moderation:development_client",
    );
    await expect(registerApp("e3-dogpack", PROD_CLIENT)).resolves.toBeTruthy();
  });

  it("will not register a deleted client or one /tools/oauth never made", async () => {
    // No oauthRegistrations row: the dashboard made it, it has no tier.
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "clientId" = ${PROD_CLIENT}::uuid`,
    );
    const unregistered = await registerApp(
      "e3-dogpack",
      PROD_CLIENT,
      undefined,
      {
        registration: false,
      },
    ).catch((error: unknown) => error);
    expect(String((unregistered as Error).cause)).toContain(
      "moderation:client_unregistered",
    );

    await registration(PROD_CLIENT, "production");
    await db.execute(
      sql`update auth.oauth_clients set deleted_at = now() where id = ${PROD_CLIENT}::uuid`,
    );
    const deleted = await registerApp("e3-dogpack", PROD_CLIENT).catch(
      (error: unknown) => error,
    );
    expect(String((deleted as Error).cause)).toContain(
      "moderation:client_deleted",
    );
    await db.execute(
      sql`update auth.oauth_clients set deleted_at = null where id = ${PROD_CLIENT}::uuid`,
    );
  });

  it("refuses a production client that is not registered, where a development client still gets its sandbox", async () => {
    await registration(PROD_CLIENT, "production");
    await registration(DEV_CLIENT, "development");
    await db.execute(
      sql`insert into platform."moderationClients" ("clientId", "endpointUrl") values (${PROD_CLIENT}::uuid, ${ENDPOINT}), (${DEV_CLIENT}::uuid, ${ENDPOINT})`,
    );

    await expect(
      (await appClient(PROD_CLIENT)).fileReport(report()),
    ).rejects.toMatchObject({ status: 403, code: "client_not_registered" });
    const [none] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from platform."sandboxReports" where "clientId" = ${PROD_CLIENT}::uuid`,
    );
    expect(none!.n).toBe(0);

    await expect(
      (await appClient(DEV_CLIENT)).fileReport(report()),
    ).resolves.toMatchObject({ sandbox: true });

    // Registered, the same production client reaches moderators.
    await registerApp("e3-dogpack", PROD_CLIENT);
    await expect(
      (await appClient(PROD_CLIENT)).fileReport(report()),
    ).resolves.toMatchObject({ sandbox: false });
  });
});

/**
 * The `/tools/oauth` moderation controls under the OAuth tiers: a production
 * client is managed by whoever holds `canManageOAuthApps`, not by its owner, so
 * a secret copied wrongly at the Gate can be rotated without a database edit;
 * and every change to one is audited.
 */
describe("moderation controls on /tools/oauth", () => {
  const act = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    return oauthModerationAction(
      { clientId: null, secret: null, message: null, ok: true },
      data,
    );
  };

  const registerForm = (client: string) => {
    const data = new FormData();
    data.set("slug", "e3-dogpack");
    data.set("displayName", "DogPack");
    data.set("clientId", client);
    data.set("endpointUrl", ENDPOINT);
    data.set("contentTypes", "session | Study session");
    return data;
  };

  const auditCount = async (client: string, action: string) => {
    const [row] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from platform."auditEvents"
          where "targetType" = 'oauth_client' and "targetId" = ${client}
            and action = ${action}`,
    );
    return row!.n;
  };

  const tiered = async (client: string, tier: "development" | "production") => {
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "clientId" = ${client}::uuid`,
    );
    await db.execute(
      sql`insert into platform."oauthRegistrations" ("clientId", "userId", label, status) values (${client}::uuid, ${OWNER}::uuid, 'x', ${tier === "production" ? "in_production" : "testing"}::platform."oauthStatus")`,
    );
  };

  /** A registered production client with a moderation record. */
  const registeredProduction = async () => {
    await tiered(PROD_CLIENT, "production");
    await registerApp("e3-dogpack", PROD_CLIENT);
    await db.execute(
      sql`insert into platform."moderationClients" ("clientId", "endpointUrl")
          values (${PROD_CLIENT}::uuid, ${ENDPOINT}) on conflict do nothing`,
    );
  };

  it("lets a development client's owner turn it on once, and never shows the secret again", async () => {
    await tiered(DEV_CLIENT, "development");
    signedInAs = OWNER;
    const first = await act({ intent: "enable", clientId: DEV_CLIENT });
    expect(first.ok).toBe(true);
    expect(first.secret).toBe(await deriveClientSecret(KEY, DEV_CLIENT, 1));

    const second = await act({ intent: "enable", clientId: DEV_CLIENT });
    expect(second).toMatchObject({ ok: false, secret: null });
  });

  it("answers 'not found' to anyone but the owner of a development client", async () => {
    await tiered(DEV_CLIENT, "development");
    signedInAs = MODERATOR; // holds canManageOAuthApps, which is about production
    expect(await act({ intent: "enable", clientId: DEV_CLIENT })).toMatchObject(
      { ok: false, message: "OAuth client not found" },
    );
  });

  it("does not audit a development client's rotation", async () => {
    await tiered(DEV_CLIENT, "development");
    signedInAs = OWNER;
    await act({ intent: "enable", clientId: DEV_CLIENT });
    const result = await act({
      intent: "rotate-secret",
      clientId: DEV_CLIENT,
    });
    expect(result.secret).toBe(await deriveClientSecret(KEY, DEV_CLIENT, 2));
    expect(
      await auditCount(DEV_CLIENT, "oauth_client.moderation_secret_rotated"),
    ).toBe(0);
  });

  it("lets a holder of canManageOAuthApps register and rotate a production client's secret, and records both", async () => {
    await tiered(PROD_CLIENT, "production");
    signedInAs = MODERATOR;
    // A production client is turned on by registering it, which shows v1.
    const registered = await registerExternalApp(
      { ok: true, message: null },
      registerForm(PROD_CLIENT),
    );
    expect(registered.secret).toBe(
      await deriveClientSecret(KEY, PROD_CLIENT, 1),
    );
    expect(
      await auditCount(PROD_CLIENT, "oauth_client.moderation_registered"),
    ).toBeGreaterThan(0);

    const before = await auditCount(
      PROD_CLIENT,
      "oauth_client.moderation_secret_rotated",
    );
    const rotated = await act({
      intent: "rotate-secret",
      clientId: PROD_CLIENT,
    });
    expect(rotated).toMatchObject({ ok: true, clientId: PROD_CLIENT });
    expect(rotated.secret).toBe(await deriveClientSecret(KEY, PROD_CLIENT, 2));
    expect(
      await auditCount(PROD_CLIENT, "oauth_client.moderation_secret_rotated"),
    ).toBe(before + 1);
  });

  it("records an endpoint change on a production client", async () => {
    await registeredProduction();
    signedInAs = MODERATOR;
    const before = await auditCount(
      PROD_CLIENT,
      "oauth_client.moderation_endpoint_changed",
    );
    const result = await act({
      intent: "set-endpoint",
      clientId: PROD_CLIENT,
      endpointUrl: "https://dogpack.example.com/functions/v1/other",
    });
    expect(result.ok).toBe(true);
    expect(
      await auditCount(PROD_CLIENT, "oauth_client.moderation_endpoint_changed"),
    ).toBe(before + 1);
  });

  it("refuses a production client to its owner without the permission, and to a member with only canManageSuspensions", async () => {
    await registeredProduction();
    const rotations = () =>
      auditCount(PROD_CLIENT, "oauth_client.moderation_secret_rotated");
    const before = await rotations();
    for (const member of [OWNER, OTHER_REPORTER]) {
      signedInAs = member;
      expect(
        await act({ intent: "rotate-secret", clientId: PROD_CLIENT }),
      ).toMatchObject({ ok: false, message: "OAuth client not found" });
    }
    expect(await rotations()).toBe(before);
  });

  it("turns a production client on only by registering it, and sends no test actions to it", async () => {
    await tiered(PROD_CLIENT, "production");
    signedInAs = MODERATOR;
    const enable = await act({ intent: "enable", clientId: PROD_CLIENT });
    expect(enable).toMatchObject({ ok: false, secret: null });
    expect(enable.message).toContain("registering");

    await registeredProduction();
    const test = await act({
      intent: "send-test",
      clientId: PROD_CLIENT,
      type: "content.hide",
    });
    expect(test).toMatchObject({ ok: false });
    expect(test.message).toContain("production");
  });

  it("will not register an app for a member with only canManageSuspensions", async () => {
    await tiered(PROD_CLIENT, "production");
    signedInAs = OTHER_REPORTER;
    expect(
      await registerExternalApp(
        { ok: true, message: null },
        registerForm(PROD_CLIENT),
      ),
    ).toMatchObject({ ok: false, message: "You cannot register apps" });
  });
});
