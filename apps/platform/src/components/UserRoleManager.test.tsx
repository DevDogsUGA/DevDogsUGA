import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";
import type { RoleRow } from "~/hooks/useRoles";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  assign: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/permissions", () => ({
  searchUsers: mocks.search,
  assignRoleToUser: mocks.assign,
  removeRoleFromUser: mocks.remove,
}));
vi.mock("./UserPermissionsPanel", () => ({
  default: () => null,
  RoleChip: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

const { default: UserRoleManager } = await import("./UserRoleManager");

const role = (over: Partial<RoleRow>): RoleRow => ({
  id: "role-1",
  title: "Mentor",
  description: "",
  rank: 10,
  color: null,
  showOnProfile: true,
  isLeadership: false,
  canModerate: null,
  canManageRoles: null,
  canManageSuspensions: null,
  canViewAuditLog: null,
  canManageAttendance: null,
  canPreviewDocs: null,
  canManageOAuthApps: null,
  canDeleteAccounts: null,
  canReviewProjectReports: null,
  discordRoleId: null,
  discordSyncedName: null,
  discordRolePosition: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});
const ROLES = [
  role({ id: "role-1", title: "Mentor" }),
  role({ id: "role-2", title: "Judge", rank: 11 }),
];
const USER = {
  id: "member-1",
  preferredName: "Ada",
  email: "ada@uga.edu",
  roles: [
    {
      id: "role-2",
      title: "Judge",
      color: null,
      rank: 11,
      discordRoleId: null,
    },
  ],
  hasDiscordLinked: true,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function findAda(user: ReturnType<typeof userEvent.setup>) {
  mocks.search.mockResolvedValue([USER]);
  render(
    <UserRoleManager
      roles={ROLES}
      callerMinRank={3}
      callerCapability={{ linked: false }}
    />,
  );
  await user.type(screen.getByLabelText("Search for a member by name"), "ada");
  await screen.findByText("Ada");
}

describe("UserRoleManager assigning", () => {
  it("adds a role, toasts, and shows it on the member at once", async () => {
    const user = userEvent.setup();
    mocks.assign.mockResolvedValue(success(undefined, "Role added."));
    await findAda(user);
    await user.selectOptions(screen.getByLabelText("Add a role"), "role-1");
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledExactlyOnceWith(
        "member-1",
        "role-1",
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove Mentor" }),
      ).toBeVisible(),
    );
    expect(mocks.toast).toHaveBeenCalledWith("Role added.");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows a refused grant and does not pretend the member has the role", async () => {
    const user = userEvent.setup();
    mocks.assign.mockResolvedValue(
      failure(
        "Not authorized: cannot manage a role with equal or higher authority than your own",
      ),
    );
    await findAda(user);
    await user.selectOptions(screen.getByLabelText("Add a role"), "role-1");
    expect(await screen.findByText(/equal or higher authority/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remove Mentor" })).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});

describe("UserRoleManager removing", () => {
  async function removeJudge(user: ReturnType<typeof userEvent.setup>) {
    await findAda(user);
    await user.click(screen.getByRole("button", { name: "Remove Judge" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Remove role",
      }),
    );
  }

  it("removes after a confirm and drops the chip", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue(success(undefined, "Role removed."));
    await removeJudge(user);
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(
        "member-1",
        "role-2",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove Judge" })).toBeNull(),
    );
    expect(mocks.toast).toHaveBeenCalledWith("Role removed.");
  });

  it("shows a refused removal and keeps the chip", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue(
      failure("Role removed, but Discord sync failed: Discord down"),
    );
    await removeJudge(user);
    expect(
      await screen.findByText(/Discord sync failed: Discord down/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Judge" })).toBeVisible();
  });
});
