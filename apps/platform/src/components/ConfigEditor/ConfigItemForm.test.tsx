import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";
import type { FieldSpec } from "~/server/config/editFields";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  reset: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("~/server/actions/configEdits", () => ({
  saveConfigEditAction: mocks.save,
  resetConfigEditAction: mocks.reset,
}));

const { default: ConfigItemForm } = await import("./ConfigItemForm");

const FIELDS: FieldSpec[] = [
  { name: "id", label: "Id", kind: "text", required: true, isKey: true },
  { name: "title", label: "Title", kind: "text", required: true },
  {
    name: "category",
    label: "Category",
    kind: "select",
    options: [{ value: "info", label: "Info" }],
  },
  { name: "summary", label: "Summary", kind: "textarea" },
];
const VALUES = { id: "dlw", title: "Dogwood", category: "", summary: "Hello" };

function renderForm(
  over: Partial<React.ComponentProps<typeof ConfigItemForm>> = {},
) {
  return render(
    <ConfigItemForm
      collection="venue"
      itemKey="dlw"
      singular="venue"
      isNew={false}
      keyLocked
      fields={FIELDS}
      values={VALUES}
      officialValues={{ ...VALUES, title: "Official" }}
      choices={{}}
      hasEdit
      {...over}
    />,
  );
}

const saveButton = () => screen.getByRole("button", { name: /^Save/ });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConfigItemForm", () => {
  it("starts clean, and holds an edit until Save sends the whole item", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValue(success({ cleared: false }, "Saved."));
    renderForm();
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();

    await user.type(screen.getByLabelText(/Title/), "!");
    await user.click(saveButton());

    await screen.findByText("Venue details updated.");
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
      collection: "venue",
      key: "dlw",
      isNew: false,
      values: { ...VALUES, title: "Dogwood!" },
    });
    expect(mocks.refresh).toHaveBeenCalled();
    // The baseline moved: the bar has nothing left to save.
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(screen.getByLabelText(/Title/)).toHaveValue("Dogwood!");
  });

  it("treats a cleared save as success and resets the baseline", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValue(
      success({ cleared: true }, "No differences from the official config."),
    );
    renderForm();
    await user.clear(screen.getByLabelText(/Title/));
    await user.type(screen.getByLabelText(/Title/), "Official");
    await user.click(saveButton());
    await screen.findByText("Venue details updated.");
    await waitFor(() => expect(saveButton()).toBeDisabled());
  });

  it("puts each server error under its own field and keeps the edit for a retry", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValueOnce(
      failure("Title is required.", {
        title: "Title is required.",
        summary: "Summary is too long.",
      }),
    );
    renderForm();
    await user.clear(screen.getByLabelText(/Title/));
    await user.click(saveButton());

    await screen.findByText(
      /Couldn’t save Venue details\. Title is required\./,
    );
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Title is required."),
        expect.stringContaining("Summary is too long."),
      ]),
    );
    expect(screen.getByLabelText(/Title/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    // Editing the text clears its stale error; the form stays dirty.
    await user.type(screen.getByLabelText(/Title/), "Back");
    expect(screen.queryByText("Summary is too long.")).toBeNull();
    expect(saveButton()).toBeInTheDocument();
  });

  it("starts a new item from an empty baseline, so any value is a change", async () => {
    const user = userEvent.setup();
    renderForm({
      itemKey: "new",
      isNew: true,
      keyLocked: false,
      hasEdit: false,
      values: { id: "", title: "", category: "", summary: "" },
    });
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
    await user.type(screen.getByLabelText(/Id/), "q");
    expect(saveButton()).toBeInTheDocument();
  });

  it("locks the key of an existing item", () => {
    renderForm();
    expect(screen.getByLabelText(/Id/)).toHaveAttribute("readonly");
  });

  it("Reset to official is a Command: it returns the form to the official text", async () => {
    const user = userEvent.setup();
    mocks.reset.mockResolvedValue(success(undefined, "Reset to official."));
    renderForm();
    await user.click(screen.getByRole("button", { name: "Reset to official" }));
    await waitFor(() =>
      expect(mocks.reset).toHaveBeenCalledExactlyOnceWith("venue", "dlw"),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Title/)).toHaveValue("Official"),
    );
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });

  it("shows a refused Reset beside the button and leaves the form alone", async () => {
    const user = userEvent.setup();
    mocks.reset.mockResolvedValue(failure("Only officers can do that."));
    renderForm();
    await user.click(screen.getByRole("button", { name: "Reset to official" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only officers can do that.",
    );
    expect(screen.getByLabelText(/Title/)).toHaveValue("Dogwood");
  });
});
