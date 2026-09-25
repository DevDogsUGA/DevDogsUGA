import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the rate-limit wiring in `teams.ts`, not the actions' full
 * behaviour (see the `*.db-test.ts` suites for that): that every guarded
 * action calls `consumeRateLimit` with the budget the doc comment on
 * `PER_ACCOUNT_ACTION_LIMIT` etc. promises, that a refusal comes back as
 * `{ ok: false, code: "rate_limited" }` rather than a throw, and -- the
 * point of checking BEFORE the side effect -- that a refusal short-circuits
 * before `requireTwoFactor`, any GitHub call, or `db.transaction` ever
 * runs. Every collaborator below is mocked specifically so a wrongly-late
 * rate-limit check is caught by a "should not have been called" assertion
 * rather than by a real GitHub call happening in a test.
 */

const expectSession = vi.fn();
const consumeRateLimit = vi.fn();
const requireTwoFactor = vi.fn();
const requireCanJoin = vi.fn();
const insertMembership = vi.fn();
const lockTeam = vi.fn();
const lockUser = vi.fn();
const addMember = vi.fn();
const removeMember = vi.fn();
const provisionTeam = vi.fn();
const disbandTeam = vi.fn();
const userIdForGithubLogin = vi.fn();
const underConcurrentTeamCap = vi.fn();
const sendTemplate = vi.fn();
const sendEach = vi.fn();
const postAlert = vi.fn();
const dbSelect = vi.fn();
const dbTransaction = vi.fn();

vi.mock("~/server/auth", () => ({ expectSession }));
vi.mock("~/server/rateLimit", () => ({ consumeRateLimit }));
vi.mock("~/server/teams/requireTwoFactor", () => ({ requireTwoFactor }));
vi.mock("~/server/teams/requireCanJoin", () => ({
  requireCanJoin,
  insertMembership,
  lockTeam,
  lockUser,
}));
vi.mock("~/server/github/teamSync", () => ({
  addMember,
  removeMember,
  provisionTeam,
  disbandTeam,
  userIdForGithubLogin,
}));
vi.mock("~/server/teams/limits", () => ({ underConcurrentTeamCap }));
vi.mock("~/server/email/send", () => ({ sendTemplate, sendEach }));
vi.mock("~/server/alerts", () => ({ postAlert }));
vi.mock("~/server/db/schema", () => ({
  teams: {},
  teamMembers: {},
  teamMembershipRequests: {},
  profiles: {},
}));
vi.mock("~/supabase/drizzle/schema", () => ({ usersInAuth: {} }));
vi.mock("~/env", () => ({
  env: { BASE_URL: "https://example.test", DEPLOY_ENV: "development" },
}));
vi.mock("~/server/db", () => ({
  db: {
    select: dbSelect,
    transaction: dbTransaction,
  },
}));

async function loadTeams() {
  return import("./teams");
}

const USER_ID = "11111111-1111-1111-1111-111111111111";
const TEAM_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  expectSession.mockResolvedValue(USER_ID);
  // Any transaction reached by these tests is a bug being caught, not a
  // path meant to run -- fail loudly rather than silently exercising real
  // transaction logic against undefined query builders.
  dbTransaction.mockRejectedValue(
    new Error("db.transaction should not run when the rate limit refuses"),
  );
  dbSelect.mockImplementation(() => {
    throw new Error("db.select should not run when the rate limit refuses");
  });
});

