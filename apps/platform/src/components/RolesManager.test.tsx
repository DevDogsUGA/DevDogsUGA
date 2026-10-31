import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";
import type { RoleRow } from "~/hooks/useRoles";
import type { ResolvedPermissions } from "~/server/auth/permissions";

const mocks = vi.hoisted(() => ({
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  reorderRole: vi.fn(),
  refresh: vi.fn(),
  dragEnd: null as null | ((event: unknown) => void),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@dnd-kit/core", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // The drag itself is dnd-kit's; what matters here is what a drop does.
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (event: unknown) => void;
  }) => {
    mocks.dragEnd = onDragEnd;
    return <>{children}</>;
  },
  DragOverlay: () => null,
}));
vi.mock("@dnd-kit/sortable", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
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
  createRole: mocks.createRole,
  updateRole: mocks.updateRole,
  deleteRole: mocks.deleteRole,
  reorderRole: mocks.reorderRole,
}));
vi.mock("./DiscordSyncSection", () => ({ default: () => null }));
vi.mock("./ImportDiscordRoleDialog", () => ({ default: () => null }));

const { default: RolesManager } = await import("./RolesManager");

function role(id: string, title: string, rank: number): RoleRow {
  return {
    id,
    title,
    description: "",
    rank,
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
  };
}
const ROLES = [role("a", "Alpha", 5), role("b", "Bravo", 6)];
const CALLER = { canModerate: true } as ResolvedPermissions;

function renderManager(roles = ROLES) {
  const view = render(
    <RolesManager
      initialRoles={roles}
      callerMinRank={1}
      callerPermissions={CALLER}
      callerCapability={{ linked: false }}
    />,
  );
  return {
    ...view,
    rerenderWith: (next: RoleRow[]) =>
      view.rerender(
        <RolesManager
          initialRoles={next}
          callerMinRank={1}
          callerPermissions={CALLER}
          callerCapability={{ linked: false }}
        />,
      ),
  };
}

const order = () =>
  screen
    .getAllByText(/^(Alpha|Apex|Bravo|Charlie)$/, { selector: "b" })
    .map((node) => node.textContent);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RolesManager", () => {
  it("saves a card's Draft through updateRole and refreshes, without guessing the new title", async () => {
    const user = userEvent.setup();
    mocks.updateRole.mockResolvedValue(success());
    const { rerenderWith } = renderManager();

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Apex");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await screen.findByText("Alpha role updated.");
    expect(mocks.updateRole).toHaveBeenCalledExactlyOnceWith(
      "a",
      expect.objectContaining({ title: "Apex" }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
    // No optimistic row: the list shows the server's word, handed down by the refresh.
    expect(order()).toEqual(["Alpha", "Bravo"]);
    rerenderWith([role("a", "Apex", 5), ROLES[1]!]);
    expect(order()).toEqual(["Apex", "Bravo"]);
  });

  it("shows an updateRole refusal in the bar and leaves the card open", async () => {
    const user = userEvent.setup();
    mocks.updateRole.mockResolvedValue(
      failure("Not authorized: this role cannot be modified directly"),
    );
    renderManager();
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    await user.type(screen.getByLabelText("Title"), "!");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await screen.findByText(/this role cannot be modified directly/);
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("saves two cards at once with one Save and names each in the bar", async () => {
    const user = userEvent.setup();
    mocks.updateRole
      .mockResolvedValueOnce(success())
      .mockResolvedValueOnce(failure("Not authorized: nope"));
    renderManager();
    const edits = screen.getAllByRole("button", { name: "Edit" });
    await user.click(edits[0]!);
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    for (const title of screen.getAllByLabelText("Title")) {
      await user.type(title, "!");
    }
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await screen.findByText(/Your other changes were saved/);
    expect(mocks.updateRole).toHaveBeenCalledTimes(2);
  });

  it("reorders ahead of the server, and puts the list back with a message on a refusal", async () => {
    mocks.reorderRole.mockResolvedValue(
      failure(
        "Not authorized: cannot manage a role with equal or higher authority than your own",
      ),
    );
    renderManager();
    expect(order()).toEqual(["Alpha", "Bravo"]);

    act(() => mocks.dragEnd?.({ active: { id: "b" }, over: { id: "a" } }));
    expect(order()).toEqual(["Bravo", "Alpha"]);
    expect(mocks.reorderRole).toHaveBeenCalledExactlyOnceWith("b", 4);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /equal or higher authority/,
    );
    await waitFor(() => expect(order()).toEqual(["Alpha", "Bravo"]));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("keeps a successful reorder and refreshes to the server's order", async () => {
    mocks.reorderRole.mockResolvedValue(success());
    renderManager();
    act(() => mocks.dragEnd?.({ active: { id: "b" }, over: { id: "a" } }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(order()).toEqual(["Bravo", "Alpha"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("creates a role as a Command: closes on success, shows a refusal inside the dialog", async () => {
    const user = userEvent.setup();
    mocks.createRole
      .mockResolvedValueOnce(
        failure(
          "Not authorized: cannot manage a role with equal or higher authority than your own",
        ),
      )
      .mockResolvedValueOnce(success({ id: "c" }));
    renderManager();

    await user.click(screen.getByRole("button", { name: "Create role" }));
    await user.type(screen.getByLabelText(/^Title/), "Charlie");
    await user.click(
      screen.getAllByRole("button", { name: "Create role" }).at(-1)!,
    );
    expect(await screen.findByText(/equal or higher authority/)).toBeVisible();
    expect(mocks.createRole).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Charlie", rank: 7 }),
    );

    await user.click(
      screen.getAllByRole("button", { name: "Create role" }).at(-1)!,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
