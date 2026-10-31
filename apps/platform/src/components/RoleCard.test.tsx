import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failure, success, type ActionResult } from "~/lib/actionResult";
import type { RoleRow } from "~/hooks/useRoles";
import type { ResolvedPermissions } from "~/server/auth/permissions";

const mocks = vi.hoisted(() => ({ deleteRole: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => undefined,
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));
vi.mock("~/server/actions/permissions", () => ({
  deleteRole: mocks.deleteRole,
}));
vi.mock("./DiscordSyncSection", () => ({ default: () => null }));

const { default: RoleCard } = await import("./RoleCard");
const { SettingsFormProvider } = await import("~/ui/settings-form");
const { default: SettingsSaveBar } = await import("~/ui/settings-save-bar");

const ROLE: RoleRow = {
  id: "role-1",
  title: "Officer",
  description: "Runs things",
  rank: 5,
  color: "#112233",
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
};
const CALLER = {
  canModerate: true,
  canManageRoles: true,
  canManageSuspensions: true,
  canViewAuditLog: true,
  canManageAttendance: true,
  canPreviewDocs: true,
  canManageOAuthApps: true,
  canDeleteAccounts: true,
  canReviewProjectReports: true,
} as ResolvedPermissions;

function renderCard(
  onUpdate: (data: unknown) => Promise<ActionResult>,
  extra: Partial<React.ComponentProps<typeof RoleCard>> = {},
) {
  return render(
    <SettingsFormProvider>
      <RoleCard
        role={ROLE}
        editable
        callerPermissions={CALLER}
        callerCapability={{ linked: false }}
        onUpdate={onUpdate}
        {...extra}
      />
      <SettingsSaveBar />
    </SettingsFormProvider>,
  );
}

const saveButton = () => screen.getByRole("button", { name: /^Save/ });
const toggle = () => screen.getByRole("button", { name: /^(Edit|Close)$/ });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RoleCard edit mode as a Draft", () => {
  it("opens, holds an edit until Save, then sends it and closes", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(success());
    renderCard(onUpdate);
    expect(screen.queryByLabelText("Title")).toBeNull();

    await user.click(toggle());
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "  Lead  ");
    await user.click(screen.getByLabelText("Moderate reports"));
    await user.click(saveButton());

    await screen.findByText("Officer role updated.");
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "Lead",
        description: "Runs things",
        color: "#112233",
        showOnProfile: true,
        isLeadership: false,
        canModerate: true,
        canManageRoles: null,
      }),
    );
    // A successful save collapses the card.
    await waitFor(() => expect(screen.queryByLabelText("Title")).toBeNull());
    expect(toggle()).toHaveTextContent("Edit");
  });

  it("stays open while dirty, with its toggle held, and Discard restores the saved values", async () => {
    const user = userEvent.setup();
    renderCard(vi.fn());
    await user.click(toggle());
    expect(toggle()).toBeEnabled();

    await user.type(screen.getByLabelText("Title"), "!");
    expect(toggle()).toBeDisabled();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Discard/ }));
    expect(screen.getByLabelText("Title")).toHaveValue("Officer");
    expect(toggle()).toBeEnabled();
  });

  it("shows a guard refusal in the bar, stays open and keeps the edit for a retry", async () => {
    const user = userEvent.setup();
    const onUpdate = vi
      .fn()
      .mockResolvedValueOnce(
        failure('Not authorized: you do not hold the "canModerate" permission'),
      )
      .mockResolvedValueOnce(success());
    renderCard(onUpdate);
    await user.click(toggle());
    await user.click(screen.getByLabelText("Moderate reports"));
    await user.click(saveButton());

    await screen.findByText(
      /Couldn’t save Officer role\. Not authorized: you do not hold the "canModerate" permission/,
    );
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(toggle()).toBeDisabled();

    await user.click(saveButton());
    await waitFor(() => expect(screen.queryByLabelText("Title")).toBeNull());
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("will not save a blank title, and says why", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderCard(onUpdate);
    await user.click(toggle());
    await user.clear(screen.getByLabelText("Title"));
    await user.click(saveButton());

    const alerts = await screen.findAllByRole("alert");
    expect(
      alerts.some((a) => a.textContent.includes("Enter a role title")),
    ).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("disables a permission the caller does not hold", async () => {
    const user = userEvent.setup();
    renderCard(vi.fn(), {
      callerPermissions: { ...CALLER, canModerate: false },
    });
    await user.click(toggle());
    expect(screen.getByLabelText("Moderate reports")).toBeDisabled();
    expect(screen.getByLabelText("Moderate reports")).not.toBeChecked();
  });

  it("offers no editing on a role the caller cannot touch, or on the drag overlay", () => {
    renderCard(vi.fn(), { editable: false });
    expect(screen.queryByRole("button", { name: /^(Edit|Close)$/ })).toBeNull();
    cleanup();
    renderCard(vi.fn(), { isDragOverlay: true });
    expect(screen.queryByRole("button", { name: /^(Edit|Close)$/ })).toBeNull();
  });
});

describe("RoleCard delete Command", () => {
  async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
    await user.click(toggle());
    await user.click(screen.getByRole("button", { name: "Delete role" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "Officer");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete role" }),
    );
  }

  it("deletes after the named confirm", async () => {
    const user = userEvent.setup();
    mocks.deleteRole.mockResolvedValue(success());
    renderCard(vi.fn());
    await confirmDelete(user);
    await waitFor(() =>
      expect(mocks.deleteRole).toHaveBeenCalledExactlyOnceWith("role-1"),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("shows a refusal inside the card instead of failing silently", async () => {
    const user = userEvent.setup();
    mocks.deleteRole.mockResolvedValue(
      failure(
        "Not authorized: cannot manage a role with equal or higher authority than your own",
      ),
    );
    renderCard(vi.fn());
    await confirmDelete(user);
    expect(await screen.findByText(/equal or higher authority/)).toBeVisible();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
