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
import type { OAuthClientSummary } from "~/server/loaders/console";
import type { ClientModeration } from "~/server/loaders/oauthModeration";

const mocks = vi.hoisted(() => ({
  forgetApproval: vi.fn(),
  saveAppDetails: vi.fn(),
  addUri: vi.fn(),
  removeUri: vi.fn(),
  regenerate: vi.fn(),
  deleteClient: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/oauth", () => ({
  addRedirectUri: mocks.addUri,
  removeRedirectUri: mocks.removeUri,
  regenerateOAuthSecret: mocks.regenerate,
  deleteOAuthClient: mocks.deleteClient,
}));
vi.mock("~/server/actions/oauthStatus", () => ({
  forgetApproval: mocks.forgetApproval,
}));
vi.mock("~/server/actions/oauthApps", () => ({
  saveAppDetails: mocks.saveAppDetails,
}));
vi.mock("~/components/Settings/AppLogoField", () => ({
  default: () => <div>logo field</div>,
}));
vi.mock("~/components/OAuthModerationField", () => ({
  default: ({ clients }: { clients: ClientModeration[] }) => (
    <div>moderation for {clients.map((c) => c.label).join(", ")}</div>
  ),
}));

const { default: OAuthClientDetails } = await import("./OAuthClientDetails");

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
const MODERATION = {
  clientId: CLIENT.clientId,
  label: "Lab",
} as ClientModeration;

function renderPage(
  overrides: Partial<OAuthClientSummary> = {},
  devDogsApp = false,
) {
  return render(
    <OAuthClientDetails
      client={{ ...CLIENT, ...overrides }}
      testAccounts={devDogsApp ? [] : TEST_ACCOUNTS}
      moderation={MODERATION}
      devDogsApp={devDogsApp}
    />,
  );
}

function renderPublished(devDogsApp = false) {
  return renderPage(
    {
      status: "in_production",
      homepageUrl: "https://lab.example",
      privacyPolicyUrl: "https://lab.example/p",
    },
    devDogsApp,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OAuthClientDetails", () => {
  it("forgets one test account's approval, only where there is one", async () => {
    const user = userEvent.setup();
    mocks.forgetApproval.mockResolvedValue(success({ consents: 1 }));
    renderPage();

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
    expect(mocks.toast).toHaveBeenCalledWith("Forgot Tess's approval");
  });

  it("shows a refused Forget approval on that account's row", async () => {
    const user = userEvent.setup();
    mocks.forgetApproval.mockResolvedValue(failure("OAuth client not found"));
    renderPage();
    await user.click(
      screen.getByRole("button", { name: "Forget approval for Tess" }),
    );
    const row = screen.getByText("Tess").closest('[role="listitem"]')!;
    expect(
      await within(row as HTMLElement).findByRole("alert"),
    ).toHaveTextContent("OAuth client not found");
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("explains that the details are optional in Testing but needed to publish", () => {
    renderPage();
    expect(
      screen.getByText(/optional while your app is in Testing/),
    ).toBeInTheDocument();
    expect(screen.getByText("logo field")).toBeInTheDocument();
  });

  it("states the redirect rule and has no tier or replacement left", () => {
    renderPage();
    expect(
      screen.getByText(
        /http only on localhost, 127\.0\.0\.1 and \[::1\]; https everywhere else/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Production client|Replace with|Development/),
    ).not.toBeInTheDocument();
  });

  it("shows the client's credentials, its moderation and the danger zone on one page", () => {
    renderPage();
    expect(screen.getByLabelText("Client ID")).toHaveValue(CLIENT.clientId);
    expect(screen.getByText("moderation for Lab")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Regenerate secret…" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete app…" }),
    ).toBeInTheDocument();
  });

  it("gives a DevDogs app no test accounts", () => {
    renderPage({}, true);
    expect(screen.queryByText("Test accounts")).not.toBeInTheDocument();
    expect(screen.getByText("logo field")).toBeInTheDocument();
    expect(screen.getByText(/can be published only once/)).toBeInTheDocument();
  });
});

