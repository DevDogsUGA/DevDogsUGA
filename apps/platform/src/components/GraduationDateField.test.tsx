import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import GraduationDateField from "./GraduationDateField";
import updateGraduation from "~/server/actions/updateGraduation";
import { failure, success } from "~/lib/actionResult";
import { SettingsFormProvider } from "~/ui/settings-form";
import SettingsSaveBar from "~/ui/settings-save-bar";

vi.mock("~/server/actions/updateGraduation", () => ({ default: vi.fn() }));
vi.mock("~/components/Select", () => {
  const Select = ({
    value,
    onValueChange,
    placeholder,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    placeholder: string;
    children: React.ReactNode;
  }) => (
    <select
      aria-label={placeholder}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="" />
      {children}
    </select>
  );
  Select.Item = function Option({
    children,
    ...props
  }: React.ComponentProps<"option">) {
    return <option {...props}>{children}</option>;
  };
  return { default: Select };
});
afterEach(cleanup);

it("returns failure to the bar, keeps the draft dirty, and advances the baseline only on success", async () => {
  vi.mocked(updateGraduation)
    .mockResolvedValueOnce(
      failure("Graduation locked.", { graduation: "Check graduation." }),
    )
    .mockResolvedValueOnce(success());
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsFormProvider>
        <GraduationDateField
          {...({
            profile: { graduationSemester: null, graduationYear: null },
          } as ComponentProps<typeof GraduationDateField>)}
        />
        <SettingsSaveBar />
      </SettingsFormProvider>
    </QueryClientProvider>,
  );
  const year = String(new Date().getFullYear() + 1);
  fireEvent.change(screen.getByLabelText("Semester"), {
    target: { value: "fall" },
  });
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: year } });
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
  await screen.findByText(/Couldn’t save Graduation\. Graduation locked\./);
  expect(screen.getByText("Check graduation.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
  await screen.findByText("Graduation updated.");
  expect(updateGraduation).toHaveBeenLastCalledWith("fall", Number(year));
});
