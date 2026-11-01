import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";
import type { ClientModeration } from "~/server/loaders/oauthModeration";

const mocks = vi.hoisted(() => ({
  moderate: vi.fn(),
  saveEndpoint: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/server/actions/oauthModeration", () => ({
  default: mocks.moderate,
  saveModerationEndpoint: mocks.saveEndpoint,
}));

const { default: OAuthModerationField } =
  await import("./OAuthModerationField");
const { SettingsFormProvider } = await import("~/ui/settings-form");
const { default: SettingsSaveBar } = await import("~/ui/settings-save-bar");

function client(over: Partial<ClientModeration> = {}): ClientModeration {
  return {
    clientId: "11111111-1111-4111-8111-111111111111",
    label: "Lab",
    enabled: true,
    endpointUrl: "https://lab.example/hook",
    production: false,
    registered: false,
    hasPage: true,
    testDeliveries: [],
    sandboxReports: [],
    ...over,
  };
}

function renderField(clients: ClientModeration[]) {
  return render(
    <SettingsFormProvider>
      <OAuthModerationField clients={clients} />
      <SettingsSaveBar />
    </SettingsFormProvider>,
  );
}

const endpoint = (index = 0) =>
  screen.getAllByLabelText("Endpoint URL")[index] as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: /^Save/ });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OAuthModerationField endpoint Draft", () => {
  it("holds the endpoint until Save, then saves it and moves the baseline", async () => {
    const user = userEvent.setup();
    mocks.saveEndpoint.mockResolvedValue(success(undefined, "Endpoint saved"));
    renderField([client()]);
    expect(screen.queryByRole("button", { name: "Save endpoint" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();

    await user.clear(endpoint());
    await user.type(endpoint(), "https://lab.example/new");
    expect(mocks.saveEndpoint).not.toHaveBeenCalled();
    await user.click(saveButton());

    await screen.findByText("Lab endpoint updated.");
    expect(mocks.saveEndpoint).toHaveBeenCalledExactlyOnceWith(
      "11111111-1111-4111-8111-111111111111",
      "https://lab.example/new",
    );
    expect(mocks.refresh).toHaveBeenCalled();
    expect(endpoint()).toHaveValue("https://lab.example/new");
    await waitFor(() => expect(saveButton()).toBeDisabled());
  });

  it("shows a rejected URL under the input and in the bar, and keeps it for a retry", async () => {
    const user = userEvent.setup();
    mocks.saveEndpoint.mockResolvedValueOnce(
      failure("The endpoint must use https.", {
        endpointUrl: "The endpoint must use https.",
      }),
    );
    renderField([client()]);
    await user.clear(endpoint());
    await user.type(endpoint(), "http://lab.example");
    await user.click(saveButton());

    await screen.findByText(
      /Couldn’t save Lab endpoint\. The endpoint must use https\./,
    );
    expect(screen.getByText("The endpoint must use https.")).toBeVisible();
    expect(endpoint()).toHaveValue("http://lab.example");

    // Editing the URL clears the stale message.
    await user.type(endpoint(), "s");
    expect(screen.queryByText("The endpoint must use https.")).toBeNull();
    expect(saveButton()).toBeEnabled();
  });

  it("shows a refusal without a field in the bar only", async () => {
    const user = userEvent.setup();
    mocks.saveEndpoint.mockResolvedValue(failure("OAuth client not found"));
    renderField([client()]);
    await user.type(endpoint(), "x");
    await user.click(saveButton());
    await screen.findByText(
      /Couldn’t save Lab endpoint\. OAuth client not found/,
    );
  });

  it("gives each client its own field on one bar", async () => {
    const user = userEvent.setup();
    mocks.saveEndpoint.mockResolvedValue(success());
    renderField([
      client(),
      client({
        clientId: "22222222-2222-4222-8222-222222222222",
        label: "Other",
        endpointUrl: null,
      }),
    ]);
    await user.type(endpoint(1), "https://other.example");
    await user.click(saveButton());
    await waitFor(() =>
      expect(mocks.saveEndpoint).toHaveBeenCalledExactlyOnceWith(
        "22222222-2222-4222-8222-222222222222",
        "https://other.example",
      ),
    );
  });
});

describe("OAuthModerationField Commands that stay as they were", () => {
  it("rotates the secret and reveals the new one once, beside the client", async () => {
    const user = userEvent.setup();
    mocks.moderate.mockResolvedValue({
      clientId: "11111111-1111-4111-8111-111111111111",
      secret: "whsec_rotated",
      message: "The secret was rotated.",
      ok: true,
    });
    renderField([client()]);
    await user.click(
      screen.getByRole("button", { name: "Rotate signing secret" }),
    );
    expect(await screen.findByDisplayValue("whsec_rotated")).toBeVisible();
    const data = mocks.moderate.mock.calls[0]![1] as FormData;
    expect(data.get("intent")).toBe("rotate-secret");
    expect(data.get("clientId")).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("turns moderation on from the not-yet-enabled form, with its optional endpoint", async () => {
    const user = userEvent.setup();
    mocks.moderate.mockResolvedValue({
      clientId: "11111111-1111-4111-8111-111111111111",
      secret: "whsec_first",
      message: "Moderation is on.",
      ok: true,
    });
    renderField([client({ enabled: false, endpointUrl: null })]);
    await user.type(
      screen.getByLabelText(/Endpoint URL \(optional/),
      "https://lab.example/hook",
    );
    await user.click(
      screen.getByRole("button", { name: "Turn on moderation" }),
    );
    await waitFor(() => expect(mocks.moderate).toHaveBeenCalled());
    const data = mocks.moderate.mock.calls[0]![1] as FormData;
    expect(data.get("intent")).toBe("enable");
    expect(data.get("endpointUrl")).toBe("https://lab.example/hook");
  });
});
