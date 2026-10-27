import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OAuthClientSummary } from "~/server/loaders/console";

const mocks = vi.hoisted(() => ({
  forgetApproval: vi.fn(),
  saveAppDetails: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("~/server/actions/oauthStatus", () => ({
  forgetApproval: mocks.forgetApproval,
}));
vi.mock("~/server/actions/oauthApps", () => ({
  saveAppDetails: mocks.saveAppDetails,
}));
vi.mock("~/components/Settings/AppLogoField", () => ({
  default: () => <div>logo field</div>,
}));

const { default: OAuthClientSheet } = await import("./OAuthClientSheet");

const CLIENT: OAuthClientSummary = {
  clientId: "11111111-1111-4111-8111-111111111111",
  label: "Lab",
  status: "testing",
  redirectUris: ["http://127.0.0.1:3000/auth"],
  logoUrl: null,
  homepageUrl: null,
  privacyPolicyUrl: null,
  approvedTestAccountIds: ["t1"],
};
const TEST_ACCOUNTS = [
  { userId: "t1", displayName: "Tess", createdAt: "2026-10-01" },
  { userId: "t2", displayName: "Tom", createdAt: "2026-10-02" },
];

function renderPublished(devDogsApp = false) {
  return render(
    <OAuthClientSheet
      client={{
        ...CLIENT,
        status: "in_production",
        homepageUrl: "https://lab.example",
        privacyPolicyUrl: "https://lab.example/p",
      }}
      testAccounts={[]}
      dispatch={vi.fn()}
      isPending={false}
      secret={null}
      onClose={vi.fn()}
      devDogsApp={devDogsApp}
    />,
  );
}

function renderSheet() {
  return render(
    <OAuthClientSheet
      client={CLIENT}
      testAccounts={TEST_ACCOUNTS}
      dispatch={vi.fn()}
      isPending={false}
      secret={null}
      onClose={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OAuthClientSheet", () => {
  it("forgets one test account's approval, only where there is one", async () => {
    const user = userEvent.setup();
    mocks.forgetApproval.mockResolvedValue({});
    renderSheet();

    expect(
      screen.getByRole("button", { name: "Forget approval for Tom" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Forget approval for Tess" }),
    );
    await waitFor(() =>
      expect(mocks.forgetApproval).toHaveBeenCalledExactlyOnceWith(
        CLIENT.clientId,
        "t1",
      ),
    );
  });

  it("explains that the details are optional in Testing but needed to publish", () => {
    renderSheet();
    expect(
      screen.getByText(/optional while your app is in Testing/),
    ).toBeInTheDocument();
    expect(screen.getByText("logo field")).toBeInTheDocument();
    expect(screen.getByText("Testing")).toBeInTheDocument();
  });

  it("states the redirect rule and has no tier or replacement left", () => {
    renderSheet();
    expect(
      screen.getByText(
        /http only on localhost, 127\.0\.0\.1 and \[::1\]; https everywhere else/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Production client|Replace with|Development/),
    ).not.toBeInTheDocument();
  });

  it("saves the links through saveAppDetails and reports a rejection", async () => {
    const user = userEvent.setup();
    mocks.saveAppDetails.mockResolvedValue({ ok: true });
    renderSheet();
    await user.type(screen.getByLabelText("Homepage"), "https://lab.example");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() =>
      expect(mocks.saveAppDetails).toHaveBeenCalledWith(CLIENT.clientId, {
        homepageUrl: "https://lab.example",
        privacyPolicyUrl: "",
      }),
    );
  });
});

describe("branding lock", () => {
  it("shows a published member app's logo, homepage and privacy policy read-only", () => {
    renderPublished();
    expect(
      screen.getByText(/Ask an officer to return it to Testing/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Homepage")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Privacy policy")).toHaveValue(
      "https://lab.example/p",
    );
    expect(screen.queryByText("logo field")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save details" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the edit controls in Testing and for an officer's DevDogs app", () => {
    const { unmount } = renderSheet();
    expect(screen.getByText("logo field")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save details" }),
    ).toBeInTheDocument();
    unmount();
    renderPublished(true);
    expect(
      screen.getByRole("button", { name: "Save details" }),
    ).toBeInTheDocument();
  });
});
