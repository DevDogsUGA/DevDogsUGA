/**
 * `export` against a fake production and in-memory files: the audit rows are
 * written before any row is read, attributed through the gh login, and a
 * failure partway discards every partial file. Formats, prompts and `--out`
 * decide which files there are.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "../production/meetings.js";
import {
  runExport,
  type ExportDeps,
  type ExportSource,
  type Sink,
} from "./commands.js";
import type { ExportFilters, ExportKind } from "./queries.js";

let stderr: string;
let events: string[];
interface FakeFile {
  path: string;
  text: string;
  discarded: boolean;
  bom: boolean;
  overwrite: boolean;
}
let files: FakeFile[];
let file: FakeFile | undefined;
let officers: string[];
let lastFilters: ExportFilters | undefined;

const ROWS: Record<string, unknown>[] = [
  {
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
  },
];

const SURVEY_ROWS = [
  {
    user_id: "u-1",
    preferred_name: "Ada",
    email: "ada@uga.edu",
    question_id: "how_did_you_learn",
    definition: { bevy: "survey:how_did_you_learn_about_this_event_1" },
    answer: "Social media",
  },
  {
    user_id: "u-1",
    preferred_name: "Ada",
    email: "ada@uga.edu",
    question_id: "google_tools_level",
    definition: {
      bevy: "survey:how_familiar_are_you_with_google_developer_tools",
    },
    answer: "4 - Advanced",
  },
];

/** Whether the export under test is `responses` itself. */
let responsesExport = false;

function source(fail = false): ExportSource {
  return {
    officersFor: async (login) => {
      events.push(`officer:${login}`);
      return officers;
    },
    findMeetings: async (): Promise<Meeting[]> => [
      {
        id: "m-1",
        slug: "2026-09-09",
        title: "Build Session",
        startsAt: new Date("2026-09-09T22:00:00Z"),
        endsAt: new Date("2026-09-10T00:00:00Z"),
        cancelledAt: null,
        hasWorkshop: true,
      },
    ],
    audit: async (userId, kind: ExportKind, filters) => {
      events.push(`audit:${userId}:${kind}:${JSON.stringify(filters)}`);
      return "audit-1";
    },
    rows: async function* (kind, filters) {
      if (kind === "responses" && filters.meetingId && !responsesExport) {
        // The Bevy file's survey read, separate from the export's own.
        events.push("survey");
        yield SURVEY_ROWS;
        return;
      }
      lastFilters = filters;
      events.push("rows");
      yield kind === "responses" ? SURVEY_ROWS : ROWS;
      if (fail) throw Object.assign(new Error("boom"), { code: "57014" });
    },
    finish: async (id, count) => {
      events.push(`finish:${id}:${count}`);
    },
    close: () => Promise.resolve(),
  };
}

function deps(fail = false, overrides: Partial<ExportDeps> = {}): ExportDeps {
  return {
    ghLogin: async () => "sloanfinger",
    source: async () => source(fail),
    interactive: false,
    sink: async (path, overwrite, bom): Promise<Sink> => {
      file = { path, text: "", discarded: false, bom, overwrite };
      files.push(file);
      const f = file;
      return {
        write: async (text) => {
          f.text += text;
        },
        close: () => Promise.resolve(),
        discard: async () => {
          f.discarded = true;
        },
      };
    },
    ...overrides,
  };
}