describe("app links on the save bar", () => {
  it("holds an edit until Save, then saves just that link through saveAppDetails", async () => {
    const user = userEvent.setup();
    mocks.saveAppDetails.mockResolvedValue({ ok: true });
    renderPage();
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();

    await user.type(screen.getByLabelText("Homepage"), "https://lab.example");
    expect(mocks.saveAppDetails).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() =>
      expect(mocks.saveAppDetails).toHaveBeenCalledExactlyOnceWith(
        CLIENT.clientId,
        { homepageUrl: "https://lab.example" },
      ),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("shows a refused link's server error under that field and keeps the draft", async () => {
    const user = userEvent.setup();
    const message = "Homepage must be an https:// address";
    mocks.saveAppDetails.mockResolvedValue({
      ok: false,
      message,
      fieldErrors: { homepageUrl: message },
    });
    renderPage();
    await user.type(screen.getByLabelText("Homepage"), "http://lab.example");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    // Under the field itself, and named in the bar.
    const field = screen
      .getByLabelText("Homepage")
      .closest("label")!.parentElement!;
    expect(await within(field).findByRole("alert")).toHaveTextContent(message);
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(1);
    expect(screen.getByLabelText("Homepage")).toHaveValue("http://lab.example");
    expect(screen.getByLabelText(/^Privacy policy/)).toHaveValue("");
    expect(mocks.refresh).not.toHaveBeenCalled();
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
  });

  it("keeps the edit controls in Testing and for an officer's DevDogs app", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();
    expect(screen.getByText("logo field")).toBeInTheDocument();
    expect(screen.getByLabelText("Homepage")).not.toHaveAttribute("readonly");
    unmount();
    renderPublished(true);
    expect(screen.getByLabelText("Homepage")).not.toHaveAttribute("readonly");
    await user.type(screen.getByLabelText("Homepage"), "/x");
    expect(screen.getByRole("button", { name: /^Save/ })).toBeInTheDocument();
  });
});

/** Opens a named confirm and presses its action. */
async function confirm(
  user: ReturnType<typeof userEvent.setup>,
  open: string,
  submit: string,
) {
  await user.click(screen.getByRole("button", { name: open }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: submit,
    }),
  );
}

describe("redirect URIs", () => {
  it("adds one through addRedirectUri, with a toast", async () => {
    const user = userEvent.setup();
    mocks.addUri.mockResolvedValue(success(undefined, "Redirect URI added."));
    renderPage();
    await user.type(
      screen.getByLabelText("New redirect URI"),
      "https://lab.example/cb",
    );
    await user.click(screen.getByRole("button", { name: "Add URI" }));
    await waitFor(() =>
      expect(mocks.addUri).toHaveBeenCalledExactlyOnceWith(
        CLIENT.clientId,
        "https://lab.example/cb",
      ),
    );
    expect(mocks.toast).toHaveBeenCalledWith("Redirect URI added.");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows a rejected address inline", async () => {
    const user = userEvent.setup();
    mocks.addUri.mockResolvedValue(
      failure("Redirect URIs must be https, or http on localhost"),
    );
    renderPage();
    await user.type(
      screen.getByLabelText("New redirect URI"),
      "http://example.com/cb",
    );
    await user.click(screen.getByRole("button", { name: "Add URI" }));
    expect(
      await screen.findByText(
        "Redirect URIs must be https, or http on localhost",
      ),
    ).toBeVisible();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("removes one, and shows the refusal when it is the last", async () => {
    const user = userEvent.setup();
    mocks.removeUri.mockResolvedValue(
      failure("An app needs at least one redirect URI"),
    );
    renderPage({
      redirectUris: [
        "http://127.0.0.1:3000/auth",
        "http://127.0.0.1:3001/auth",
      ],
    });
    await user.click(
      screen.getByRole("button", { name: "Remove http://127.0.0.1:3001/auth" }),
    );
    expect(mocks.removeUri).toHaveBeenCalledExactlyOnceWith(
      CLIENT.clientId,
      "http://127.0.0.1:3001/auth",
    );
    expect(
      await screen.findByText("An app needs at least one redirect URI"),
    ).toBeVisible();
  });
});

describe("the danger zone", () => {
  it("regenerates the secret, reveals it once, and hides it for good on Done", async () => {
    const user = userEvent.setup();
    mocks.regenerate.mockResolvedValue(
      success({ clientSecret: "s3cret" }, "Secret regenerated."),
    );
    renderPage();
    await confirm(user, "Regenerate secret…", "Regenerate secret");
    expect(await screen.findByDisplayValue("s3cret")).toBeVisible();
    expect(mocks.regenerate).toHaveBeenCalledExactlyOnceWith(CLIENT.clientId);
    expect(mocks.toast).toHaveBeenCalledWith("Secret regenerated.");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByDisplayValue("s3cret")).toBeNull();
  });

  it("shows a refused regenerate beside the button", async () => {
    const user = userEvent.setup();
    mocks.regenerate.mockResolvedValue(failure("OAuth client not found"));
    renderPage();
    await confirm(user, "Regenerate secret…", "Regenerate secret");
    expect(await screen.findByText("OAuth client not found")).toBeVisible();
    expect(screen.queryByText("New client secret")).toBeNull();
  });

  it("deletes the app and leaves for the list without refreshing", async () => {
    const user = userEvent.setup();
    mocks.deleteClient.mockResolvedValue(success(undefined, "App deleted."));
    renderPage();
    await confirm(user, "Delete app…", "Delete app");
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard/oauth"),
    );
    expect(mocks.deleteClient).toHaveBeenCalledExactlyOnceWith(CLIENT.clientId);
    expect(mocks.toast).toHaveBeenCalledWith("App deleted.");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("stays on the page and shows why when the delete is refused", async () => {
    const user = userEvent.setup();
    mocks.deleteClient.mockResolvedValue(failure("OAuth client not found"));
    renderPage();
    await confirm(user, "Delete app…", "Delete app");
    expect(await screen.findByText("OAuth client not found")).toBeVisible();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
