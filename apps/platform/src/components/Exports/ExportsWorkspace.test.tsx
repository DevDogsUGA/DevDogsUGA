import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportResponse } from "~/lib/exports";
import ExportsWorkspace, { type FormatOptions } from "./ExportsWorkspace";

const FORMATS: FormatOptions = {
  attendance: [
    {
      name: "platform",
      label: "Platform CSV",
      hint: "every column",
      perEvent: false,
    },
    {
      name: "bevy",
      label: "Bevy attendee import",
      hint: "gdg",
      perEvent: true,
    },
  ],
  reflections: [
    {
      name: "platform",
      label: "Platform CSV",
      hint: "every column",
      perEvent: false,
    },
  ],
  responses: [
    {
      name: "platform",
      label: "Platform CSV",
      hint: "every column",
      perEvent: false,
    },
  ],
};
const MEETINGS = [{ id: "m1", label: "Sep 9 · Build Session" }];

const sent: unknown[] = [];
function reply(res: ExportResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body));
      return { json: async () => res };
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sent.length = 0;
});

describe("ExportsWorkspace", () => {
  it("asks for a meeting before a per-meeting format can be prepared", async () => {
    const user = userEvent.setup();
    render(<ExportsWorkspace meetings={MEETINGS} formats={FORMATS} />);
    const prepare = screen.getByRole("button", { name: /Prepare export/ });
    expect(prepare).toBeEnabled();
    await user.click(screen.getByLabelText("Bevy attendee import"));
    expect(prepare).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/Meeting/), "m1");
    expect(prepare).toBeEnabled();
  });

  it("shows counts and the left-out list, and offers the report", async () => {
    reply({
      kind: "ready",
      files: [
        {
          name: "attendance.csv",
          mime: "text/csv",
          text: "a",
          count: 2,
          unit: ["row", "rows"],
          label: "Platform CSV",
        },
      ],
      zip: null,
      leftOutTotal: 1,
      leftOut: [
        {
          file: "Involvement Network list",
          outcome: "not in file",
          name: "Grace",
          email: "g@gmail.com",
          reason: "No a UGA email on file",
        },
      ],
      report: { name: "attendance-left-out.csv", text: "x" },
    });
    const user = userEvent.setup();
    render(<ExportsWorkspace meetings={MEETINGS} formats={FORMATS} />);
    await user.click(screen.getByRole("button", { name: /Prepare export/ }));
    await waitFor(() => screen.getByText("2 rows"));
    expect(screen.getByText("1 entry left out")).toBeTruthy();
    expect(screen.getByText("Grace")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Download attendance.csv" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Download left-out report" }),
    ).toBeTruthy();
    expect(sent[0]).toMatchObject({
      kind: "attendance",
      formats: ["platform"],
    });
  });

  it("shows the server's refusal", async () => {
    reply({ kind: "error", message: "Nothing was read." });
    const user = userEvent.setup();
    render(<ExportsWorkspace meetings={MEETINGS} formats={FORMATS} />);
    await user.click(screen.getByRole("button", { name: /Prepare export/ }));
    await waitFor(() => screen.getByText("Nothing was read."));
  });
});
