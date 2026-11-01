import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import SyncPreferredNameButton from "./SyncPreferredNameButton";
import { updateIdentity } from "~/server/actions/profile";
import { failure, success } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/server/actions/profile", () => ({ updateIdentity: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("saves the Involvement Network name and refreshes", async () => {
  vi.mocked(updateIdentity).mockResolvedValue(success());
  render(<SyncPreferredNameButton involvementFullName=" Ada Lovelace " />);
  await userEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(updateIdentity).toHaveBeenCalledWith({
    preferredName: "Ada Lovelace",
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("shows the refusal beside the button instead of swallowing it", async () => {
  vi.mocked(updateIdentity).mockResolvedValue(
    failure("Keep your name to 32 characters or fewer.", {
      preferredName: "Keep your name to 32 characters or fewer.",
    }),
  );
  render(<SyncPreferredNameButton involvementFullName={"A".repeat(40)} />);
  await userEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Keep your name to 32 characters or fewer.",
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.getByRole("button")).toBeEnabled();
});
