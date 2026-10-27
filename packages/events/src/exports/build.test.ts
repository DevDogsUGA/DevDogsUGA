import { describe, expect, it } from "vitest";
import {
  buildExportFiles,
  exportFileName,
  leftOutCsv,
  platformFormat,
  zipFileName,
} from "./index.js";
import { EXPORTS } from "./queries.js";

const ada = {
  user_id: "u-1",
  preferred_name: "=Ada, the first",
  email: "ada@uga.edu",
  github_login: null,
  meeting_slug: "2026-09-09",
  meeting_title: "Build Session",
  meeting_starts_at: new Date("2026-09-09T22:00:00Z"),
  checked_in_at: new Date("2026-09-09T22:05:00Z"),
  check_in_method: "import",
  has_workshop: true,
  uga_email: "ada@uga.edu",
  first_name: "Ada",
  last_name: "Lovelace",
};
const grace = {
  ...ada,
  user_id: "u-2",
  preferred_name: "Grace",
  email: "grace@gmail.com",
  uga_email: "",
  first_name: "Grace",
  last_name: "Hopper",
};

describe("buildExportFiles", () => {
  it("writes the platform CSV the way the CLI does: BOM, header, neutralised cells", () => {
    const { files, leftOut } = buildExportFiles({
      kind: "attendance",
      formats: ["platform"],
      rows: [ada],
      name: { meetingSlug: "2026-09-09" },
    });
    const columns = EXPORTS.attendance.columns;
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("attendance-2026-09-09.csv");
    expect(files[0]!.text.startsWith("﻿" + columns.join(","))).toBe(true);
    // A leading = is guarded with a tab so a spreadsheet will not run it.
    expect(files[0]!.text).toContain('"\t=Ada, the first"');
    expect(files[0]!.text).toContain("2026-09-09T22:05:00.000Z");
    expect(files[0]!.count).toBe(1);
    expect(leftOut).toEqual([]);
  });

  it("matches the platform format's own bytes", () => {
    const { files } = buildExportFiles({
      kind: "attendance",
      formats: ["platform"],
      rows: [ada, grace],
    });
    const format = platformFormat(EXPORTS.attendance.columns);
    const w = format.writer();
    expect(files[0]!.text).toBe("﻿" + format.head + w.page([ada, grace]).text);
  });

  it("lists who each format left out, and why", () => {
    const { files, leftOut } = buildExportFiles({
      kind: "attendance",
      formats: ["bevy", "involvement"],
      rows: [
        ada,
        grace,
        { ...grace, user_id: "u-3", email: "", uga_email: "" },
      ],
      surveyRows: [],
    });
    const involvement = files.find((f) => f.format === "involvement")!;
    expect(involvement.text).toBe("ada@uga.edu\r\n");
    expect(involvement.name).toBe("attendance-involvement.txt");
    // Grace has a gmail address Bevy can use; the third has none at all.
    const bevy = files.find((f) => f.format === "bevy")!;
    expect(bevy.count).toBe(2);
    expect(
      leftOut.map((l) => [l.format, l.userId, l.outcome, l.reason]),
    ).toEqual([
      ["bevy", "u-3", "not in file", "No an email on file"],
      ["involvement", "u-2", "not in file", "No a UGA email on file"],
      ["involvement", "u-3", "not in file", "No a UGA email on file"],
    ]);
  });

  it("reports survey answers withheld from the Bevy file", () => {
    const { files, leftOut } = buildExportFiles({
      kind: "attendance",
      formats: ["bevy"],
      rows: [ada],
      // Ada answered one question; the form requires another as well, so her
      // answers are held back though she is still in the file.
      surveyRows: [
        {
          user_id: "u-1",
          preferred_name: "Ada",
          email: "ada@uga.edu",
          definition: { bevy: "survey:how_did_you_learn_about_this_event_1" },
          answer: "Social media",
        },
      ],
    });
    expect(files[0]!.count).toBe(1);
    expect(files[0]!.text).not.toContain("Social media");
    expect(leftOut).toHaveLength(1);
    expect(leftOut[0]!.userId).toBe("u-1");
    expect(leftOut[0]!.outcome).toBe("survey answers left out");
    expect(leftOut[0]!.reason).toContain(
      "survey:how_familiar_are_you_with_google_developer_tools",
    );
  });
});

describe("names and the report", () => {
  it("names files and the ZIP from the filters", () => {
    const parts = {
      meetingSlug: "2026-09-09",
      from: "2026-08-17",
      to: "2026-12-12",
    };
    const bevy = buildExportFiles({
      kind: "attendance",
      formats: ["bevy"],
      rows: [],
      name: parts,
    }).files[0]!;
    expect(bevy.name).toBe(
      "attendance-2026-09-09-2026-08-17-2026-12-12-bevy.csv",
    );
    expect(zipFileName("attendance", parts)).toBe(
      "attendance-2026-09-09-2026-08-17-2026-12-12.zip",
    );
    expect(exportFileName("reflections", {}, platformFormat([]))).toBe(
      "reflections.csv",
    );
  });

  it("writes the left-out report as CSV with neutralised cells", () => {
    const csv = leftOutCsv([
      {
        format: "involvement",
        formatLabel: "Involvement Network list",
        outcome: "not in file",
        userId: "u-2",
        name: "=HYPERLINK(1)",
        email: "g@gmail.com",
        reason: "No a UGA email on file",
      },
    ]);
    expect(csv.startsWith("﻿file,outcome,user_id,name,email,reason")).toBe(
      true,
    );
    expect(csv).toContain("\t=HYPERLINK(1)");
  });
});
