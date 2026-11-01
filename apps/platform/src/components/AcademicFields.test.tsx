import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AcademicFields from "./AcademicFields";
import updateAcademicPrograms from "~/server/actions/updateAcademicPrograms";
import { failure, success } from "~/lib/actionResult";
import { SettingsFormProvider } from "~/ui/settings-form";
import SettingsSaveBar from "~/ui/settings-save-bar";

vi.mock("~/server/actions/updateAcademicPrograms", () => ({
  default: vi.fn(),
}));
afterEach(cleanup);

it("returns action failures and only updates its saved baseline on success", async () => {
  vi.mocked(updateAcademicPrograms)
    .mockResolvedValueOnce(failure("Program unavailable."))
    .mockResolvedValueOnce(success([]));
  const data = {
    selectedAcademicPrograms: [
      {
        id: 1,
        name: "Computer Science",
        credential: "BS",
        category: "undergraduate_major",
      },
    ],
    availableAcademicPrograms: [],
  } as unknown as ComponentProps<typeof AcademicFields>;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsFormProvider>
        <AcademicFields {...data} />
        <SettingsSaveBar />
      </SettingsFormProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Remove/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
  await screen.findByText(/Couldn’t save Academics\. Program unavailable\./);
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
  await screen.findByText("Academics updated.");
  expect(updateAcademicPrograms).toHaveBeenLastCalledWith([]);
});
