// @vitest-environment node
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  competitionEntries,
  memberStars,
  teamMembers,
} from "~/server/db/schema";

/**
 * The competition branch of `platform."memberStars"`
 * (supabase/migrations/20260829050100_16_platform_team_awards.sql), against a
 * real database.
 *
 * `getStarsForUser` is not the target here: it is a thin projection over this
 * same view, and a unit test cannot exercise a Postgres `join`'s boundary
 * conditions. These cases select from the view directly so a regression in
 * the join predicates (`"joinedAt" <= "openedAt"`, `"leftAt" > "openedAt"`,
 * `"openedAt" < "closedAt"`) fails here instead of showing up as a member
 * quietly missing -- or wrongly keeping -- a star.
 */

const REPO = "DevDogsUGA/DevDogsUGA";

const IDS = {
  team: "e1000000-0000-4000-a000-000000000001",
  otherTeam: "e1000000-0000-4000-a000-000000000002",
  creator: "e1000000-0000-4000-a000-000000000099",
  openCompetition: "e2000000-0000-4000-a000-000000000001",
  closedCompetition: "e2000000-0000-4000-a000-000000000002",
  lateJoiner: "e3000000-0000-4000-a000-000000000001",
  earlyLeaver: "e3000000-0000-4000-a000-000000000002",
  bothTeams: "e3000000-0000-4000-a000-000000000003",
};

const USER_IDS = [IDS.creator, IDS.lateJoiner, IDS.earlyLeaver, IDS.bothTeams];

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// closedCompetition's "closedAt", fixed relative to the other fixture dates
// below rather than `now()` so every case's "before/after the close" ordering
// is exact instead of racing a wall clock.
const CLOSED_AT = daysAgo(5);

async function cleanup() {
  await db.execute(
    sql`delete from platform."competitionEntries" where "prNodeId" like 'PR_starsdbtest%'`,
  );
  await db.execute(
    sql`delete from platform.competitions where id in (${IDS.openCompetition}::uuid, ${IDS.closedCompetition}::uuid)`,
  );
  await db.execute(
    sql`delete from platform.teams where id in (${IDS.team}::uuid, ${IDS.otherTeam}::uuid)`,
  );
  await db.execute(
    sql`delete from auth.users where id in (${sql.join(
      USER_IDS.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`,
  );
}

async function starFor(userId: string, competitionId: string) {
  const [row] = await db
    .select()
    .from(memberStars)
    .where(
      and(
        eq(memberStars.userId, userId),
        eq(memberStars.competitionId, competitionId),
      ),
    );
  return row ?? null;
}

beforeEach(async () => {
  await cleanup();

  for (const id of USER_IDS) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${`stars-dbtest-${id}@uga.edu`})
    `);
  }

  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values
      (${IDS.team}::uuid, 'stars-db-test-team', 'Stars DB Test Team', 'ABC234', ${IDS.creator}::uuid),
      (${IDS.otherTeam}::uuid, 'stars-db-test-other', 'Stars DB Test Other', 'DEF234', ${IDS.creator}::uuid)
  `);
  await db.execute(sql`
    insert into platform.competitions
      (id, slug, "issueNodeId", "issueNumber", repo, url, title, "kickedOffAt", "closedAt")
    values
      (${IDS.openCompetition}::uuid, 'stars-db-test-open', 'I_starsdbtest_open', 201,
       ${REPO}, ${`https://github.com/${REPO}/issues/201`}, 'Open Competition',
       ${daysAgo(10).toISOString()}, null),
      (${IDS.closedCompetition}::uuid, 'stars-db-test-closed', 'I_starsdbtest_closed', 202,
       ${REPO}, ${`https://github.com/${REPO}/issues/202`}, 'Closed Competition',
       ${daysAgo(20).toISOString()}, ${CLOSED_AT.toISOString()})
  `);
});
afterAll(cleanup);

describe("memberStars: competition branch", () => {
  it("gives no star to a member who joined after the entry opened", async () => {
    // Entry opened day -8; the member joins day -6 -- after the fact, not
    // present when the team entered.
    await db.insert(competitionEntries).values({
      competitionId: IDS.openCompetition,
      teamId: IDS.team,
      prNodeId: "PR_starsdbtest_1",
      prNumber: 1,
      url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/1",
      openedAt: daysAgo(8),
    });
    await db.insert(teamMembers).values({
      teamId: IDS.team,
      userId: IDS.lateJoiner,
      joinedAt: daysAgo(6),
    });

    expect(await starFor(IDS.lateJoiner, IDS.openCompetition)).toBeNull();
  });

  it("keeps the star for a member who left after the entry opened", async () => {
    // Present when the team entered (day -8), left later (day -6) -- still
    // counts, because "leftAt" only has to be after "openedAt".
    await db.insert(competitionEntries).values({
      competitionId: IDS.openCompetition,
      teamId: IDS.team,
      prNodeId: "PR_starsdbtest_2",
      prNumber: 2,
      url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/2",
      openedAt: daysAgo(8),
    });
    await db.insert(teamMembers).values({
      teamId: IDS.team,
      userId: IDS.earlyLeaver,
      joinedAt: daysAgo(10),
      leftAt: daysAgo(6),
    });

    const row = await starFor(IDS.earlyLeaver, IDS.openCompetition);
    expect(row).not.toBeNull();
    expect(row?.won).toBe(false);
  });

  it("gives no star for an entry opened after the competition closed", async () => {
    // The normal ingestion path (applyPullRequest) never produces a row like
    // this -- see pullRequest.db-test.ts -- but the view's own guard has to
    // hold independently, e.g. against a competition closed out from under
    // an entry a reconcile pass already recorded.
    await db.insert(teamMembers).values({
      teamId: IDS.team,
      userId: IDS.lateJoiner,
      joinedAt: daysAgo(30),
    });
    await db.insert(competitionEntries).values({
      competitionId: IDS.closedCompetition,
      teamId: IDS.team,
      prNodeId: "PR_starsdbtest_3",
      prNumber: 3,
      url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/3",
      // After CLOSED_AT (closedCompetition's "closedAt", day -5).
      openedAt: daysAgo(4),
    });

    expect(await starFor(IDS.lateJoiner, IDS.closedCompetition)).toBeNull();
  });

  it("gives one star, not two, to a member who entered via two teams", async () => {
    await db.insert(teamMembers).values([
      { teamId: IDS.team, userId: IDS.bothTeams, joinedAt: daysAgo(30) },
      { teamId: IDS.otherTeam, userId: IDS.bothTeams, joinedAt: daysAgo(30) },
    ]);
    await db.insert(competitionEntries).values([
      {
        competitionId: IDS.openCompetition,
        teamId: IDS.team,
        prNodeId: "PR_starsdbtest_4",
        prNumber: 4,
        url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/4",
        openedAt: daysAgo(8),
      },
      {
        competitionId: IDS.openCompetition,
        teamId: IDS.otherTeam,
        prNodeId: "PR_starsdbtest_5",
        prNumber: 5,
        url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/5",
        openedAt: daysAgo(7),
        mergedAt: daysAgo(1),
      },
    ]);

    const rows = await db
      .select()
      .from(memberStars)
      .where(
        and(
          eq(memberStars.userId, IDS.bothTeams),
          eq(memberStars.competitionId, IDS.openCompetition),
        ),
      );
    expect(rows).toHaveLength(1);
    // `bool_or` across both entries: the second team's merged entry still
    // wins the star even though the first team's did not.
    expect(rows[0]?.won).toBe(true);
  });
});
