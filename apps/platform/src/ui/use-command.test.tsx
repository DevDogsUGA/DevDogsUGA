import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { success, failure, type ActionResult } from "~/lib/actionResult";
import { useCommand, CommandFeedback } from "./use-command";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), success: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: mocks.success } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function Example({
  action,
  refresh,
}: {
  action: (data: FormData) => Promise<ActionResult>;
  refresh?: boolean;
}) {
  const command = useCommand(action, { refresh });
  return (
    <form action={command.run}>
      <input name="name" defaultValue="Ada" />
      <button disabled={command.pending}>Run</button>
      <CommandFeedback result={command.result} />
    </form>
  );
}
it("passes form data, remains pending, then refreshes and toasts success", async () => {
  let finish!: (value: ActionResult) => void;
  const action = vi.fn(
    () =>
      new Promise<ActionResult>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Example action={action} />);
  await userEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("button")).toBeDisabled();
  expect(action.mock.calls[0]).toBeDefined();
  finish(success(undefined, "Saved."));
  await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.success).toHaveBeenCalledWith("Saved.");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("retains authorization refusal inline without refreshing or toasting", async () => {
  render(<Example action={async () => failure("Not authorized.")} />);
  await userEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Not authorized.");
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.success).not.toHaveBeenCalled();
});
it("allows lookup commands to opt out of refresh", async () => {
  render(<Example action={async () => success()} refresh={false} />);
  await userEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("renders nothing for absent or successful results", () => {
  const { container, rerender } = render(<CommandFeedback result={null} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<CommandFeedback result={success()} />);
  expect(container).toBeEmptyDOMElement();
});