describe("teams.ts rate-limit wiring", () => {
  it("createTeam: refuses with rate_limited and never reaches requireTwoFactor", async () => {
    consumeRateLimit.mockResolvedValue(false);
    const { createTeam } = await loadTeams();

    const outcome = await createTeam("Some Team");

    expect(outcome).toEqual({ ok: false, code: "rate_limited" });
    expect(consumeRateLimit).toHaveBeenCalledWith({
      scope: "team:create",
      subjectId: USER_ID,
      limit: 10,
      windowSeconds: 600,
    });
    expect(requireTwoFactor).not.toHaveBeenCalled();
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("joinTeam: refuses with rate_limited and never reaches requireTwoFactor", async () => {
    consumeRateLimit.mockResolvedValue(false);
    const { joinTeam } = await loadTeams();

    const outcome = await joinTeam(TEAM_ID, "ABCDEF");

    expect(outcome).toEqual({ ok: false, code: "rate_limited" });
    expect(consumeRateLimit).toHaveBeenCalledWith({
      scope: "team:join",
      subjectId: USER_ID,
      limit: 10,
      windowSeconds: 600,
    });
    expect(requireTwoFactor).not.toHaveBeenCalled();
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("requestToJoin: refuses with rate_limited and never reaches requireTwoFactor", async () => {
    consumeRateLimit.mockResolvedValue(false);
    const { requestToJoin } = await loadTeams();

    const outcome = await requestToJoin(TEAM_ID, "let me in");

    expect(outcome).toEqual({ ok: false, code: "rate_limited" });
    expect(consumeRateLimit).toHaveBeenCalledWith({
      scope: "team:request",
      subjectId: USER_ID,
      limit: 10,
      windowSeconds: 600,
    });
    expect(requireTwoFactor).not.toHaveBeenCalled();
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("leaveTeam: refuses with rate_limited before the transaction opens", async () => {
    consumeRateLimit.mockResolvedValue(false);
    const { leaveTeam } = await loadTeams();

    const outcome = await leaveTeam(TEAM_ID);

    expect(outcome).toEqual({ ok: false, code: "rate_limited" });
    expect(consumeRateLimit).toHaveBeenCalledWith({
      scope: "team:leave",
      subjectId: USER_ID,
      limit: 10,
      windowSeconds: 600,
    });
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("disbandTeamAction: refuses with rate_limited before the transaction opens", async () => {
    consumeRateLimit.mockResolvedValue(false);
    const { disbandTeamAction } = await loadTeams();

    const outcome = await disbandTeamAction(TEAM_ID);

    expect(outcome).toEqual({ ok: false, code: "rate_limited" });
    expect(consumeRateLimit).toHaveBeenCalledWith({
      scope: "team:disband",
      subjectId: USER_ID,
      limit: 10,
      windowSeconds: 600,
    });
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("inviteToTeam: refuses on the per-lead budget without ever checking the per-team budget or resolving the invitee", async () => {
    consumeRateLimit.mockResolvedValueOnce(false);
    const { inviteToTeam } = await loadTeams();

    const outcome = await inviteToTeam(TEAM_ID, "someone@uga.edu");

    expect(outcome).toEqual({ ok: false, code: "rate_limited" });
    expect(consumeRateLimit).toHaveBeenCalledTimes(1);
    expect(consumeRateLimit).toHaveBeenNthCalledWith(1, {
      scope: "team:invite:user",
      subjectId: USER_ID,
      limit: 20,
      windowSeconds: 3600,
    });
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("inviteToTeam: passes the per-lead budget, refuses on the per-team budget, and still never resolves the invitee", async () => {
    consumeRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { inviteToTeam } = await loadTeams();

    const outcome = await inviteToTeam(TEAM_ID, "someone@uga.edu");

    expect(outcome).toEqual({ ok: false, code: "rate_limited" });
    expect(consumeRateLimit).toHaveBeenCalledTimes(2);
    expect(consumeRateLimit).toHaveBeenNthCalledWith(2, {
      scope: "team:invite:team",
      subjectId: TEAM_ID,
      limit: 50,
      windowSeconds: 86400,
    });
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("respondToMembership: accepting refuses with rate_limited before requireTwoFactor or the transaction", async () => {
    consumeRateLimit.mockResolvedValue(false);
    const { respondToMembership } = await loadTeams();

    const outcome = await respondToMembership("request-1", true);

    expect(outcome).toEqual({ ok: false, code: "rate_limited" });
    expect(consumeRateLimit).toHaveBeenCalledWith({
      scope: "team:respond",
      subjectId: USER_ID,
      limit: 10,
      windowSeconds: 600,
    });
    expect(requireTwoFactor).not.toHaveBeenCalled();
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("respondToMembership: declining never consumes a hit of the budget", async () => {
    const { respondToMembership } = await loadTeams();

    // Declining still opens the transaction (it is a pure status update,
    // not a GitHub call) -- the mocked transaction rejects, which the
    // action surfaces as "unknown". What this test is checking is narrower:
    // that the rate limiter is never touched for a decline.
    const outcome = await respondToMembership("request-1", false);

    expect(outcome).toEqual({ ok: false, code: "unknown" });
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });
});
