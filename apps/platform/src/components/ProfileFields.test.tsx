import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import BioField from "./BioField";
import PreferredNameField from "./PreferredNameField";
import PronounsField from "./PronounsField";
import RoleDescriptionField from "./RoleDescriptionField";
import {
  updateBio,
  updateIdentity,
  updateRoleDescription,
} from "~/server/actions/profile";
import { failure, success } from "~/lib/actionResult";
import { SettingsFormProvider } from "~/ui/settings-form";
import SettingsSaveBar from "~/ui/settings-save-bar";

vi.mock("~/server/actions/profile", () => ({
  updateBio: vi.fn(),
  updateIdentity: vi.fn(),
  updateRoleDescription: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function inForm(field: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsFormProvider>
        {field}
        <SettingsSaveBar />
      </SettingsFormProvider>
    </QueryClientProvider>,
  );
}

const save = () =>
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }));

/** The field components read only `profile`; the rest of the page data is not theirs. */
const withProfile = (profile: Record<string, unknown>) =>
  ({ profile }) as unknown as ComponentProps<typeof BioField>;

it("saves the preferred name through updateIdentity and advances the baseline only on success", async () => {
  vi.mocked(updateIdentity)
    .mockResolvedValueOnce(
      failure("This profile can't be edited right now.", {
        preferredName: "Locked.",
      }),
    )
    .mockResolvedValueOnce(success({ preferredName: "Ada" }));
  inForm(<PreferredNameField {...withProfile({ preferredName: "Old" })} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "  Ada  " },
  });
  save();
  await screen.findByText(
    /Couldn’t save Preferred Name\. This profile can't be edited right now\./,
  );
  expect(screen.getByText("Locked.")).toBeTruthy();

  save();
  await screen.findByText("Preferred Name updated.");
  expect(updateIdentity).toHaveBeenLastCalledWith({ preferredName: "Ada" });
  expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("Ada");
});

it("saves pronouns through updateIdentity as a pronouns-only change", async () => {
  vi.mocked(updateIdentity).mockResolvedValue(success({ pronouns: ["she"] }));
  inForm(<PronounsField {...withProfile({ pronouns: ["they"] })} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove they" }));
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "she" } });
  fireEvent.keyDown(input, { key: "Enter" });
  save();
  await screen.findByText("Pronouns updated.");
  expect(updateIdentity).toHaveBeenCalledWith({ pronouns: ["she"] });
});

it("saves the bio through updateBio and shows the server's message under the bar", async () => {
  vi.mocked(updateBio).mockResolvedValueOnce(
    failure("Bio is read-only.", { bio: "Try again later." }),
  );
  inForm(<BioField {...withProfile({ bio: null })} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Hello" },
  });
  save();
  await screen.findByText(/Couldn’t save Bio\. Bio is read-only\./);
  expect(screen.getByText("Try again later.")).toBeTruthy();
  expect(updateBio).toHaveBeenCalledWith("Hello");
});

it("saves the role description through updateRoleDescription", async () => {
  vi.mocked(updateRoleDescription).mockResolvedValue(success("Runs it"));
  inForm(<RoleDescriptionField {...withProfile({ roleDescription: null })} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: " Runs it " },
  });
  save();
  await screen.findByText("Role Description updated.");
  expect(updateRoleDescription).toHaveBeenCalledWith("Runs it");
});
