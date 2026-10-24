import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsoleApp } from "~/server/loaders/oauthApps";

const mocks = vi.hoisted(() => ({
  setStatus: vi.fn(),
  setAsksForConsent: vi.fn(),
  transferToDevDogs: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("~/server/actions/oauthStatus", () => ({
  setStatus: mocks.setStatus,
  setAsksForConsent: mocks.setAsksForConsent,
  transferToDevDogs: mocks.transferToDevDogs,
}));

vi.mock("~/server/actions/oauth", () => ({ default: vi.fn() }));
vi.mock("~/server/actions/oauthApps", () => ({ saveAppDetails: vi.fn() }));
vi.mock("~/components/Settings/AppLogoField", () => ({
  default: () => <div>logo field</div>,
}));

const { default: ConsoleAppsField } = await import("./ConsoleAppsField");

function app(overrides: Partial<ConsoleApp>): ConsoleApp {
  return {
    clientId: "11111111-1111-4111-8111-111111111111",
    label: "Lab",
    status: "in_production",
    ownerName: "Ada",
    isDevDogs: false,
    asksForConsent: true,
    logoUrl: null,
    homepageUrl: "https://lab.example",
    privacyPolicyUrl: "https://lab.example/p",
    redirectUris: [],
    missing: [],
    approvedMembers: 12,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConsoleAppsField", () => {
  it("enables Publish only when logo, homepage and privacy policy are set", () => {
    render(
      <ConsoleAppsField
        apps={[
          app({
            clientId: "a",
            label: "Bare",
            status: "testing",
            missing: ["a logo", "a privacy policy"],
          }),
          app({ clientId: "b", label: "Ready", status: "testing" }),
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Publish Bare" })).toBeDisabled();
    expect(
      screen.getByText("Needs a logo, a privacy policy"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish Ready" })).toBeEnabled();
  });

  it("asks before publishing, naming the app and the sign-out; confirming publishes", async () => {
    const user = userEvent.setup();
    mocks.setStatus.mockResolvedValue({ changed: true, counts: null });
    render(<ConsoleAppsField apps={[app({ status: "testing" })]} />);
    await user.click(screen.getByRole("button", { name: "Publish Lab" }));
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(await screen.findByText("Publish Lab?")).toBeInTheDocument();
    expect(
      screen.getByText(
        /signs out every member who is signed in through its test accounts/,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(mocks.setStatus).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "in_production",
      ),
    );
  });

  it("Cancel on the Publish dialog changes nothing", async () => {
    const user = userEvent.setup();
    render(<ConsoleAppsField apps={[app({ status: "testing" })]} />);
    await user.click(screen.getByRole("button", { name: "Publish Lab" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("Publish Lab?")).not.toBeInTheDocument(),
    );
    expect(mocks.setStatus).not.toHaveBeenCalled();
  });

  it("confirms Back to Testing, explains the sign-out and shows the counts after", async () => {
    const user = userEvent.setup();
    mocks.setStatus.mockResolvedValue({
      changed: true,
      counts: { consents: 12, sessions: 9, authorizations: 1 },
    });
    render(<ConsoleAppsField apps={[app({})]} />);

    await user.click(
      screen.getByRole("button", { name: "Return Lab to Testing" }),
    );
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/signs everyone else out of Lab/),
    ).toBeInTheDocument();
    expect(screen.getByText(/12 members hold an approval/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return to Testing" }));

    await waitFor(() =>
      expect(mocks.setStatus).toHaveBeenCalledWith(
        expect.any(String),
        "testing",
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Removed 12 approvals, 9 sessions and 1 pending sign-ins",
    );
  });

  it("transfers to DevDogs only after a confirm, and only for a member's app", async () => {
    const user = userEvent.setup();
    mocks.transferToDevDogs.mockResolvedValue({ changed: true });
    render(
      <ConsoleAppsField
        apps={[
          app({}),
          app({
            clientId: "z",
            label: "DogPack",
            isDevDogs: true,
            ownerName: null,
          }),
        ]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Transfer DogPack to DevDogs" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Transfer Lab to DevDogs" }),
    );
    expect(mocks.transferToDevDogs).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/This cannot be undone/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Transfer to DevDogs" }),
    );
    await waitFor(() =>
      expect(mocks.transferToDevDogs).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      ),
    );
  });

  it("shows the consent switch on DevDogs apps only", () => {
    render(
      <ConsoleAppsField
        apps={[
          app({ clientId: "m", label: "Member app" }),
          app({
            clientId: "d",
            label: "DogDays",
            isDevDogs: true,
            ownerName: null,
            asksForConsent: false,
          }),
        ]}
      />,
    );
    expect(
      screen.queryByRole("switch", {
        name: "Skip the consent screen for Member app",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: "Skip the consent screen for DogDays",
      }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("lets a holder edit a DevDogs app's redirects and details, but not a member's", async () => {
    const user = userEvent.setup();
    render(
      <ConsoleAppsField
        apps={[
          app({ clientId: "m", label: "Member app" }),
          app({
            clientId: "d",
            label: "DogDays",
            isDevDogs: true,
            ownerName: null,
            redirectUris: ["https://dogdays.example/auth"],
          }),
        ]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Edit Member app" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit DogDays" }));
    expect(
      await screen.findByRole("textbox", {
        name: "https://dogdays.example/auth",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("App details")).toBeInTheDocument();
    expect(screen.getByText("logo field")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Regenerate secret…" }),
    ).toBeInTheDocument();
    // A DevDogs app has no owner, hence no test accounts.
    expect(screen.queryByText("Test accounts")).not.toBeInTheDocument();
  });

  it("lists a member's Testing app so a holder can publish or transfer it", () => {
    render(
      <ConsoleAppsField
        apps={[app({ label: "Fresh", status: "testing", missing: [] })]}
      />,
    );
    expect(screen.getByRole("button", { name: "Publish Fresh" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Transfer Fresh to DevDogs" }),
    ).toBeInTheDocument();
  });
});
