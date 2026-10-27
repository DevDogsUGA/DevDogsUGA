// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import { buildMemberDataExport } from "./build";

/**
 * "Download my data" against a real database (account-deletion Q6): the
 * member's own rows are all there, and nothing of another member's or any
 * secret is. A second member's rows sit beside the first's on purpose, and the
 * file is searched as text for everything that must not be in it.
 */

const id = (n: number) =>
  `fb000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const ME = id(1);
const OTHER = id(2);
const MEETING = id(10);
const REPORT = id(11);
const APP = id(14);
const ME_REFLECTION = id(12);
const OTHER_REFLECTION = id(13);
const LIST = [ME, OTHER] as const;

const TOKEN = "gho_dbtest_secret_token";
const OTHER_TEXT = "OTHER-MEMBER-REFLECTION-TEXT";
const SNAPSHOT = "SNAPSHOT-OF-WHAT-THE-OTHER-MEMBER-WROTE";

async function cleanup() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."auditEvents"
      where "actorUserId" in (${ME}::uuid, ${OTHER}::uuid)
         or "targetId" in (${ME}, ${OTHER})`);
  });
  await db.execute(
    sql`delete from platform.reports where id = ${REPORT}::uuid`,
  );
  await db.execute(sql`delete from platform.apps where id = ${APP}::uuid`);
  await db.execute(
    sql`delete from platform.reflections where "meetingId" = ${MEETING}::uuid`,
  );
  await db.execute(
    sql`delete from platform.attendance where "meetingId" = ${MEETING}::uuid`,
  );
  await db.execute(
    sql`delete from platform.meetings where id = ${MEETING}::uuid`,
  );
  await deleteMembers(LIST);
}

beforeAll(async () => {
  await cleanup();
  await insertMember({ id: ME, preferredName: "Export Me", handle: "ex-me" });
  await insertMember({
    id: OTHER,
    preferredName: "Export Other",
    handle: "ex-other",
  });
  // A provider token in the identity payload, which must never leave.
  await db.execute(sql`
    update auth.identities
    set identity_data = identity_data || ${JSON.stringify({
      provider_token: TOKEN,
    })}::jsonb
    where user_id = ${ME}::uuid and provider = 'github'`);

  await db.execute(sql`
    insert into platform.meetings (id, slug, "startsAt", "endsAt", "countsForCredit")
    values (${MEETING}::uuid, 'export-db-test-meeting',
            now() - interval '1 day', now() - interval '1 day' + interval '2 hours', true)`);
  await db.execute(sql`
    insert into platform.attendance (id, "meetingId", "userId", method)
    values (gen_random_uuid(), ${MEETING}::uuid, ${ME}::uuid, 'qr'),
           (gen_random_uuid(), ${MEETING}::uuid, ${OTHER}::uuid, 'qr')`);
  await db.execute(sql`
    insert into platform.reflections (id, "userId", "meetingId", content)
    values (${ME_REFLECTION}::uuid, ${ME}::uuid, ${MEETING}::uuid, 'my own reflection'),
           (${OTHER_REFLECTION}::uuid, ${OTHER}::uuid, ${MEETING}::uuid, ${OTHER_TEXT})`);
  // A revision of mine saved by somebody else (an officer correcting it).
  await db.execute(sql`
    insert into platform."reflectionRevisions"
      ("reflectionId", "userId", "meetingId", content, "createdByUserId")
    values (${ME_REFLECTION}::uuid, ${ME}::uuid, ${MEETING}::uuid,
            'revision by an officer', ${OTHER}::uuid)`);

  await db.execute(sql`
    insert into platform.apps (id, slug, "displayName", kind)
    values (${APP}::uuid, 'export-db-test-app', 'Export test app', 'external')`);
  await db.execute(sql`
    insert into platform.reports
      (id, "appId", "reporterUserId", "reportedUserId", "contentType", "contentRef",
       "contentSnapshot", reason, description)
    values (${REPORT}::uuid, ${APP}::uuid, ${ME}::uuid, ${OTHER}::uuid,
            'post', 'post-1', ${SNAPSHOT}, 'spam', 'what I reported')`);
  // An action of mine on another member, with details that name them.
  await db.execute(sql`
    insert into platform."auditEvents"
      ("actorType", "actorUserId", source, action, "targetType", "targetId", metadata)
    values ('user', ${ME}::uuid, 'platform', 'user.example', 'user', ${OTHER},
            ${JSON.stringify({ name: "Export Other" })}::jsonb)`);
});

afterAll(cleanup);

describe("buildMemberDataExport", () => {
  it("holds the member's own rows", async () => {
    const data = await buildMemberDataExport(ME);

    expect(data.account?.id).toBe(ME);
    expect(data.profile?.preferredName).toBe("Export Me");
    expect(data.attendance.map((a) => a.meetingId)).toEqual([MEETING]);
    expect(data.reflections.map((r) => r.content)).toEqual([
      "my own reflection",
    ]);
    expect(data.reflectionRevisions[0]).toMatchObject({
      content: "revision by an officer",
      savedBy: "an officer",
    });
    expect(data.linkedAccounts.map((a) => a.provider).sort()).toContain(
      "github",
    );
    expect(data.notes.join(" ")).toContain("DogDays and DogPack");
  });

  it("holds nothing of another member's, and no secret", async () => {
    const text = JSON.stringify(await buildMemberDataExport(ME));

    expect(text).not.toContain(OTHER);
    expect(text).not.toContain(OTHER_TEXT);
    expect(text).not.toContain(SNAPSHOT);
    expect(text).not.toContain("Export Other");
    expect(text).not.toContain(TOKEN);
    expect(text).not.toMatch(/client_secret|clientSecret|secret_hash/i);
  });

  it("keeps a report the member filed, without who it was about", async () => {
    const data = await buildMemberDataExport(ME);
    expect(data.reportsFiled).toHaveLength(1);
    expect(data.reportsFiled[0]).toMatchObject({
      description: "what I reported",
    });
    expect(JSON.stringify(data.reportsFiled)).not.toContain(OTHER);
  });

  it("shows an action on another member without naming them", async () => {
    const data = await buildMemberDataExport(ME);
    const event = data.auditEvents.find((e) => e.action === "user.example");
    expect(event).toMatchObject({
      targetId: "another member",
      metadata: null,
    });
  });
});
