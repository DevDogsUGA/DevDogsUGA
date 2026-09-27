// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { teamMembers, teams } from "~/server/db/schema";
import {
  handleMembershipEvent,
  handleRefEvent,
  handleTeamEvent,
} from "./webhookEvents";

/**
 * The mirror writes the webhook route makes, against a real database.
 *
 * No GitHub client to mock: every handler under test reads only its
 * payload, which is the whole point of the seam (see this file's own doc
 * comment) -- so these are ordinary db-tests, seeding rows and asserting on
 * `teams`/`teamMembers` afterward, the same shape `requireCanJoin.db-test.ts`
 * uses.
 */

const IDS = {
  team: "c7777777-7777-7777-7777-777777777701",
  lead: "c9977777-7777-7777-7777-777777777791",
  linked: "c9977777-7777-7777-7777-777777777792",
  unlinked: "c9977777-7777-7777-7777-777777777793",
};

async function cleanup() {
  await db.execute(
    sql`delete from platform.teams where id = ${IDS.team}::uuid`,
  );
  await db.execute(sql`
    delete from auth.users
    where id in (${IDS.lead}::uuid, ${IDS.linked}::uuid, ${IDS.unlinked}::uuid)
  `);
}

beforeAll(async () => {
  await cleanup();

  for (const [id, email] of [
    [IDS.lead, "webhook-lead@uga.edu"],
    [IDS.linked, "webhook-linked@uga.edu"],
    [IDS.unlinked, "webhook-unlinked@uga.edu"],
  ] as const) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email})
    `);
  }

  await db.execute(sql`
    insert into auth.identities (id, user_id, provider, provider_id, identity_data)
    values (gen_random_uuid(), ${IDS.linked}::uuid, 'github', 'webhook-linked-gh',
            ${JSON.stringify({ sub: "webhook-linked-gh", user_name: "webhook-linked" })}::jsonb)
  `);
});

beforeEach(async () => {
  await db.execute(
    sql`delete from platform.teams where id = ${IDS.team}::uuid`,
  );
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.team}::uuid, 'webhook-team', 'Webhook Team', 'ABC234', ${IDS.lead}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" ("teamId", "userId", role)
    values (${IDS.team}::uuid, ${IDS.lead}::uuid, 'lead')
  `);
});

afterAll(cleanup);

async function activeRow(userId: string) {
  const rows = await db
    .select({ id: teamMembers.id, leftAt: teamMembers.leftAt })
    .from(teamMembers)
    .where(
      sql`${teamMembers.teamId} = ${IDS.team}::uuid and ${teamMembers.userId} = ${userId}::uuid and ${teamMembers.leftAt} is null`,
    );
  return rows[0] ?? null;
}

async function syncedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ githubSyncedAt: teams.githubSyncedAt })
    .from(teams)
    .where(sql`${teams.id} = ${IDS.team}::uuid`);
  return row?.githubSyncedAt ?? null;
}

describe("handleMembershipEvent", () => {
  it("opens a mirror row on 'added', matched by GitHub login", async () => {
    await handleMembershipEvent(db, {
      action: "added",
      scope: "team",
      member: { login: "webhook-linked" },
      team: { slug: "team-webhook-team", name: "team-webhook-team" },
    });

    expect(await activeRow(IDS.linked)).not.toBeNull();
    expect(await syncedAt()).not.toBeNull();
  });

  it("is idempotent: a redelivered 'added' does not open a second row", async () => {
    const apply = () =>
      handleMembershipEvent(db, {
        action: "added",
        scope: "team",
        member: { login: "webhook-linked" },
        team: { slug: "team-webhook-team", name: "team-webhook-team" },
      });
    await apply();
    await apply();

    const rows = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        sql`${teamMembers.teamId} = ${IDS.team}::uuid and ${teamMembers.userId} = ${IDS.linked}::uuid`,
      );
    expect(rows).toHaveLength(1);
  });

  it("closes the active row on 'removed'", async () => {
    await handleMembershipEvent(db, {
      action: "added",
      scope: "team",
      member: { login: "webhook-linked" },
      team: { slug: "team-webhook-team", name: "team-webhook-team" },
    });
    await handleMembershipEvent(db, {
      action: "removed",
      scope: "team",
      member: { login: "webhook-linked" },
      team: { slug: "team-webhook-team", name: "team-webhook-team" },
    });

    expect(await activeRow(IDS.linked)).toBeNull();
  });

  it("ignores a login with no linked GitHub identity", async () => {
    await handleMembershipEvent(db, {
      action: "added",
      scope: "team",
      member: { login: "webhook-unlinked" },
      team: { slug: "team-webhook-team", name: "team-webhook-team" },
    });

    expect(await activeRow(IDS.unlinked)).toBeNull();
  });

  it("ignores a team this platform never provisioned", async () => {
    await expect(
      handleMembershipEvent(db, {
        action: "added",
        scope: "team",
        member: { login: "webhook-linked" },
        team: {
          slug: "team-some-other-club-team",
          name: "team-some-other-club-team",
        },
      }),
    ).resolves.toBeUndefined();
    expect(await activeRow(IDS.linked)).toBeNull();
  });

  it("ignores an organization-scoped membership event", async () => {
    await handleMembershipEvent(db, {
      action: "added",
      scope: "organization",
      member: { login: "webhook-linked" },
      team: { slug: "team-webhook-team", name: "team-webhook-team" },
    });
    expect(await activeRow(IDS.linked)).toBeNull();
  });
});

describe("handleTeamEvent", () => {
  it("deletes the mirror row on 'deleted', cascading teamMembers", async () => {
    await handleTeamEvent(db, {
      action: "deleted",
      team: { slug: "team-webhook-team", name: "team-webhook-team" },
    });

    const [row] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(sql`${teams.id} = ${IDS.team}::uuid`);
    expect(row).toBeUndefined();
  });

  it("is a no-op redelivered against an already-deleted team", async () => {
    await handleTeamEvent(db, {
      action: "deleted",
      team: { slug: "team-webhook-team", name: "team-webhook-team" },
    });
    await expect(
      handleTeamEvent(db, {
        action: "deleted",
        team: { slug: "team-webhook-team", name: "team-webhook-team" },
      }),
    ).resolves.toBeUndefined();
  });

  it("does not touch the mirror on a rename -- only reports it", async () => {
    await expect(
      handleTeamEvent(db, {
        action: "edited",
        team: {
          slug: "team-webhook-team-renamed",
          name: "team-webhook-team-renamed",
        },
        changes: { name: { from: "team-webhook-team" } },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("handleRefEvent", () => {
  it("marks the mirror synced on 'create'", async () => {
    expect(await syncedAt()).toBeNull();
    await handleRefEvent(db, "create", {
      ref: "team/webhook-team",
      ref_type: "branch",
    });
    expect(await syncedAt()).not.toBeNull();
  });

  it("marks the mirror synced on 'delete', and reports it", async () => {
    await handleRefEvent(db, "delete", {
      ref: "team/webhook-team",
      ref_type: "branch",
    });
    expect(await syncedAt()).not.toBeNull();
  });

  it("ignores a tag ref", async () => {
    await expect(
      handleRefEvent(db, "create", { ref: "v1.0.0", ref_type: "tag" }),
    ).resolves.toBeUndefined();
    expect(await syncedAt()).toBeNull();
  });

  it("ignores a branch that is not a team branch", async () => {
    await expect(
      handleRefEvent(db, "create", { ref: "main", ref_type: "branch" }),
    ).resolves.toBeUndefined();
    expect(await syncedAt()).toBeNull();
  });
});
