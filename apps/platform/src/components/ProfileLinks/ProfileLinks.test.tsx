import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ProfileLinks from ".";
import { updateProfileLinks } from "~/server/actions/profile";
import { failure, success } from "~/lib/actionResult";
import { SettingsFormProvider } from "~/ui/settings-form";
import SettingsSaveBar from "~/ui/settings-save-bar";
import type { profileLinks } from "~/server/db/schema";

vi.mock("~/server/actions/profile", () => ({ updateProfileLinks: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type Row = typeof profileLinks.$inferSelect;
const row = (id: string, sortOrder: number): Row => ({
  id,
  userId: "user",
  url: `https://example.com/${sortOrder}`,
  title: `Link ${sortOrder}`,
  sortOrder,
  createdAt: null,
});

function renderLinks(links: Row[]) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsFormProvider>
        <ProfileLinks initialLinks={links} />
        <SettingsSaveBar />
      </SettingsFormProvider>
    </QueryClientProvider>,
  );
}

const save = () =>
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }));

it("sends the staged removals, rewrites and additions as one call", async () => {
  vi.mocked(updateProfileLinks).mockResolvedValue(success([row("b", 2)]));
  renderLinks([row("a", 1), row("b", 2)]);
  fireEvent.click(screen.getByRole("button", { name: "Remove link Link 1" }));
  fireEvent.change(screen.getByDisplayValue("Link 2"), {
    target: { value: "Renamed" },
  });
  save();
  await screen.findByText("Links updated.");
  expect(updateProfileLinks).toHaveBeenCalledTimes(1);
  expect(updateProfileLinks).toHaveBeenCalledWith({
    remove: ["a"],
    update: [
      { id: "b", url: "https://example.com/2", title: "Renamed", sortOrder: 2 },
    ],
    add: [],
  });
});

it("keeps the staged list and shows the server's message when the save is refused", async () => {
  vi.mocked(updateProfileLinks)
    .mockResolvedValueOnce(
      failure("Your links changed somewhere else. Reload and try again.", {
        links: "Reload the page.",
      }),
    )
    .mockResolvedValueOnce(success([]));
  renderLinks([row("a", 1)]);
  fireEvent.click(screen.getByRole("button", { name: "Remove link Link 1" }));
  save();
  await screen.findByText(/Couldn’t save Links\. Your links changed/);
  expect(screen.getByText("Reload the page.")).toBeTruthy();

  save();
  await screen.findByText("Links updated.");
  expect(updateProfileLinks).toHaveBeenCalledTimes(2);
  expect(vi.mocked(updateProfileLinks).mock.calls[1]![0]).toEqual({
    remove: ["a"],
    update: [],
    add: [],
  });
});
