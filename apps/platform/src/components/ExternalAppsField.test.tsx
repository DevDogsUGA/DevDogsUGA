import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/moderationDeliveries", () => ({
  registerExternalApp: mocks.register,
}));

const { default: ExternalAppsField } = await import("./ExternalAppsField");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function fillAndRegister(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Slug"), "dogpack");
  await user.type(screen.getByLabelText("Name"), "DogPack");
  await user.type(
    screen.getByLabelText("OAuth client id"),
    "11111111-1111-4111-8111-111111111111",
  );
  await user.type(
    screen.getByLabelText("Endpoint"),
    "https://dogpack.example.com/hook",
  );
  await user.type(screen.getByLabelText(/Content types/), "session | Session");
  await user.click(screen.getByRole("button", { name: "Register app" }));
}

it("registers, toasts the message and keeps the one-time secret inline", async () => {
  const user = userEvent.setup();
  mocks.register.mockResolvedValue(
    success(
      { secret: "whsec_once" },
      "DogPack is registered. Copy the secret.",
    ),
  );
  render(<ExternalAppsField apps={[]} canRegister />);
  await fillAndRegister(user);
  expect(await screen.findByText("whsec_once")).toBeVisible();
  const data = mocks.register.mock.calls[0]![0] as FormData;
  expect(data.get("slug")).toBe("dogpack");
  expect(data.get("endpointUrl")).toBe("https://dogpack.example.com/hook");
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith(
      "DogPack is registered. Copy the secret.",
    ),
  );
});

it("shows no secret when registering created no moderation record", async () => {
  const user = userEvent.setup();
  mocks.register.mockResolvedValue(
    success(undefined, "DogPack is registered. Its secret was shown before."),
  );
  render(<ExternalAppsField apps={[]} canRegister />);
  await fillAndRegister(user);
  await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
  expect(screen.queryByText(/whsec/)).toBeNull();
});

it("shows a refusal inline and no secret", async () => {
  const user = userEvent.setup();
  mocks.register.mockResolvedValue(
    failure("That slug belongs to a platform app"),
  );
  render(<ExternalAppsField apps={[]} canRegister />);
  await fillAndRegister(user);
  expect(
    await screen.findByText("That slug belongs to a platform app"),
  ).toBeVisible();
  expect(mocks.toast).not.toHaveBeenCalled();
});

it("hides the form from someone who cannot register", () => {
  render(<ExternalAppsField apps={[]} canRegister={false} />);
  expect(screen.queryByRole("button", { name: "Register app" })).toBeNull();
});
