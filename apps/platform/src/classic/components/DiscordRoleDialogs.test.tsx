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
  list: vi.fn(),
  link: vi.fn(),
  create: vi.fn(),
  importRole: vi.fn(),
  unsync: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/discordRoleSync", () => ({
  listImportableDiscordRoles: mocks.list,
  linkRoleToDiscord: mocks.link,
  createDiscordRoleFromRole: mocks.create,
  importRoleFromDiscord: mocks.importRole,
  unsyncRole: mocks.unsync,
}));

const { default: LinkDiscordRoleDialog } =
  await import("./LinkDiscordRoleDialog");
const { default: ImportDiscordRoleDialog } =
  await import("./ImportDiscordRoleDialog");
const { default: DiscordSyncSection } = await import("./DiscordSyncSection");

const OWNER = {
  linked: true as const,
  isOwner: true,
  hasManageRoles: true,
  highestPosition: 99,
};
const DISCORD_ROLES = [
  {
    id: "d-1",
    name: "Mentors",
    color: null,
    position: 3,
    suggestedPermissions: {
      canManageRoles: false,
      canModerate: false,
      canViewAuditLog: false,
    },
  },
];
const ROLE = {
  id: "role-1",
  title: "Mentor",
  discordRoleId: null,
  discordSyncedName: null,
} as RoleRow;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LinkDiscordRoleDialog", () => {
  async function open(user: ReturnType<typeof userEvent.setup>) {
    mocks.list.mockResolvedValue(DISCORD_ROLES);
    render(<LinkDiscordRoleDialog role={ROLE} callerCapability={OWNER} />);
    await user.click(screen.getByRole("button", { name: /Link to Discord/ }));
    await screen.findByRole("option", { name: "Mentors" });
  }
  const submit = () => screen.getByRole("button", { name: "Link" });

  it("links to the chosen Discord role, toasts, and closes", async () => {
    const user = userEvent.setup();
    mocks.link.mockResolvedValue(success(undefined, "Role linked to Discord."));
    await open(user);
    await user.selectOptions(screen.getByLabelText("Discord role"), "d-1");
    await user.click(submit());
    await waitFor(() =>
      expect(mocks.link).toHaveBeenCalledExactlyOnceWith("role-1", "d-1"),
    );
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith("Role linked to Discord."),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("creates a Discord role instead when asked to", async () => {
    const user = userEvent.setup();
    mocks.create.mockResolvedValue(success());
    await open(user);
    await user.click(screen.getByLabelText(/Create a new Discord role/));
    await user.click(submit());
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledExactlyOnceWith("role-1"),
    );
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows the refusal in it", async () => {
    const user = userEvent.setup();
    mocks.link.mockResolvedValue(
      failure(
        "Your Discord account doesn't have permission to manage this role.",
      ),
    );
    await open(user);
    await user.selectOptions(screen.getByLabelText("Discord role"), "d-1");
    await user.click(submit());
    expect(
      await within(screen.getByRole("dialog")).findByText(
        /doesn't have permission to manage this role/,
      ),
    ).toBeVisible();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("starts a reopened dialog without the last refusal", async () => {
    const user = userEvent.setup();
    mocks.link.mockResolvedValue(failure("Discord role not found"));
    await open(user);
    await user.selectOptions(screen.getByLabelText("Discord role"), "d-1");
    await user.click(submit());
    await screen.findByText("Discord role not found");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: /Link to Discord/ }));
    await screen.findByRole("option", { name: "Mentors" });
    expect(screen.queryByText("Discord role not found")).toBeNull();
  });
});

describe("ImportDiscordRoleDialog", () => {
  const PERMISSIONS = {
    canModerate: true,
    canManageRoles: true,
    canManageSuspensions: true,
    canViewAuditLog: true,
    canManageAttendance: true,
    canPreviewDocs: true,
    canManageOAuthApps: true,
    canDeleteAccounts: true,
    canReviewProjectReports: true,
  };
  async function open(user: ReturnType<typeof userEvent.setup>) {
    mocks.list.mockResolvedValue(DISCORD_ROLES);
    render(
      <ImportDiscordRoleDialog
        nextRank={20}
        callerPermissions={PERMISSIONS}
        callerCapability={OWNER}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Import from Discord/ }),
    );
    await screen.findByRole("option", { name: "Mentors" });
  }

  it("imports with the chosen role and the typed fields, then closes", async () => {
    const user = userEvent.setup();
    mocks.importRole.mockResolvedValue(
      success({ id: "new" }, "Role imported from Discord."),
    );
    await open(user);
    await user.selectOptions(screen.getByLabelText(/Discord role/), "d-1");
    await user.type(screen.getByLabelText("Description"), "Helps out");
    await user.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(mocks.importRole).toHaveBeenCalled());
    expect(mocks.importRole.mock.calls[0]![0]).toBe("d-1");
    expect(mocks.importRole.mock.calls[0]![1]).toMatchObject({
      description: "Helps out",
      rank: 20,
      showOnProfile: true,
    });
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith("Role imported from Discord."),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows a refused import inside the dialog", async () => {
    const user = userEvent.setup();
    mocks.importRole.mockResolvedValue(
      failure(
        'Not authorized: you do not hold the "canDeleteAccounts" permission',
      ),
    );
    await open(user);
    await user.selectOptions(screen.getByLabelText(/Discord role/), "d-1");
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(
      await within(screen.getByRole("dialog")).findByText(/canDeleteAccounts/),
    ).toBeVisible();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("DiscordSyncSection", () => {
  const SYNCED = {
    ...ROLE,
    discordRoleId: "d-1",
    discordSyncedName: "Mentors",
  } as RoleRow;

  async function unsync(user: ReturnType<typeof userEvent.setup>) {
    render(<DiscordSyncSection role={SYNCED} callerCapability={OWNER} />);
    await user.click(screen.getByRole("button", { name: "Unsync" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Unsync",
      }),
    );
  }

  it("unsyncs after a confirm, with a toast", async () => {
    const user = userEvent.setup();
    mocks.unsync.mockResolvedValue(
      success(undefined, "Role unsynced from Discord."),
    );
    await unsync(user);
    await waitFor(() =>
      expect(mocks.unsync).toHaveBeenCalledExactlyOnceWith("role-1"),
    );
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith("Role unsynced from Discord."),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows a refused unsync beside the sync line", async () => {
    const user = userEvent.setup();
    mocks.unsync.mockResolvedValue(failure("Not authorized."));
    await unsync(user);
    expect(await screen.findByText("Not authorized.")).toBeVisible();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
