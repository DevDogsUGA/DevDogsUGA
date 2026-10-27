/**
 * `import attendance` end to end against fake production: one meeting, a
 * few accounts and check-ins, an Auth admin that hands out ids, and an apply
 * step that records what it was given.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountRow } from "../production/accounts.js";
import type { Meeting } from "../production/meetings.js";
import {
  runAttendance,
  type AttendanceDeps,
  type AttendanceSource,
} from "./commands.js";
import type { AttendanceWrite } from "./store.js";

const MEETING: Meeting = {
  id: "m-1",
  slug: "2026-09-09",
  title: "Build Session",
  startsAt: new Date("2026-09-09T22:00:00Z"),
  endsAt: new Date("2026-09-10T00:00:00Z"),
  cancelledAt: null,
  hasWorkshop: true,
};

function account(userId: string, email: string): AccountRow {
  return {
    userId,
    authEmail: email,
    ugaEmail: null,
    hasProfile: true,
    preferredName: null,
    involvementFirstName: null,
    involvementLastName: null,
  };
}

const SHEET = [
  "Timestamp,Email Address,Name",
  "9/9/2026 18:05,ada@uga.edu,Ada Lovelace",
  "9/9/2026 18:06,qr@uga.edu,Q R",
  "9/9/2026 18:07,new@uga.edu,New Person",
].join("\n");

let stderr: string;
let applied: AttendanceWrite | undefined;
let created: string[];
let meetings: Meeting[];
let importMethod: boolean;

function deps(overrides: Partial<AttendanceDeps> = {}): AttendanceDeps {
  const source: AttendanceSource = {
    findMeetings: async () => meetings,
    checkIns: async () => [
      { userId: "u-qr", method: "qr" },
      { userId: "u-old", method: "import" },
    ],
    accounts: async () => [
      account("u-ada", "ada@uga.edu"),
      account("u-qr", "qr@uga.edu"),
      account("u-old", "old@uga.edu"),
    ],
    requireImportMethod: async () => {
      if (!importMethod) throw new Error("no import method");
    },
    close: () => Promise.resolve(),
  };
  return {
    readFile: async () => SHEET,
    source: async () => source,
    createAccount: async (email) => {
      created.push(email);
      return `u-new-${email}`;
    },
    apply: async (write) => {
      applied = write;
      return { recorded: 2, removed: write.replace ? 1 : 0 };
    },
    interactive: false,
    now: () => new Date("2026-10-02T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  stderr = "";
  applied = undefined;
  created = [];
  meetings = [MEETING];
  importMethod = true;
  process.exitCode = undefined;
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  process.env.CI = "true";
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

const ARGS = ["--meeting", "2026-09-09", "--file", "s.csv"];

describe("import attendance", () => {
  it("previews without writing on --dry-run", async () => {
    await runAttendance([...ARGS, "--dry-run"], deps());
    expect(process.exitCode).toBeUndefined();
    expect(stderr).toContain("Meeting: Build Session, 2026-09-09");
    expect(stderr).toContain('from "Email Address", names from "Name"');
    expect(stderr).toContain("1 to record");
    expect(stderr).toContain("1 to create an account for");
    expect(stderr).toContain("1 checked in themselves");
    expect(applied).toBeUndefined();
    expect(created).toEqual([]);
  });

  it("creates the missing account, then records everyone with method import", async () => {
    await runAttendance([...ARGS, "--yes"], deps());
    expect(process.exitCode).toBeUndefined();
    expect(created).toEqual(["new@uga.edu"]);
    expect(applied).toEqual({
      meetingId: "m-1",
      recordedAt: MEETING.startsAt,
      profiles: [
        {
          userId: "u-new-new@uga.edu",
          email: "new@uga.edu",
          name: "New Person",
        },
      ],
      userIds: ["u-ada", "u-qr", "u-new-new@uga.edu"],
      replace: false,
    });
  });

  it("with --replace, previews the earlier imported row it removes", async () => {
    await runAttendance([...ARGS, "--replace", "--yes"], deps());
    expect(stderr).toContain(
      "1 imported before but not on this sheet, to remove",
    );
    expect(applied?.replace).toBe(true);
  });

  it("refuses a cancelled or future meeting", async () => {
    meetings = [{ ...MEETING, cancelledAt: new Date() }];
    await runAttendance([...ARGS, "--yes"], deps());
    expect(stderr).toContain("was cancelled");
    meetings = [{ ...MEETING, startsAt: new Date("2027-01-01T00:00:00Z") }];
    await runAttendance([...ARGS, "--yes"], deps());
    expect(stderr).toContain("has not started yet");
    expect(applied).toBeUndefined();
  });

  it("stops before writing when production lacks the import method", async () => {
    importMethod = false;
    await runAttendance([...ARGS, "--yes"], deps());
    expect(process.exitCode).toBe(1);
    expect(created).toEqual([]);
    expect(applied).toBeUndefined();
  });

  it("needs --meeting and --yes without a terminal", async () => {
    await runAttendance(["--file", "s.csv"], deps());
    expect(stderr).toContain("--meeting");
    await runAttendance(ARGS, deps());
    expect(stderr).toContain("--yes");
    expect(applied).toBeUndefined();
  });
});
