import type { APIGuildMember } from "discord-api-types/v10";
import { describe, expect, it, vi } from "vitest";
import {
  applyMembershipPlan,
  pairKey,
  planMembershipSync,
  type MembershipIo,
  type MembershipState,
} from "./membershipSync";

const USER = "user-1";
const ROLE = "role-1";
const DISCORD_USER = "111111111111111111";
const DISCORD_ROLE = "222222222222222222";

/** A stubbed `GET /guilds/{id}/members` page, reduced to what the merge reads. */
function guildMember(id: string, roles: string[]): APIGuildMember {
  return { user: { id }, roles } as unknown as APIGuildMember;
}

function state(opts: {
  platform: boolean;
  discord: boolean | "absent";
  snapshot: boolean;
  linked?: boolean;
}): MembershipState {
  const members =
    opts.discord === "absent"
      ? []
      : [guildMember(DISCORD_USER, opts.discord ? [DISCORD_ROLE] : [])];
  return {
    discordUserIds:
      opts.linked === false
        ? new Map<string, string>()
        : new Map([[USER, DISCORD_USER]]),
    roleIdByDiscordRoleId: new Map([[DISCORD_ROLE, ROLE]]),
    memberRoles: new Map(members.map((m) => [m.user.id, new Set(m.roles)])),
    platform: new Set(opts.platform ? [pairKey(USER, ROLE)] : []),
    snapshot: new Set(opts.snapshot ? [pairKey(USER, ROLE)] : []),
  };
}

describe("planMembershipSync", () => {
  it("does nothing when all three agree", () => {
    for (const v of [true, false]) {
      const plan = planMembershipSync(
        state({ platform: v, discord: v, snapshot: v }),
      );
      expect(plan).toEqual({ pushes: [], pulls: [], snapshotOnly: [] });
    }
  });

  it("pushes a platform grant to Discord", () => {
    const plan = planMembershipSync(
      state({ platform: true, discord: false, snapshot: false }),
    );
    expect(plan.pushes).toEqual([
      {
        userId: USER,
        roleId: ROLE,
        discordUserId: DISCORD_USER,
        discordRoleId: DISCORD_ROLE,
        action: "add",
      },
    ]);
    expect(plan.pulls).toEqual([]);
  });

  it("pushes a platform revoke to Discord instead of pulling the role back", () => {
    const plan = planMembershipSync(
      state({ platform: false, discord: true, snapshot: true }),
    );
    expect(plan.pushes).toMatchObject([{ action: "remove" }]);
    expect(plan.pulls).toEqual([]);
  });

  it("pulls a Discord grant to the platform", () => {
    const plan = planMembershipSync(
      state({ platform: false, discord: true, snapshot: false }),
    );
    expect(plan.pulls).toEqual([{ userId: USER, roleId: ROLE, action: "add" }]);
    expect(plan.pushes).toEqual([]);
  });

  it("pulls a Discord revoke to the platform", () => {
    const plan = planMembershipSync(
      state({ platform: true, discord: false, snapshot: true }),
    );
    expect(plan.pulls).toEqual([
      { userId: USER, roleId: ROLE, action: "remove" },
    ]);
  });

  it("only updates the snapshot when both sides changed to the same value", () => {
    expect(
      planMembershipSync(
        state({ platform: true, discord: true, snapshot: false }),
      ).snapshotOnly,
    ).toEqual([{ userId: USER, roleId: ROLE, present: true }]);
    expect(
      planMembershipSync(
        state({ platform: false, discord: false, snapshot: true }),
      ).snapshotOnly,
    ).toEqual([{ userId: USER, roleId: ROLE, present: false }]);
  });

  it("skips users without a known Discord id", () => {
    const plan = planMembershipSync(
      state({ platform: true, discord: false, snapshot: false, linked: false }),
    );
    expect(plan).toEqual({ pushes: [], pulls: [], snapshotOnly: [] });
  });

  it("skips users who are not in the guild", () => {
    const plan = planMembershipSync(
      state({ platform: true, discord: "absent", snapshot: true }),
    );
    expect(plan).toEqual({ pushes: [], pulls: [], snapshotOnly: [] });
  });

  it("pushes a pending grant on the first run after the id becomes known", () => {
    const before = planMembershipSync(
      state({ platform: true, discord: false, snapshot: false, linked: false }),
    );
    const after = planMembershipSync(
      state({ platform: true, discord: false, snapshot: false }),
    );
    expect(before.pushes).toHaveLength(0);
    expect(after.pushes).toHaveLength(1);
  });
});

function io(overrides: Partial<MembershipIo> = {}) {
  return {
    pushMemberRoleChange: vi.fn().mockResolvedValue(undefined),
    record: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } satisfies MembershipIo;
}

describe("applyMembershipPlan", () => {
  it("records the snapshot after a successful push", async () => {
    const stub = io();
    const plan = planMembershipSync(
      state({ platform: true, discord: false, snapshot: false }),
    );
    const result = await applyMembershipPlan(plan, stub);

    expect(stub.pushMemberRoleChange).toHaveBeenCalledWith(
      DISCORD_USER,
      DISCORD_ROLE,
      "add",
    );
    expect(stub.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, roleId: ROLE }),
      { snapshot: true },
    );
    expect(result).toEqual({ changes: 1, errors: [] });
  });

  it("leaves the snapshot stale when a push fails, so the next run retries", async () => {
    const stub = io({
      pushMemberRoleChange: vi.fn().mockRejectedValue(new Error("403")),
    });
    const plan = planMembershipSync(
      state({ platform: false, discord: true, snapshot: true }),
    );
    const result = await applyMembershipPlan(plan, stub);

    expect(stub.record).not.toHaveBeenCalled();
    expect(result.changes).toBe(0);
    expect(result.errors).toHaveLength(1);

    // Nothing was recorded, so the same state plans the same push again.
    expect(
      planMembershipSync(
        state({ platform: false, discord: true, snapshot: true }),
      ).pushes,
    ).toMatchObject([{ action: "remove" }]);
  });

  it("writes pulls to the platform and the snapshot", async () => {
    const stub = io();
    const plan = planMembershipSync(
      state({ platform: false, discord: true, snapshot: false }),
    );
    await applyMembershipPlan(plan, stub);

    expect(stub.pushMemberRoleChange).not.toHaveBeenCalled();
    expect(stub.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, roleId: ROLE }),
      { platform: "add", snapshot: true },
    );
  });

  it("keeps going past a failed push", async () => {
    const stub = io({
      pushMemberRoleChange: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValue(undefined),
    });
    const op = {
      roleId: ROLE,
      discordRoleId: DISCORD_ROLE,
      action: "add" as const,
    };
    const result = await applyMembershipPlan(
      {
        pushes: [
          { ...op, userId: "a", discordUserId: "1" },
          { ...op, userId: "b", discordUserId: "2" },
        ],
        pulls: [],
        snapshotOnly: [],
      },
      stub,
    );
    expect(result.changes).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(stub.record).toHaveBeenCalledTimes(1);
  });
});
