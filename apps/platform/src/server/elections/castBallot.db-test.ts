// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { isUniqueViolation, sqlState } from "~/server/teams/errors";

/**
 * The ballot write path, against a real database.
 *
 * Exercised as SQL rather than through `castBallot` because the action calls
 * `expectSession`, and the parts worth proving are the ones Postgres enforces:
 * the composite foreign key that ties a ballot's electorate to its election,
 * and the unique index that decides the double-submit race. An
 * application-level test cannot substitute for either. A race is won or lost in
 * the index, not in the code that reads before writing.
 */

const IDS = {
  project: "11111111-1111-1111-1111-111111111111",
  meeting: "22222222-2222-2222-2222-222222222222",
  workshop: "33333333-3333-3333-3333-333333333333",
  competition: "44444444-4444-4444-4444-444444444444",
  teamA: "55555555-5555-5555-5555-555555555555",
  teamB: "66666666-6666-6666-6666-666666666666",
  election: "77777777-7777-7777-7777-777777777777",
  tiebreak: "88888888-8888-8888-8888-888888888888",
  lead: "99999999-9999-9999-9999-999999999999",
};

async function seed() {
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${IDS.lead}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'ballot-test@uga.edu')
    on conflict (id) do nothing
  `);
  await db.execute(sql`
    insert into platform.projects (id, slug, "displayName")
    values (${IDS.project}::uuid, 'ballot-test-project', 'Ballot Test')
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, "nameOverride", "startsAt", "endsAt")
    values (${IDS.meeting}::uuid, 'ballot-test-meeting', 'Ballot Test',
            now() - interval '2 days', now() - interval '2 days' + interval '2 hours')
  `);
  await db.execute(sql`
    insert into platform.workshops (id, "meetingId", "projectId")
    values (${IDS.workshop}::uuid, ${IDS.meeting}::uuid, ${IDS.project}::uuid)
  `);
  await db.execute(sql`
    insert into platform.competitions (id, slug, "workshopId", "judgingStartsAt")
    values (${IDS.competition}::uuid, 'ballot-test-comp', ${IDS.workshop}::uuid, now())
  `);

  for (const [id, slug, name] of [
    [IDS.teamA, "team-a", "Team A"],
    [IDS.teamB, "team-b", "Team B"],
  ] as const) {
    // The entry triple: `submissionUrl`, `submissionState` and `submittedAt`
    // are constrained to be all null or all set. Two check constraints enforce
    // it, and between them they are why the PR webhook stamps `submittedAt`
    // with a coalesce rather than only on `opened`.
    await db.execute(sql`
      insert into platform.teams (id, "competitionId", slug, name, "joinCode",
                                  "createdBy", "submissionState", "submissionUrl",
                                  "submittedAt")
      values (${id}::uuid, ${IDS.competition}::uuid, ${slug}, ${name},
              ${slug.toUpperCase()}, ${IDS.lead}::uuid, 'open',
              ${`https://github.com/example/pull/${slug}`}, now())
    `);
  }

  await db.execute(sql`
    insert into platform."teamMembers" ("teamId", "competitionId", "userId", role)
    values (${IDS.teamA}::uuid, ${IDS.competition}::uuid, ${IDS.lead}::uuid, 'lead')
  `);

  await db.execute(sql`
    insert into platform.elections (id, "competitionId", slug, title, electorate, purpose, "opensAt", "closesAt", status)
    values (${IDS.election}::uuid, ${IDS.competition}::uuid, 'ballot-test-election',
            'Ballot Test Election', 'teams', 'points',
            now() - interval '1 hour', now() + interval '1 hour', 'open')
  `);
}

/**
 * Meetings first, then projects.
 *
 * `workshops.projectId` is `on delete restrict` while `workshops.meetingId`
 * cascades. Deleting the meeting takes the workshop with it, along with the
 * competition, the teams, the election and the ballots, which then frees the
 * project. The other order fails on the restrict.
 */
async function cleanup() {
  await db.execute(
    sql`delete from platform.meetings where id = ${IDS.meeting}::uuid`,
  );
  await db.execute(
    sql`delete from platform.projects where id = ${IDS.project}::uuid`,
  );
  await db.execute(sql`delete from auth.users where id = ${IDS.lead}::uuid`);
}

beforeAll(async () => {
  await cleanup();
  await seed();
});

afterAll(cleanup);

async function castTeamBallot(teamId: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      insert into platform.ballots ("electionId", electorate, "teamId", "castBy")
      values (${IDS.election}::uuid, 'teams', ${teamId}::uuid, ${IDS.lead}::uuid)
      returning id
    `);
    const ballotId = rows[0]!.id;

    await tx.execute(sql`
      insert into platform."ballotRankings" ("ballotId", rank, "candidateTeamId")
      values (${ballotId}::uuid, 1, ${IDS.teamB}::uuid),
             (${ballotId}::uuid, 2, ${IDS.teamA}::uuid)
    `);

    return ballotId;
  });
}

