import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ReflectionSettingsCard from "./ReflectionSettingsCard";
import { updateReflectionSettings } from "~/server/actions/reflectionSettings";
import { failure, success } from "~/lib/actionResult";

vi.mock("~/server/actions/reflectionSettings", () => ({
  updateReflectionSettings: vi.fn(),
}));
afterEach(cleanup);

it("returns the action result to Draft and keeps failed edits available for retry", async () => {
  vi.mocked(updateReflectionSettings)
    .mockResolvedValueOnce(
      failure("Policy locked.", { reflectionSettings: "Try later." }),
    )
    .mockResolvedValueOnce(success(undefined, "Reflection settings updated."));
  render(
    <ReflectionSettingsCard
      settings={{ minimumWordCount: 100, submissionWindowDays: 7 }}
    />,
  );
  fireEvent.change(screen.getByLabelText(/Minimum words/), {
    target: { value: "200" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
  await screen.findByText(
    /Couldn’t save Reflection settings\. Policy locked\./,
  );
  expect(screen.getByText("Try later.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
  await screen.findByText("Reflection settings updated.");
  const data = vi.mocked(updateReflectionSettings).mock.calls[1]![1];
  expect(data.get("minimumWordCount")).toBe("200");
  expect(data.get("submissionWindowDays")).toBe("7");
});
