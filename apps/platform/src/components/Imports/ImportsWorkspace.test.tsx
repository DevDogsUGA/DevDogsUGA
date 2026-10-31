import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportPreview, ImportResponse } from "~/lib/imports";
import ImportsWorkspace from "./ImportsWorkspace";

const MEETINGS = [{ id: "m1", label: "Oct 5 · Build Session" }];

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    kind: "attendance",
    mode: "add",
    fileName: "sheet.csv",
    headers: ["Email", "Name"],
    mappingFields: [
      { key: "email", label: "UGA email column", required: true },
      { key: "name", label: "Name column (optional)", required: false },
    ],
    mapping: { email: "Email", name: "Name" },
    meeting: { id: "m1", title: "Build Session", when: "Monday, October 5" },
    summary: [{ label: "To record (have an account)", count: 2 }],
    samples: [],
    warnings: [],
    invalid: [],
    invalidMore: 0,
    blocked: null,
    fingerprint: "a".repeat(64),
    ...overrides,
  };
}

const sent: { url: string; body: FormData }[] = [];

function reply(...responses: ImportResponse[]) {
  const queue = [...responses];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: FormData }) => {
      sent.push({ url, body: init.body });
      return { json: async () => queue.shift() };
    }),
  );
}

async function chooseFile(
  user: ReturnType<typeof userEvent.setup>,
  size?: number,
) {
  const input = screen.getByLabelText(/CSV file/);
  const file = new File(["Email,Name\n"], "sheet.csv", { type: "text/csv" });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  await user.upload(input, file);
}

afterEach(() => {
  cleanup();
  sent.length = 0;
  vi.unstubAllGlobals();
});

describe("ImportsWorkspace", () => {
  it("previews first and keeps Confirm off until a preview exists", async () => {
    const user = userEvent.setup();
    reply({ kind: "preview", preview: preview() });
    render(
      <ImportsWorkspace
        meetings={MEETINGS}
        initialKind="attendance"
        initialMeetingId="m1"
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Confirm and import/ }),
    ).toBeNull();
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /Preview/ }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Confirm and import/ }),
      ).toBeTruthy(),
    );
    expect(sent[0]!.url).toBe("/dashboard/data/imports/preview");
    expect(sent[0]!.body.get("meetingId")).toBe("m1");
    expect(sent[0]!.body.get("kind")).toBe("attendance");
  });

  it("refuses a file over the cap without sending it", async () => {
    const user = userEvent.setup();
    reply();
    render(
      <ImportsWorkspace
        meetings={MEETINGS}
        initialKind="roster"
        initialMeetingId={null}
      />,
    );
    await chooseFile(user, 5_000_000);
    expect(screen.getByText(/over the 1 MB limit/)).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /Preview/ })
        .disabled,
    ).toBe(true);
    expect(sent).toEqual([]);
  });

  it("needs the skipped-rows acknowledgement before Confirm", async () => {
    const user = userEvent.setup();
    reply({
      kind: "preview",
      preview: preview({
        invalid: [
          {
            line: 4,
            value: "x@gmail.com",
            reason: "Not a UGA (@uga.edu) address",
          },
        ],
      }),
    });
    render(
      <ImportsWorkspace
        meetings={MEETINGS}
        initialKind="attendance"
        initialMeetingId="m1"
      />,
    );
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /^Preview/ }));
    const confirm = await screen.findByRole("button", {
      name: /Confirm and import/,
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByRole("button", { name: /Download error report/ }),
    ).toBeTruthy();
    await user.click(screen.getByLabelText(/invalid rows will be skipped/));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends the fingerprint on confirm and shows a refreshed preview when the data changed", async () => {
    const user = userEvent.setup();
    reply(
      { kind: "preview", preview: preview() },
      {
        kind: "preview",
        preview: preview({ fingerprint: "b".repeat(64) }),
        notice:
          "The data changed since you previewed this file, so the preview was refreshed.",
      },
    );
    render(
      <ImportsWorkspace
        meetings={MEETINGS}
        initialKind="attendance"
        initialMeetingId="m1"
      />,
    );
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /^Preview/ }));
    await user.click(
      await screen.findByRole("button", { name: /Confirm and import/ }),
    );

    await screen.findByText(/since you previewed this file/);
    expect(sent[1]!.url).toBe("/dashboard/data/imports/confirm");
    expect(sent[1]!.body.get("fingerprint")).toBe("a".repeat(64));
    // Still asking: confirming again is a new, explicit step.
    expect(
      screen.getByRole("button", { name: /Confirm and import/ }),
    ).toBeTruthy();
  });

  it("goes stale when the mode changes, and asks to preview again", async () => {
    const user = userEvent.setup();
    reply({ kind: "preview", preview: preview() });
    render(
      <ImportsWorkspace
        meetings={MEETINGS}
        initialKind="attendance"
        initialMeetingId="m1"
      />,
    );
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /^Preview/ }));
    await screen.findByRole("button", { name: /Confirm and import/ });
    await user.click(screen.getByLabelText("Replace earlier import"));
    // Changing the mode drops the preview rather than confirming a stale one.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Confirm and import/ }),
      ).toBeNull(),
    );
  });

  it("shows the result, failed accounts and a report", async () => {
    const user = userEvent.setup();
    reply(
      { kind: "preview", preview: preview() },
      {
        kind: "result",
        result: {
          status: "partial",
          kind: "attendance",
          mode: "add",
          message: "Recorded 1; 1 account could not be created.",
          counts: [{ label: "Check-ins recorded", count: 1 }],
          failures: [{ email: "cd67890@uga.edu", reason: "rate limited" }],
          invalid: [],
          invalidMore: 0,
        },
      },
    );
    render(
      <ImportsWorkspace
        meetings={MEETINGS}
        initialKind="attendance"
        initialMeetingId="m1"
      />,
    );
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /^Preview/ }));
    await user.click(
      await screen.findByRole("button", { name: /Confirm and import/ }),
    );

    await screen.findByText(/Import finished with problems/);
    expect(screen.getByText("cd67890@uga.edu")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Download error report/ }),
    ).toBeTruthy();
  });

  it("shows the picker when the header was not recognized", async () => {
    const user = userEvent.setup();
    reply({
      kind: "needs-mapping",
      preview: null,
      headers: ["A", "B", "C"],
      mappingFields: [
        { key: "firstName", label: "First name column", required: true },
        { key: "lastName", label: "Last name column", required: true },
        { key: "email", label: "UGA email column", required: true },
      ],
      mapping: { firstName: null, lastName: null, email: null },
      message: "No header row.",
    });
    render(
      <ImportsWorkspace
        meetings={MEETINGS}
        initialKind="roster"
        initialMeetingId={null}
      />,
    );
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /^Preview/ }));
    await screen.findByText(/header was not recognized/);
    expect(screen.getByLabelText(/First name column/)).toBeTruthy();
  });
});
