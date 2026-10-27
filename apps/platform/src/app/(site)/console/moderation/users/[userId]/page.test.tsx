import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The schedule-deletion controls on a member's console page are for holders of
 * `canDeleteAccounts` (account-deletion Q13). A moderator without it sees the
 * page, never the panel, and the pending state is not even read for them.
 */

const fake = vi.hoisted(() => ({
  canDelete: false,
  pendingReads: 0,
}));

vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve("viewer-1"),
}));
vi.mock("~/server/actions/permissions", () => ({
  canUserDeleteAccounts: () => Promise.resolve(fake.canDelete),
}));
vi.mock("~/server/accountDeletion/schedule", () => ({
  getPendingDeletion: () => {
    fake.pendingReads += 1;
    return Promise.resolve({
      scheduledFor: new Date("2026-11-06T15:00:00Z"),
      requestedByOfficer: false,
      started: false,
    });
  },
}));
vi.mock("~/server/loaders/moderation", () => ({
  getUserModerationData: () =>
    Promise.resolve({
      displayName: "Sam",
      isBanned: false,
      suspension: undefined,
      reports: [],
    }),
}));
vi.mock("~/components/Console/ConsoleShell", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("~/components/ReportListItem", () => ({ default: () => null }));
vi.mock("~/components/StatusBadges", () => ({
  StandingBadge: () => null,
  standingOf: () => "good",
}));
vi.mock("~/components/UserRoleForm", () => ({ default: () => null }));
vi.mock("~/components/AccountDeletion/ScheduleDeletionPanel", () => ({
  default: () => null,
}));

const { default: Page } = await import("./page");
const { default: ScheduleDeletionPanel } =
  await import("~/components/AccountDeletion/ScheduleDeletionPanel");

type Node = { type?: unknown; props?: { children?: unknown } };

function find(node: unknown, type: unknown): Node | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node as unknown[]) {
      const hit = find(child, type);
      if (hit) return hit;
    }
    return null;
  }
  const element = node as Node;
  if (element.type === type) return element;
  return find(element.props?.children, type);
}

const render = () => Page({ params: Promise.resolve({ userId: "member-1" }) });

beforeEach(() => {
  fake.canDelete = false;
  fake.pendingReads = 0;
});

describe("console member page: schedule deletion", () => {
  it("hides the panel from a moderator without canDeleteAccounts", async () => {
    const tree = await render();
    expect(find(tree, ScheduleDeletionPanel)).toBeNull();
    expect(fake.pendingReads).toBe(0);
  });

  it("shows it, with the pending state, to a holder of canDeleteAccounts", async () => {
    fake.canDelete = true;
    const tree = await render();
    const panel = find(tree, ScheduleDeletionPanel);
    expect(panel).not.toBeNull();
    const props = panel?.props as unknown as {
      targetUserId: string;
      pending: { date: string; started: boolean } | null;
    };
    expect(props.targetUserId).toBe("member-1");
    expect(props.pending?.date).toContain("2026");
    expect(props.pending?.started).toBe(false);
  });
});
