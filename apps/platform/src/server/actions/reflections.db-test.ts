// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";

/**
 * `saveReflection` against a real database.
 *
 * The competition case is not "a member is refused a competition reflection"
 * -- it is that `eligibleActivity`'s competition branch used to run raw SQL
 * joining "teams" to "competitions" via "teams"."competitionId" and
 * filtering on "teams"."competedAt", both dropped by the teams-core
 * migration. That query failed to PARSE, so every competition-reflection
 * submission threw a raw Postgres error instead of the clean refusal this
 * test asserts on.
 *
 * The meeting case guards a second, adjacent bug this file's fix uncovered:
 * `eligibleActivity`'s meeting branch reads `m."endsAt"` through raw SQL,
 * which comes back as text (see the note in reflections/load.ts), not the
 * `Date` its declared return type claimed. `reflectionDeadline` calls
 * `.getTime()` on it, so every meeting reflection -- not just competition
 * ones -- threw before this fix. `expectSession` is mocked the same way
 * `server/actions/teams.db-test.ts` mocks it, so the action runs as a real
 * member without a request context.
 */

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
}));
// `saveReflection` revalidates the attendance page on success, which needs a
// request's static generation store that a plain Node test never has. Stub
// it the same way `expectSession` is stubbed above, rather than reaching for
// a full Next.js request context just to prove the action wrote correctly.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { saveReflection } = await import("~/server/actions/reflections");

const IDS = {
  member: "e4000000-0000-4000-a000-000000000001",
  team: "e4000000-0000-4000-a000-000000000002",
  workshop: "e4000000-0000-4000-a000-000000000003",
  workshopMeeting: "e4000000-0000-4000-a000-000000000004",
  competition: "e4000000-0000-4000-a000-000000000005",
  meeting: "e4000000-0000-4000-a000-000000000006",
};

async function cleanup() {
  // Revisions and audit events are append-only (a trigger rejects
  // delete/update), so the fixture teardown has to step around it the same
  // way `recordAttendance`'s db-test does.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."reflectionRevisions" where "userId" = ${IDS.member}::uuid
    `);
    await tx.execute(sql`
      delete from platform."auditEvents" where "actorUserId" = ${IDS.member}::uuid
    `);
  });
  await db.execute(
    sql`delete from platform.reflections where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform.attendance where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform."teamMembers" where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform.teams where id = ${IDS.team}::uuid`,
  );
  await db.execute(
    sql`delete from platform.competitions where id = ${IDS.competition}::uuid`,
  );
  await db.execute(
    sql`delete from platform.workshops where id = ${IDS.workshop}::uuid`,
  );
  await db.execute(sql`
    delete from platform.meetings
    where id in (${IDS.workshopMeeting}::uuid, ${IDS.meeting}::uuid)
  `);
  await db.execute(
    sql`delete from platform.profile where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(sql`delete from auth.users where id = ${IDS.member}::uuid`);
}

beforeAll(async () => {
  await cleanup();
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${IDS.member}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'reflections-action-test@uga.edu')
  `);
  await db.execute(sql`
    insert into platform.profile ("userId", "preferredName")
    values (${IDS.member}::uuid, 'Reflections Action Member')
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, "startsAt", "endsAt", "countsForCredit")
    values
      (${IDS.workshopMeeting}::uuid, 'reflections-action-workshop-meeting',
       now() - interval '3 days', now() - interval '3 days' + interval '2 hours', true),
      (${IDS.meeting}::uuid, 'reflections-action-meeting',
       now() - interval '1 days', now() - interval '1 days' + interval '2 hours', true)
  `);
  await db.execute(sql`
    insert into platform.attendance (id, "userId", "meetingId", method, "recordedAt")
    values (gen_random_uuid(), ${IDS.member}::uuid, ${IDS.meeting}::uuid, 'qr', now())
  `);
  await db.execute(sql`
    insert into platform.workshops (id, "meetingId", title, project)
    values (${IDS.workshop}::uuid, ${IDS.workshopMeeting}::uuid,
            'Action Comp Workshop', 'Action Comp Project')
  `);
  await db.execute(sql`
    insert into platform.competitions (id, slug, "workshopId", "elEligible")
    values (${IDS.competition}::uuid, 'reflections-action-competition',
            ${IDS.workshop}::uuid, true)
  `);
  // On a team, which used to be exactly what made the dropped-column join
  // "eligible" -- present so this proves the refusal, not an absent roster.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.team}::uuid, 'reflections-action-team', 'Reflections Action Team',
            'ABC456', ${IDS.member}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" (id, "teamId", "userId", role)
    values (gen_random_uuid(), ${IDS.team}::uuid, ${IDS.member}::uuid, 'lead')
  `);
});

afterAll(cleanup);

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

describe("saveReflection", () => {
  it("refuses a competition reflection with a clean message instead of erroring", async () => {
    session.userId = IDS.member;
    const result = await saveReflection(
      { ok: false, message: "" },
      formData({
        activityType: "competition",
        activityId: IDS.competition,
        content: "My reflection",
        intent: "save",
      }),
    );
    expect(result).toEqual({
      ok: false,
      message: "You are not eligible for this reflection.",
    });
  });

  it("saves a meeting reflection instead of throwing on the decoded deadline", async () => {
    session.userId = IDS.member;
    const result = await saveReflection(
      { ok: false, message: "" },
      formData({
        activityType: "meeting",
        activityId: IDS.meeting,
        content: "My meeting reflection",
        intent: "save",
      }),
    );
    expect(result).toEqual({ ok: true, message: "Draft saved." });
  });
});
