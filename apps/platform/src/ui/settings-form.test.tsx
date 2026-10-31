import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpectedFailure, failure, success } from "~/lib/actionResult";
import SettingsField from "./settings-field";
import {
  SettingsFormProvider,
  type SettingsFieldRegistration,
} from "./settings-form";
import SettingsSaveBar from "./settings-save-bar";

afterEach(cleanup);

function DraftField({
  id,
  save,
  error = null,
}: {
  id: string;
  save: SettingsFieldRegistration["save"];
  error?: string | null;
}) {
  const [draft, setDraft] = useState("edited");
  const [baseline, setBaseline] = useState("original");
  return (
    <section data-testid={id}>
      <SettingsField
        id={id}
        label={id}
        draft={draft}
        isDirty={draft !== baseline}
        error={error}
        reset={() => setDraft(baseline)}
        save={async () => {
          const result = await save();
          if (!result || result.ok) setBaseline(draft);
          return result;
        }}
      >
        <input
          aria-label={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </SettingsField>
    </section>
  );
}

function setup(saves: Record<string, SettingsFieldRegistration["save"]>) {
  render(
    <SettingsFormProvider>
      {Object.entries(saves).map(([id, save]) => (
        <DraftField key={id} id={id} save={save} />
      ))}
      <SettingsSaveBar />
    </SettingsFormProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
}

describe("Draft saves", () => {
  it("shows a returned failure and reveals only its own field error without blur", async () => {
    setup({
      Bio: vi.fn().mockResolvedValue(
        failure("Profile locked.", {
          Bio: "Ask an officer.",
          Name: "Wrong field.",
        }),
      ),
      Name: vi.fn().mockResolvedValue(success()),
    });
    await screen.findByText(
      /Couldn’t save Bio\. Profile locked\. Your other changes were saved\./,
    );
    expect(
      within(screen.getByTestId("Bio")).getByText("Ask an officer."),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("Name")).queryByText("Wrong field."),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /^Save/ })).not.toBeDisabled();
  });

  it("lists each failed label with its message", async () => {
    setup({
      Bio: async () => failure("Too long."),
      Name: async () => failure("Name taken."),
    });
    await screen.findByText(
      "Couldn’t save Bio and Name. Bio: Too long. Name: Name taken. Nothing was lost; try again.",
    );
  });

  it("supports legacy rejections without exposing unexpected error text", async () => {
    setup({
      Bio: async () => {
        throw new Error("database details");
      },
    });
    await screen.findByText(
      /Couldn’t save Bio\. Something went wrong\. Please try again\./,
    );
    expect(screen.queryByText(/database details/)).toBeNull();
  });

  it("preserves ExpectedFailure messages and field errors", async () => {
    setup({
      Bio: async () => {
        throw new ExpectedFailure("Locked.", { Bio: "Contact an officer." });
      },
    });
    await screen.findByText("Contact an officer.");
    expect(screen.getByText(/Couldn’t save Bio\. Locked\./)).toBeTruthy();
  });

  it("retries only failed fields without an edit after a server error", async () => {
    const bio = vi
      .fn()
      .mockResolvedValueOnce(failure("Try later.", { Bio: "Unavailable." }))
      .mockResolvedValueOnce(success());
    const name = vi.fn().mockResolvedValue(undefined);
    setup({ Bio: bio, Name: name });
    await screen.findByText("Unavailable.");
    // Let the clean field's summary land so the click sees only Bio as dirty.
    await act(() => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await screen.findByText("Bio updated.");
    expect(bio).toHaveBeenCalledTimes(2);
    expect(name).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Unavailable.")).toBeNull();
  });

  it("clears a server field error on edit and does not revive it on reverting", async () => {
    setup({ Bio: async () => failure("Try later.", { Bio: "Unavailable." }) });
    await screen.findByText("Unavailable.");
    fireEvent.change(screen.getByLabelText("Bio"), {
      target: { value: "another" },
    });
    expect(screen.queryByText("Unavailable.")).toBeNull();
    fireEvent.change(screen.getByLabelText("Bio"), {
      target: { value: "edited" },
    });
    expect(screen.queryByText("Unavailable.")).toBeNull();
  });

  it("discards errors with the draft", async () => {
    setup({ Bio: async () => failure("Try later.", { Bio: "Unavailable." }) });
    await screen.findByText("Unavailable.");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByText("Unavailable.")).toBeNull();
  });

  it("does not attach a late server error to an edited draft", async () => {
    let finish!: (result: ReturnType<typeof failure>) => void;
    const save = new Promise<ReturnType<typeof failure>>((resolve) => {
      finish = resolve;
    });
    setup({ Bio: () => save });
    fireEvent.change(screen.getByLabelText("Bio"), {
      target: { value: "new draft" },
    });
    finish(failure("Rejected old draft.", { Bio: "Old field error." }));
    await screen.findByText(/Rejected old draft/);
    expect(screen.queryByText("Old field error.")).toBeNull();
  });

  it("still blocks invalid client drafts and reveals their errors", async () => {
    const save = vi.fn();
    render(
      <SettingsFormProvider>
        <DraftField id="Bio" save={save} error="Too long." />
        <SettingsSaveBar />
      </SettingsFormProvider>,
    );
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() =>
      expect(
        within(screen.getByTestId("Bio")).getByText("Too long."),
      ).toBeTruthy(),
    );
    expect(save).not.toHaveBeenCalled();
  });
});
