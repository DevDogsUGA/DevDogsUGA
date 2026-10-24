import { describe, expect, it } from "vitest";
import { errorReportCsv } from "./imports";

describe("errorReportCsv", () => {
  it("lists skipped rows with their lines and quotes what needs it", () => {
    const csv = errorReportCsv(
      [
        {
          line: 4,
          value: 'a,"b"@x.com',
          reason: "Not a UGA (@uga.edu) address",
        },
      ],
      [{ email: "ab12345@uga.edu", reason: "rate limited" }],
    );
    expect(csv.split("\r\n")).toEqual([
      "Line,Value,Problem",
      '4,"a,""b""@x.com",Not a UGA (@uga.edu) address',
      ",ab12345@uga.edu,Account not created: rate limited",
      "",
    ]);
  });

  it("neutralizes cells a spreadsheet would run as formulas", () => {
    const csv = errorReportCsv([
      { line: 2, value: "=HYPERLINK(1)", reason: "x" },
    ]);
    expect(csv).toContain("'=HYPERLINK(1)");
  });
});
