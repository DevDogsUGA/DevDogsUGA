// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { applyPullRequestEvent } from "./pullRequest";

/**
 * The PR webhook against a real database.
 *
 * The case worth a test is the one that has no `opened` event: the entry
 * triple (`submissionUrl`, `submissionState`, `submittedAt`) is constrained to
 * be all null or all set, so a handler that stamps `submittedAt` only on
 * `opened` writes two of three and is rejected outright. That is not a
 * hypothetical ordering — a webhook added to an existing repo, a hook that was
 * down at creation, or a redelivery replayed out of order all deliver `closed`
 * or `merged` first.
 */

const IDS = {
  project: "a1111111-1111-1111-1111-111111111111",
  meeting: "a2222222-2222-2222-2222-222222222222",
  workshop: "a3333333-3333-3333-3333-333333333333",
  competition: "a4444444-4444-4444-4444-444444444444",
  team: "a5555555-5555-5555-5555-555555555555",
  lead: "a9999999-9999-9999-9999-999999999999",
};

const COMP_SLUG = "2026-fall/w02/pr-webhook-test";
const TEAM_SLUG = "lantern";

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

  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${IDS.lead}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'pr-webhook-test@uga.edu')
    on conflict (id) do nothing
  `);
  await db.execute(sql`
    insert into platform.projects (id, slug, "displayName")
    values (${IDS.project}::uuid, 'pr-webhook-test', 'PR Webhook Test')
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, name, "startsAt", "endsAt")
    values (${IDS.meeting}::uuid, 'pr-webhook-test-meeting', 'PR Webhook Test',
            now() - interval '2 days', now() - interval '2 days' + interval '2 hours')
  `);
  await db.execute(sql`
    insert into platform.workshops (id, "meetingId", "projectId")
    values (${IDS.workshop}::uuid, ${IDS.meeting}::uuid, ${IDS.project}::uuid)
  `);
  await db.execute(sql`
    insert into platform.competitions (id, slug, "workshopId")
    values (${IDS.competition}::uuid, ${COMP_SLUG}, ${IDS.workshop}::uuid)
  `);
  // Deliberately no submission at all: the entry triple starts entirely null,
  // which is the state a team is in before its first PR event arrives.
  await db.execute(sql`
    insert into platform.teams (id, "competitionId", slug, name, "joinCode", "createdBy")
    values (${IDS.team}::uuid, ${IDS.competition}::uuid, ${TEAM_SLUG}, 'Lantern',
            'LANTRN', ${IDS.lead}::uuid)
  `);
});

afterAll(cleanup);

function event(action: string, merged: boolean, base = `comp/${COMP_SLUG}`) {
  return {
    action,
    number: 1,
    htmlUrl: "https://github.com/example/repo/pull/1",
    baseRef: base,
    headRef: `team/${COMP_SLUG}/${TEAM_SLUG}`,
    merged,
  };
}

async function entryState() {
  const [row] = await db.execute<{
    submissionState: string | null;
    submissionUrl: string | null;
    submittedAt: Date | null;
  }>(sql`
    select "submissionState", "submissionUrl", "submittedAt"
    from platform.teams where id = ${IDS.team}::uuid
  `);
  return row!;
}

describe("applyPullRequestEvent", () => {
  it("accepts a merge as the FIRST event a team ever gets", async () => {
    // The regression. Stamping `submittedAt` only on `opened` makes this write
    // violate teams_submission_url_submittedAt_together, so the entry never
    // registers and the team silently loses its star.
    const outcome = await applyPullRequestEvent(event("closed", true));

    expect(outcome).toEqual({
      applied: true,
      teamId: IDS.team,
      state: "merged",
    });

    const state = await entryState();
    expect(state.submissionState).toBe("merged");
    expect(state.submittedAt).not.toBeNull();
  });

  it("preserves the original submittedAt across later events", async () => {
    const before = await entryState();
    await applyPullRequestEvent(event("reopened", false));
    const after = await entryState();

    // `coalesce` rather than a fresh timestamp: "when this team first entered"
    // must not move because somebody reopened their PR.
    expect(after.submittedAt).toEqual(before.submittedAt);
    expect(after.submissionState).toBe("open");
  });

  it("distinguishes a close from a merge", async () => {
    await applyPullRequestEvent(event("closed", false));
    expect((await entryState()).submissionState).toBe("closed");
  });

  it("ignores a PR opened against the wrong base", async () => {
    const before = await entryState();
    const outcome = await applyPullRequestEvent(event("opened", false, "main"));

    expect(outcome).toEqual({ applied: false, reason: "wrong_base" });
    // Nothing written — a mistaken base must not register as an entry.
    expect(await entryState()).toEqual(before);
  });

  it("ignores an action that does not change the entry", async () => {
    const before = await entryState();
    expect(await applyPullRequestEvent(event("synchronize", false))).toEqual({
      applied: false,
      reason: "ignored_action",
    });
    expect(await entryState()).toEqual(before);
  });

  it("keeps advancing state after the freeze but stops deciding", async () => {
    await db.execute(sql`
      update platform.teams set "competedAt" = now() where id = ${IDS.team}::uuid
    `);

    const outcome = await applyPullRequestEvent(event("closed", false));

    // The record stays accurate; what it no longer does is decide anything.
    // Closing the PR the evening after judging must not cost the star.
    expect(outcome).toEqual({ applied: false, reason: "competed" });
    expect((await entryState()).submissionState).toBe("closed");
  });
});
