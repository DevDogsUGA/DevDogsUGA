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

const mocks = vi.hoisted(() => ({
  addRedirectUri: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => "/dashboard/oauth",
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/oauth", () => ({
  addRedirectUri: mocks.addRedirectUri,
}));

const { default: OAuthCredentialsField, NewAppButton } =
  await import("./OAuthCredentialsField");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NewAppButton", () => {
  it("links to the create page under the cap", () => {
    render(<NewAppButton hasGithub appCount={2} maxApps={3} />);
    expect(screen.getByRole("link", { name: /New OAuth app/ })).toHaveAttribute(
      "href",
      "/dashboard/oauth/new",
    );
  });

  it("disables at the cap and says why", () => {
    render(<NewAppButton hasGithub appCount={3} maxApps={3} />);
    const button = screen.getByRole("button", { name: /New OAuth app/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      "You own 3 apps, the most a member can. Delete one to create another.",
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("asks for GitHub first when none is linked", () => {
    render(<NewAppButton hasGithub={false} appCount={0} maxApps={3} />);
    expect(
      screen.getByRole("link", { name: "Link GitHub account" }),
    ).toHaveAttribute("href", "/dashboard/accounts#github");
  });
});

describe("the redirect-URI prefill", () => {
  const CLIENT = {
    clientId: "11111111-1111-4111-8111-111111111111",
    label: "Lab",
    status: "testing" as const,
    redirectUris: ["https://a.example/cb"],
    logoUrl: null,
    homepageUrl: null,
    privacyPolicyUrl: null,
    approvedTestAccountIds: [],
  };
  const data = {
    clients: [CLIENT],
    hasGithub: true,
    appCount: 1,
    maxApps: 3,
    testAccounts: [],
  } as unknown as Parameters<typeof OAuthCredentialsField>[0];

  it("adds the address from the dialog, toasts, and closes it", async () => {
    const user = userEvent.setup();
    mocks.addRedirectUri.mockResolvedValue(
      success(undefined, "Redirect URI added."),
    );
    render(
      <OAuthCredentialsField
        {...data}
        prefillRedirectUri="http://127.0.0.1:54321/cb"
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(mocks.addRedirectUri).toHaveBeenCalledExactlyOnceWith(
        CLIENT.clientId,
        "http://127.0.0.1:54321/cb",
      ),
    );
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith("Redirect URI added."),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard/oauth", {
      scroll: false,
    });
  });

  it("keeps the dialog open and shows why when the address is refused", async () => {
    const user = userEvent.setup();
    mocks.addRedirectUri.mockResolvedValue(
      failure("A maximum of 5 redirect URIs are allowed"),
    );
    render(
      <OAuthCredentialsField
        {...data}
        prefillRedirectUri="http://127.0.0.1:54321/cb"
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Add" }));
    expect(
      await within(screen.getByRole("alertdialog")).findByText(
        "A maximum of 5 redirect URIs are allowed",
      ),
    ).toBeVisible();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
