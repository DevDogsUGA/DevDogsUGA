// @vitest-environment node
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
import { db } from "~/server/db";
import type { GithubResult } from "~/server/github/teamSync";

/**
 * `requestToJoin`'s `joinRequest` email, against a real database.
 *
 * Mirrors `TeamInvite`'s send path (`server/actions/teams.ts`'s
 * `notifyInvitee`): `sendEach`/`sendTemplate` are mocked here rather than
 * left real, because the point of these tests is asserting WHO the email
 * goes to and with WHAT props, not exercising `send.ts` itself (that is
 * `send.test.ts`'s job, and there is no EMAIL binding in a vitest run
 * regardless -- see that file's header on the `cloudflare:workers` stub).
 *
 * GitHub and `expectSession` are mocked the same way `teams.db-test.ts` and
 * `respondToMembership.db-test.ts` mock them: no real network call, no real
 * cookie. `consumeRateLimit` and `requireTwoFactor`'s `twoFactorStatus` are
 * left real against the local database, same as `teams.db-test.ts`.
 */

const github = vi.hoisted(() => ({
  addMember: vi.fn((): Promise<GithubResult> => Promise.resolve({ ok: true })),
  // No linked GitHub login, so `requireTwoFactor` is a no-op; the 2FA gate
  // has its own unit tests (`requireTwoFactor.test.ts`).
  githubLoginFor: vi.fn((): Promise<string | null> => Promise.resolve(null)),
}));
vi.mock("~/server/github/teamSync", () => github);

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
}));

const email = vi.hoisted(() => ({
  sendTemplate: vi.fn(() => Promise.resolve({ ok: true as const })),
  sendEach: vi.fn(() => Promise.resolve(new Map())),
}));
vi.mock("~/server/email/send", () => email);

const { requestToJoin } = await import("~/server/actions/teams");

const IDS = {
  lead: "c7111111-1111-1111-1111-111111111101",
  applicant: "c7111111-1111-1111-1111-111111111102",
  team: "c5711111-1111-1111-1111-111111111101",
};

async function cleanup() {
  await db.execute(
    sql`delete from platform.teams where id = ${IDS.team}::uuid`,
  );
  // `requestToJoin` is budget-gated (`PER_ACCOUNT_ACTION_LIMIT`, real against
  // the local database here, same as `teams.db-test.ts`), and this file
  // calls it several times as the same applicant across `beforeEach` reruns
  // -- clear the counter so a previous run of this file cannot exhaust the
  // budget for this one.
  await db.execute(sql`
    delete from platform."rateLimitHits" where "subjectId" = ${IDS.applicant}::uuid
  `);
  await db.execute(sql`
    delete from auth.users where id in (${IDS.lead}::uuid, ${IDS.applicant}::uuid)
  `);
}

beforeAll(async () => {
  await cleanup();

  for (const [id, email_] of [
    [IDS.lead, "joinrequest-lead@uga.edu"],
    [IDS.applicant, "joinrequest-applicant@uga.edu"],
  ] as const) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email_})
    `);
  }

  await db.execute(sql`
    insert into platform.profile ("userId", "preferredName")
    values (${IDS.lead}::uuid, 'Jordan'), (${IDS.applicant}::uuid, 'Avery')
  `);

  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.team}::uuid, 'actions-db-test-join-request-email', 'Byte Bulldogs', 'ABC999', ${IDS.lead}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" ("teamId", "userId", role)
    values (${IDS.team}::uuid, ${IDS.lead}::uuid, 'lead')
  `);
});

afterAll(cleanup);

beforeEach(async () => {
  vi.clearAllMocks();
  github.addMember.mockResolvedValue({ ok: true });
  github.githubLoginFor.mockResolvedValue(null);
  email.sendEach.mockResolvedValue(new Map());
  // Each test re-files the same applicant's request against the same team,
  // and the partial unique index only allows one PENDING row per (team,
  // user) -- clear the last test's row so the next `requestToJoin` is a
  // fresh insert rather than `request_not_actionable`.
  await db.execute(sql`
    delete from platform."teamMembershipRequests"
    where "teamId" = ${IDS.team}::uuid and "userId" = ${IDS.applicant}::uuid
  `);
  // Same reasoning as `cleanup()`'s: this file's own repeated calls as
  // `IDS.applicant` must not exhaust `PER_ACCOUNT_ACTION_LIMIT` before every
  // test gets to run.
  await db.execute(sql`
    delete from platform."rateLimitHits" where "subjectId" = ${IDS.applicant}::uuid
  `);
});

describe("requestToJoin email", () => {
  it("emails the team's lead, not the requester", async () => {
    session.userId = IDS.applicant;

    const result = await requestToJoin(IDS.team, "let me in");
    expect(result.ok).toBe(true);

    expect(email.sendEach).toHaveBeenCalledTimes(1);
    const [recipients, templateName] = email.sendEach.mock.calls[0] as [
      {
        to: string;
        props: {
          leadName: string;
          applicantName: string;
          teamName: string;
          reviewUrl: string;
        };
      }[],
      string,
    ];
    expect(templateName).toBe("JoinRequest");
    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toMatchObject({
      to: "joinrequest-lead@uga.edu",
      props: {
        leadName: "Jordan",
        applicantName: "Avery",
        teamName: "Byte Bulldogs",
      },
    });
    expect(recipients[0]?.props.reviewUrl).toContain("/teams/requests");

    // Never the requester.
    const recipientEmails = recipients.map((r) => r.to);
    expect(recipientEmails).not.toContain("joinrequest-applicant@uga.edu");

    expect(email.sendTemplate).not.toHaveBeenCalled();
  });

  it("still commits the request row when the email send fails", async () => {
    session.userId = IDS.applicant;
    email.sendEach.mockRejectedValueOnce(new Error("boom"));

    const result = await requestToJoin(IDS.team, "please");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await db.execute<{ status: string }>(sql`
      select status from platform."teamMembershipRequests" where id = ${result.value}::uuid
    `);
    expect(rows[0]?.status).toBe("pending");
  });

  it("does not roll back or throw when email is not configured at all", async () => {
    session.userId = IDS.applicant;
    email.sendEach.mockResolvedValueOnce(
      new Map([
        [
          "joinrequest-lead@uga.edu",
          { ok: false, reason: "not_configured", message: "no binding" },
        ],
      ]),
    );

    const result = await requestToJoin(IDS.team, "please again");
    expect(result.ok).toBe(true);
  });
});
