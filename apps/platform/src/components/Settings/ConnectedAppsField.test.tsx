import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const ME = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  forgetApproval: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("~/server/actions/oauthStatus", () => ({
  forgetApproval: mocks.forgetApproval,
}));

const { default: ConnectedAppsField } = await import("./ConnectedAppsField");

const APPS = [
  {
    clientId: "11111111-1111-4111-8111-111111111111",
    label: "DogDays",
    logoUrl: "https://files.example/avatars/apps/dogdays.webp",
    homepageUrl: "https://dogdays.dev",
    approvedAt: "2026-10-01T15:00:00.000Z",
  },
  {
    clientId: "22222222-2222-4222-8222-222222222222",
    label: "Lab",
    logoUrl: null,
    homepageUrl: null,
    approvedAt: "2026-10-10T15:00:00.000Z",
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConnectedAppsField", () => {
  it("lists each approved app with its logo (or a letter) and approval date", () => {
    render(<ConnectedAppsField apps={APPS} userId={ME} />);
    expect(screen.getByText("DogDays")).toBeInTheDocument();
    expect(screen.getByText("Lab")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("Oct 1, 2026")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Remove access for/ }),
    ).toHaveLength(2);
  });

  it("says so when no app is connected", () => {
    render(<ConnectedAppsField apps={[]} userId={ME} />);
    expect(screen.getByText("No connected apps")).toBeInTheDocument();
  });

  it("removes access for that one app after a confirm", async () => {
    const user = userEvent.setup();
    mocks.forgetApproval.mockResolvedValue({});
    render(<ConnectedAppsField apps={APPS} userId={ME} />);

    await user.click(
      screen.getByRole("button", { name: "Remove access for Lab" }),
    );
    expect(mocks.forgetApproval).not.toHaveBeenCalled();
    await user.click(
      await screen.findByRole("button", { name: "Remove access" }),
    );

    await waitFor(() =>
      expect(mocks.forgetApproval).toHaveBeenCalledExactlyOnceWith(
        APPS[1]!.clientId,
        ME,
      ),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