beforeEach(() => {
  stderr = "";
  events = [];
  file = undefined;
  files = [];
  officers = ["u-officer"];
  lastFilters = undefined;
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

describe("export", () => {
  it("audits before reading, writes the CSV, then records the count", async () => {
    await runExport(
      [
        "attendance",
        "--meeting",
        "2026-09-09",
        "--from",
        "2026-09-01",
        "--to",
        "2026-09-30",
      ],
      deps(),
    );
    expect(process.exitCode).toBeUndefined();
    expect(file?.path).toBe("attendance-2026-09-09-2026-09-01-2026-09-30.csv");
    expect(events).toEqual([
      "officer:sloanfinger",
      'audit:u-officer:attendance:{"from":"2026-09-01T04:00:00.000Z","to":"2026-10-01T04:00:00.000Z","meetingId":"m-1"}',
      "rows",
      "finish:audit-1:1",
    ]);
    expect(lastFilters?.meetingId).toBe("m-1");
    expect(file?.text).toBe(
      "user_id,preferred_name,email,github_login,meeting_slug,meeting_title,meeting_starts_at,checked_in_at,check_in_method,has_workshop\r\n" +
        'u-1,"\t=Ada, the first",ada@uga.edu,,2026-09-09,Build Session,2026-09-09T22:00:00.000Z,2026-09-09T22:05:00.000Z,import,true\r\n',
    );
  });

  it("refuses an export nobody can be named for, before writing anything", async () => {
    officers = [];
    await runExport(["stars"], deps());
    expect(process.exitCode).toBe(1);
    expect(stderr).toContain(
      "No platform account has linked the GitHub login sloanfinger",
    );
    expect(file).toBeUndefined();
    expect(events.some((e) => e.startsWith("audit"))).toBe(false);
  });

  it("discards the partial file when a read fails partway", async () => {
    await runExport(["stars"], deps(true));
    expect(process.exitCode).toBe(1);
    expect(file?.discarded).toBe(true);
    expect(events).not.toContain("finish:audit-1:1");
  });

  it("takes --meeting only for attendance and responses", async () => {
    await runExport(["stars", "--meeting", "2026-09-09"], deps());
    expect(stderr).toContain(
      "--meeting only applies to the attendance and responses exports",
    );
  });

  it("dry-runs without auditing", async () => {
    await runExport(["reflections", "--dry-run"], deps());
    expect(stderr).toContain(
      "Would export reflections to reflections.csv, audited as sloanfinger.",
    );
    expect(events).toEqual(["officer:sloanfinger"]);
  });

  it("writes several formats from one read, each audited with its format", async () => {
    // The same person checked in twice still makes one Bevy row and one email.
    ROWS.push({ ...ROWS[0], checked_in_at: new Date("2026-09-09T23:00:00Z") });
    try {
      await runExport(
        [
          "attendance",
          "--meeting",
          "2026-09-09",
          "--format",
          "platform,bevy",
          "--format",
          "involvement",
        ],
        deps(),
      );
    } finally {
      ROWS.pop();
    }
    expect(process.exitCode).toBeUndefined();
    expect(files.map((f) => [f.path, f.bom])).toEqual([
      ["attendance-2026-09-09.csv", true],
      ["attendance-2026-09-09-bevy.csv", false],
      ["attendance-2026-09-09-involvement.txt", false],
    ]);
    expect(events.filter((e) => e.startsWith("audit"))).toEqual([
      'audit:u-officer:attendance:{"meetingId":"m-1"}',
      'audit:u-officer:attendance:{"meetingId":"m-1","format":"bevy"}',
      'audit:u-officer:attendance:{"meetingId":"m-1","format":"involvement"}',
    ]);
    expect(events.filter((e) => e === "rows")).toHaveLength(1);
    expect(events.filter((e) => e === "survey")).toHaveLength(1);
    expect(files[1]!.text).toBe(
      "first_name,last_name,email,checked_in,job_title,company,ticket_title,ticket_venue,survey:how_did_you_learn_about_this_event_1,survey:how_familiar_are_you_with_google_developer_tools\r\n" +
        "Ada,Lovelace,ada@uga.edu,TRUE,,,,,Social media,4 - Advanced\r\n",
    );
    expect(files[2]!.text).toBe("ada@uga.edu\r\n");
    expect(events).toContain("finish:audit-1:2");
    expect(events).toContain("finish:audit-1:1");
    expect(stderr).toContain("Wrote 1 person as Bevy attendee import");
  });

  it("exports one meeting's responses long and wide", async () => {
    responsesExport = true;
    try {
      await runExport(
        ["responses", "--meeting", "2026-09-09", "--format", "platform,wide"],
        deps(),
      );
    } finally {
      responsesExport = false;
    }
    expect(process.exitCode).toBeUndefined();
    expect(files.map((f) => f.path)).toEqual([
      "responses-2026-09-09.csv",
      "responses-2026-09-09-wide.csv",
    ]);
    expect(files[1]!.text).toBe(
      "user_id,preferred_name,email,how_did_you_learn,google_tools_level\r\n" +
        "u-1,Ada,ada@uga.edu,Social media,4 - Advanced\r\n",
    );
    expect(stderr).toContain("Wrote 1 person as Wide table");
  });

  it("needs --meeting for a per-event format without a terminal", async () => {
    await runExport(["attendance", "--format", "involvement"], deps());
    expect(process.exitCode).toBe(1);
    expect(stderr).toContain(
      "The Involvement Network list file is for one meeting; name it with --meeting.",
    );
    expect(files).toEqual([]);
  });

  it("asks for formats, the meeting and each destination at a terminal", async () => {
    const asked: string[] = [];
    await runExport(
      ["attendance"],
      deps(false, {
        interactive: true,
        pickFormats: async () => ["bevy", "involvement"],
        askMeeting: async () => "2026-09-09",
        askPath: async (message, suggested) => {
          asked.push(`${message} [${suggested}]`);
          return `/tmp/out/${suggested}`;
        },
      }),
    );
    expect(process.exitCode).toBeUndefined();
    expect(asked).toEqual([
      "Save the Bevy attendee import to [attendance-2026-09-09-bevy.csv]",
      "Save the Involvement Network list to [attendance-2026-09-09-involvement.txt]",
    ]);
    // The prompt confirmed any replacement itself.
    expect(files.map((f) => [f.path, f.overwrite])).toEqual([
      ["/tmp/out/attendance-2026-09-09-bevy.csv", true],
      ["/tmp/out/attendance-2026-09-09-involvement.txt", true],
    ]);
  });

  it("asks where to save the other exports too, without asking for a format", async () => {
    const asked: string[] = [];
    await runExport(
      ["stars"],
      deps(false, {
        interactive: true,
        pickFormats: async () => {
          throw new Error("stars has one format");
        },
        askPath: async (_message, suggested) => {
          asked.push(suggested);
          return suggested;
        },
      }),
    );
    expect(asked).toEqual(["stars.csv"]);
  });

  it("puts several files in an --out folder, and refuses one file name for several", async () => {
    await runExport(
      [
        "attendance",
        "--meeting",
        "2026-09-09",
        "--format",
        "bevy,involvement",
        "--out",
        "/tmp",
      ],
      deps(),
    );
    expect(files.map((f) => f.path)).toEqual([
      "/tmp/attendance-2026-09-09-bevy.csv",
      "/tmp/attendance-2026-09-09-involvement.txt",
    ]);
    files = [];
    await runExport(
      [
        "attendance",
        "--meeting",
        "2026-09-09",
        "--format",
        "bevy,involvement",
        "--out",
        "x.csv",
      ],
      deps(),
    );
    expect(stderr).toContain("for several formats, give it a folder");
    expect(files).toEqual([]);
  });

  it("refuses an unknown format, and a format an export lacks", async () => {
    await runExport(["attendance", "--format", "excel"], deps());
    expect(stderr).toContain('Unknown format "excel"');
    await runExport(["stars", "--format", "bevy"], deps());
    expect(stderr).toContain("The stars export has one format");
  });

  it("discards every partial file when a read fails partway", async () => {
    await runExport(
      ["attendance", "--meeting", "2026-09-09", "--format", "platform,bevy"],
      deps(true),
    );
    expect(files.map((f) => f.discarded)).toEqual([true, true]);
  });
});
