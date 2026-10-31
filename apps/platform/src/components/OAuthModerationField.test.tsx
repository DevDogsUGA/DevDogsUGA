import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";
import type { ClientModeration } from "~/server/loaders/oauthModeration";

const mocks = vi.hoisted(() => ({
  enable: vi.fn(),
  rotate: vi.fn(),
  sendTest: vi.fn(),
  saveEndpoint: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/oauthModeration", () => ({
  enableModeration: mocks.enable,
  rotateModerationSecret: mocks.rotate,
  sendModerationTest: mocks.sendTest,
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

describe("OAuthModerationField Commands", () => {
  const ID = "11111111-1111-4111-8111-111111111111";

  it("rotates the secret, toasts, and reveals the new one once beside the client", async () => {
    const user = userEvent.setup();
    mocks.rotate.mockResolvedValue(
      success({ secret: "whsec_rotated" }, "The secret was rotated."),
    );
    renderField([client()]);
    await user.click(
      screen.getByRole("button", { name: "Rotate signing secret" }),
    );
    expect(await screen.findByDisplayValue("whsec_rotated")).toBeVisible();
    expect(mocks.rotate).toHaveBeenCalledExactlyOnceWith(ID);
    expect(mocks.toast).toHaveBeenCalledWith("The secret was rotated.");
  });

  it("shows a refused rotation inline and reveals nothing", async () => {
    const user = userEvent.setup();
    mocks.rotate.mockResolvedValue(failure("Turn moderation on first"));
    renderField([client()]);
    await user.click(
      screen.getByRole("button", { name: "Rotate signing secret" }),
    );
    expect(await screen.findByText("Turn moderation on first")).toBeVisible();
    expect(screen.queryByText("Signing secret")).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("turns moderation on from the not-yet-enabled form, with its optional endpoint", async () => {
    const user = userEvent.setup();
    mocks.enable.mockResolvedValue(
      success({ secret: "whsec_first" }, "Moderation is on."),
    );
    renderField([client({ enabled: false, endpointUrl: null })]);
    await user.type(
      screen.getByLabelText(/Endpoint URL \(optional/),
      "https://lab.example/hook",
    );
    await user.click(
      screen.getByRole("button", { name: "Turn on moderation" }),
    );
    await waitFor(() => expect(mocks.enable).toHaveBeenCalled());
    expect(mocks.enable.mock.calls[0]![0]).toBe(ID);
    const data = mocks.enable.mock.calls[0]![1] as FormData;
    expect(data.get("endpointUrl")).toBe("https://lab.example/hook");
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith("Moderation is on."),
    );
  });

  it("shows a refused turn-on inline", async () => {
    const user = userEvent.setup();
    mocks.enable.mockResolvedValue(failure("The endpoint must use https."));
    renderField([client({ enabled: false, endpointUrl: null })]);
    await user.click(
      screen.getByRole("button", { name: "Turn on moderation" }),
    );
    expect(
      await screen.findByText("The endpoint must use https."),
    ).toBeVisible();
  });

  it("sends a test action with its type, and toasts the delivery", async () => {
    const user = userEvent.setup();
    mocks.sendTest.mockResolvedValue(
      success(undefined, "Delivered content.hide to your endpoint"),
    );
    renderField([client()]);
    await user.click(screen.getByRole("button", { name: "Send test action" }));
    await waitFor(() => expect(mocks.sendTest).toHaveBeenCalled());
    expect(mocks.sendTest.mock.calls[0]![0]).toBe(ID);
    const data = mocks.sendTest.mock.calls[0]![1] as FormData;
    expect(data.get("type")).toBe("content.hide");
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        "Delivered content.hide to your endpoint",
      ),
    );
  });

  it("shows the receiver's refusal inline and refreshes the recorded delivery", async () => {
    const user = userEvent.setup();
    mocks.sendTest.mockResolvedValue(
      failure("Your endpoint did not accept it (500). It will be retried"),
    );
    renderField([client()]);
    await user.click(screen.getByRole("button", { name: "Send test action" }));
    expect(
      await screen.findByText(
        "Your endpoint did not accept it (500). It will be retried",
      ),
    ).toBeVisible();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
