import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  add: vi.fn(),
  invite: vi.fn(),
  resend: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: mocks.success } }));
vi.mock("~/server/actions/officerAttendance", () => ({
  findAttendee: mocks.find,
  addAttendee: mocks.add,
  inviteAttendee: mocks.invite,
  resendInvite: mocks.resend,
  cancelInvite: mocks.cancel,
  removeAttendee: mocks.remove,
}));
import {
  AddAttendeeForm,
  InviteActions,
  RemoveAttendee,
} from "./MeetingAttendance";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
async function lookup() {
  await userEvent.type(screen.getByLabelText("Add by MyID"), "member");
  await userEvent.click(screen.getByRole("button", { name: "Look up" }));
}
it("shows refused lookup authorization inline", async () => {
  mocks.find.mockResolvedValue({
    ok: false,
    message: "Not authorized: canManageAttendance required.",
  });
  render(<AddAttendeeForm meetingId="meeting" />);
  await lookup();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Not authorized: canManageAttendance required.",
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("composes lookup and account confirmation before recording", async () => {
  mocks.find.mockResolvedValue({
    ok: true,
    data: { status: "confirm", myId: "member", name: "Member" },
  });
  mocks.add.mockResolvedValue({ ok: true, message: "Member is recorded." });
  render(<AddAttendeeForm meetingId="meeting" />);
  await lookup();
  const record = await screen.findByRole("button", { name: "Record Member" });
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  await userEvent.click(record);
  await waitFor(() =>
    expect(mocks.success).toHaveBeenCalledWith("Member is recorded."),
  );
  expect(
    screen.queryByRole("button", { name: "Record Member" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Add another" }));
  expect(screen.getByLabelText("Add by MyID")).toHaveValue("");
});
it("composes lookup and invite, keeping an email failure inline", async () => {
  mocks.find.mockResolvedValue({
    ok: true,
    data: { status: "invite", myId: "member", email: "member@uga.edu" },
  });
  mocks.invite.mockResolvedValue({
    ok: false,
    message:
      "The invite is saved but the email could not be sent. Use Resend to try again.",
  });
  render(<AddAttendeeForm meetingId="meeting" />);
  await lookup();
  await userEvent.click(
    await screen.findByRole("button", { name: "Send invite" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Use Resend to try again.",
  );
  expect(mocks.success).not.toHaveBeenCalled();
});
it("dismisses a stale lookup decision when MyID changes", async () => {
  mocks.find.mockResolvedValue({
    ok: true,
    data: { status: "confirm", myId: "member", name: "Member" },
  });
  render(<AddAttendeeForm meetingId="meeting" />);
  await lookup();
  await screen.findByRole("button", { name: "Record Member" });
  await userEvent.type(screen.getByLabelText("Add by MyID"), "2");
  expect(
    screen.queryByRole("button", { name: "Record Member" }),
  ).not.toBeInTheDocument();
});
it("resends and cancels invites with command feedback", async () => {
  mocks.resend.mockResolvedValue({
    ok: true,
    message: "Invite resent to member@uga.edu.",
  });
  mocks.cancel.mockResolvedValue({
    ok: false,
    message: "That invite is no longer pending.",
  });
  render(<InviteActions meetingId="meeting" inviteId="invite" who="Member" />);
  await userEvent.click(
    screen.getByRole("button", { name: /Resend.*invite to Member/ }),
  );
  await waitFor(() =>
    expect(mocks.success).toHaveBeenCalledWith(
      "Invite resent to member@uga.edu.",
    ),
  );
  await userEvent.click(
    screen.getByRole("button", { name: /Cancel.*invite to Member/ }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "That invite is no longer pending.",
  );
});
it("keeps removal refusals inline", async () => {
  mocks.remove.mockResolvedValue({
    ok: false,
    message: "They are no longer on the list.",
  });
  render(
    <RemoveAttendee
      meetingId="meeting"
      attendanceId="attendance"
      who="Member"
    />,
  );
  await userEvent.click(screen.getByText("Remove", { selector: "summary" }));
  await userEvent.click(screen.getByRole("button", { name: "Remove Member" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "They are no longer on the list.",
  );
});
