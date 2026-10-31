import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/oauth", () => ({
  createOAuthClient: mocks.create,
}));

const { default: OAuthNewClient } = await import("./OAuthNewClient");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderNew() {
  return render(
    <OAuthNewClient
      issuer="https://api.devdogsuga.org/auth/v1"
      defaultRedirectUris={["http://localhost:3000/auth"]}
    />,
  );
}

it("creates the app and replaces the form with the one-time secret", async () => {
  const user = userEvent.setup();
  mocks.create.mockResolvedValue(
    success({ clientId: "cid-1", clientSecret: "s3cret" }, "Created lab."),
  );
  renderNew();
  await user.type(screen.getByPlaceholderText("my-project"), "lab");
  await user.click(screen.getByRole("button", { name: /Create app/ }));

  expect(await screen.findByDisplayValue("s3cret")).toBeVisible();
  expect(screen.getByDisplayValue("cid-1")).toBeVisible();
  expect(
    screen.getByDisplayValue("https://api.devdogsuga.org/auth/v1"),
  ).toBeVisible();
  expect((mocks.create.mock.calls[0]![0] as FormData).get("label")).toBe("lab");
  expect(mocks.toast).toHaveBeenCalledWith("Created lab.");
  // A refresh would re-count the apps and, at the cap, swap this out.
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("shows a refusal under the form, which stays on screen", async () => {
  const user = userEvent.setup();
  mocks.create.mockResolvedValue(
    failure("You can own at most 3 OAuth apps. Delete one to make another"),
  );
  renderNew();
  await user.type(screen.getByPlaceholderText("my-project"), "lab");
  await user.click(screen.getByRole("button", { name: /Create app/ }));
  expect(await screen.findByText(/at most 3 OAuth apps/)).toBeVisible();
  expect(screen.getByPlaceholderText("my-project")).toBeVisible();
  expect(screen.queryByText("Copy your client secret")).toBeNull();
  await waitFor(() => expect(mocks.toast).not.toHaveBeenCalled());
});
