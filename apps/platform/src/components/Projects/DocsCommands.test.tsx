import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  setProjectDocs: vi.fn(),
  confirmDocsOwner: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: mocks.toast } }));
vi.mock("~/server/actions/projectDocs", () => ({
  setProjectDocs: mocks.setProjectDocs,
  confirmDocsOwner: mocks.confirmDocsOwner,
}));

const { DocsCommand } = await import("./DocsCommands");

const PR = "https://github.com/DevDogsUGA/DevDogsUGA/pull/42";
const opened = (
  words = `Opened a pull request to turn docs on: ${PR}. Docs change only after it is merged.`,
): ActionResult<{ url: string; unchanged: boolean }> => ({
  ok: true,
  data: { url: PR, unchanged: false },
  message: words,
});

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

const click = async (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
  await screen.findByRole("button", { name });
};

describe("an officer's docs buttons", () => {
  it("Enable asks to turn docs on for the project, and shows the pull request's link", async () => {
    mocks.setProjectDocs.mockResolvedValue(opened());
    render(<DocsCommand projectId="p-1" change="enable" label="Enable docs" />);
    await click("Enable docs");
    expect(mocks.setProjectDocs).toHaveBeenCalledExactlyOnceWith("p-1", true);
    const link = await screen.findByRole("link", { name: PR });
    expect(link.getAttribute("href")).toBe(PR);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("Disable asks to turn them off", async () => {
    mocks.setProjectDocs.mockResolvedValue(
      opened(`Opened a pull request to turn docs off: ${PR}.`),
    );
    render(
      <DocsCommand projectId="p-1" change="disable" label="Disable docs" />,
    );
    await click("Disable docs");
    expect(mocks.setProjectDocs).toHaveBeenCalledExactlyOnceWith("p-1", false);
    expect(await screen.findByRole("link", { name: PR })).toBeTruthy();
  });

  it("Confirm new owner asks to confirm the owner, and not to change the docs", async () => {
    mocks.confirmDocsOwner.mockResolvedValue(opened());
    render(
      <DocsCommand
        projectId="p-1"
        change="confirm"
        label="Confirm new owner"
        variant="default"
      />,
    );
    await click("Confirm new owner");
    expect(mocks.confirmDocsOwner).toHaveBeenCalledExactlyOnceWith("p-1");
    expect(mocks.setProjectDocs).not.toHaveBeenCalled();
  });

  it("says docs change only after the merge, and never that they are live, on or published", async () => {
    mocks.setProjectDocs.mockResolvedValue(opened());
    const { container } = render(
      <DocsCommand projectId="p-1" change="enable" label="Enable docs" />,
    );
    await click("Enable docs");
    await screen.findByRole("link", { name: PR });
    const text = container.textContent ?? "";
    expect(text).toContain("Docs change only after it is merged");
    expect(text).not.toMatch(
      /\blive\b|\bpublished\b|\bare on\b|\bturned on\b/i,
    );
  });

  it("shows the server's own words when no pull request was needed", async () => {
    mocks.setProjectDocs.mockResolvedValue({
      ok: true,
      message: "Docs are already turned on.",
    });
    render(<DocsCommand projectId="p-1" change="enable" label="Enable docs" />);
    await click("Enable docs");
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByText("Docs are already turned on.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps a refusal beside the button, with no link", async () => {
    mocks.setProjectDocs.mockResolvedValue({
      ok: false,
      message: "The repository isn't approved yet.",
    });
    render(<DocsCommand projectId="p-1" change="enable" label="Enable docs" />);
    await click("Enable docs");
    expect(
      await screen.findByText("The repository isn't approved yet."),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("holds the button while the pull request is being opened", async () => {
    let finish: (value: ActionResult<unknown>) => void = () => undefined;
    mocks.setProjectDocs.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<DocsCommand projectId="p-1" change="enable" label="Enable docs" />);
    fireEvent.click(screen.getByRole("button", { name: "Enable docs" }));
    expect(
      (
        await screen.findByRole<HTMLButtonElement>("button", {
          name: "Enable docs",
        })
      ).disabled,
    ).toBe(true);
    finish(opened());
    await screen.findByRole("link", { name: PR });
  });
});