describe("casting a ballot", () => {
  it("accepts a complete ranking from a team lead", async () => {
    const ballotId = await castTeamBallot(IDS.teamA);

    const ranks = await db.execute<{
      rank: number;
      candidateTeamId: string;
    }>(sql`
      select rank, "candidateTeamId" from platform."ballotRankings"
      where "ballotId" = ${ballotId}::uuid order by rank
    `);

    expect(ranks.map((r) => r.rank)).toEqual([1, 2]);
    // Rank 1 is first place, which is what the tally's `n − r` scoring assumes
    // and what a voter would say out loud.
    expect(ranks[0]!.candidateTeamId).toBe(IDS.teamB);
  });

  it("rejects a second ballot for the same team", async () => {
    // The double-submit race: two tabs, or an impatient click. The second
    // insert loses to the index rather than to a check that read before the
    // first one committed.
    const error = await castTeamBallot(IDS.teamA).catch((e: unknown) => e);

    // Asserted through the helper production uses, not on the raw shape.
    // Drizzle wraps the driver error, so `error.code` is undefined and the
    // obvious assertion passes only by accident of what it does not check.
    expect(sqlState(error)).toBe("23505");
    expect(isUniqueViolation(error, "ballots_one_per_team_per_election")).toBe(
      true,
    );
  });

  it("rejects a team ballot that names no team", async () => {
    // The composite foreign key. A `teams` ballot without a team is not
    // something the application is trusted to prevent, because the invariant
    // has to hold for rows written by anything at all.
    await expect(
      db.execute(sql`
        insert into platform.ballots ("electionId", electorate, "teamId", "castBy")
        values (${IDS.election}::uuid, 'teams', null, ${IDS.lead}::uuid)
      `),
    ).rejects.toThrow();
  });

  it("rejects a ballot claiming an electorate the election does not have", async () => {
    await expect(
      db.execute(sql`
        insert into platform.ballots ("electionId", electorate, "teamId", "castBy")
        values (${IDS.election}::uuid, 'officers', null, ${IDS.lead}::uuid)
      `),
    ).rejects.toThrow();
  });

  it("rejects a ranking that names a team twice", async () => {
    const rows = await db.execute<{ id: string }>(sql`
      insert into platform.ballots ("electionId", electorate, "teamId", "castBy")
      values (${IDS.election}::uuid, 'teams', ${IDS.teamB}::uuid, ${IDS.lead}::uuid)
      returning id
    `);
    const ballotId = rows[0]!.id;

    await expect(
      db.execute(sql`
        insert into platform."ballotRankings" ("ballotId", rank, "candidateTeamId")
        values (${ballotId}::uuid, 1, ${IDS.teamA}::uuid),
               (${ballotId}::uuid, 2, ${IDS.teamA}::uuid)
      `),
    ).rejects.toThrow();
  });
});
