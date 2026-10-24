// @vitest-environment node
import type { AccountRow } from "@devdogsuga/events/imports";
import { describe, expect, it } from "vitest";
import { confirmImport, previewImport } from "./run";
import type {
  AttendanceWrite,
  AuditDraft,
  ImportDeps,
  ImportMeeting,
  ImportRequest,
  RosterWrite,
} from "./types";

const OFFICER = "00000000-0000-4000-8000-0000000000aa";
const MEETING: ImportMeeting = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Build Session",
  startsAt: new Date("2026-10-05T22:00:00Z"),
  cancelledAt: null,
  deletedAt: null,
};

function account(
  userId: string,
  email: string,
  fields: Partial<AccountRow> = {},
): AccountRow {
  return {
    userId,
    authEmail: email,
    ugaEmail: null,
    hasProfile: true,
    preferredName: null,
    involvementFirstName: null,
    involvementLastName: null,
    ...fields,
  };
}

interface Fake {
  deps: ImportDeps;
  attendance: { write: AttendanceWrite; audit: AuditDraft }[];
  roster: { write: RosterWrite; audit: AuditDraft }[];
  audits: AuditDraft[];
  created: string[];
}

function fake(
  options: {
    accounts?: AccountRow[];
    checkIns?: { userId: string | null; method: string }[];
    meeting?: ImportMeeting | null;
    failCreate?: string[];
    now?: Date;
  } = {},
): Fake {
  const out: Fake = {
    attendance: [],
    roster: [],
    audits: [],
    created: [],
    deps: undefined as never,
  };
  let next = 0;
  out.deps = {
    accounts: async () => options.accounts ?? [],
    meeting: async () =>
      options.meeting === undefined ? MEETING : options.meeting,
    checkIns: async () => options.checkIns ?? [],
    createAccount: async (email) => {
      if (options.failCreate?.includes(email)) throw new Error("rate limited");
      out.created.push(email);
      next += 1;
      return `00000000-0000-4000-8000-0000000001${String(next).padStart(2, "0")}`;
    },
    writeAttendance: async (write, audit) => {
      out.attendance.push({ write, audit });
      return {
        status: "written",
        recorded: write.userIds.length,
        removed: 0,
      };
    },
    writeRoster: async (write, audit) => {
      out.roster.push({ write, audit });
      return { written: write.members.length, cleared: 0 };
    },
    audit: async (audit) => {
      out.audits.push(audit);
    },
    now: () => options.now ?? new Date("2026-10-06T12:00:00Z"),
  };
  return out;
}

function attendance(
  text: string,
  extra: Partial<ImportRequest> = {},
): ImportRequest {
  return {
    kind: "attendance",
    mode: "add",
    fileName: "sheet.csv",
    text,
    mapping: {},
    meetingId: MEETING.id,
    ...extra,
  };
}

function roster(
  text: string,
  extra: Partial<ImportRequest> = {},
): ImportRequest {
  return {
    kind: "roster",
    mode: "add",
    fileName: "roster.csv",
    text,
    mapping: {},
    meetingId: null,
    ...extra,
  };
}

const SHEET = [
  "Timestamp,Email Address,Full name",
  "10/5/2026 18:05,ab12345@uga.edu,Ada Lovelace",
  "10/5/2026 18:06,cd67890@uga.edu,Alan Turing",
  "10/5/2026 18:07,someone@gmail.com,Not Uga",
].join("\n");

const ROSTER = [
  "First Name,Last Name,Campus Email,Organization Name,Position Name",
  "Ada,Lovelace,ab12345@uga.edu,DevDogs,Member",
  "Alan,Turing,cd67890@uga.edu,DevDogs,Member",
  "Grace,Hopper,gh11111@example.com,DevDogs,Member",
].join("\n");

async function previewOf(req: ImportRequest, f: Fake) {
  const res = await previewImport(req, f.deps);
  if (res.kind !== "preview")
    throw new Error(`expected a preview: ${JSON.stringify(res)}`);
  return res.preview;
}

describe("attendance preview", () => {
  it("writes nothing and says who is recorded, created and invalid", async () => {
    const f = fake({ accounts: [account("u1", "ab12345@uga.edu")] });
    const preview = await previewOf(attendance(SHEET), f);

    expect(f.attendance).toEqual([]);
    expect(f.created).toEqual([]);
    expect(f.audits).toEqual([]);
    expect(
      preview.summary.find((s) => s.label.startsWith("To record"))?.count,
    ).toBe(1);
    expect(
      preview.summary.find((s) => s.label.startsWith("Accounts to create"))
        ?.count,
    ).toBe(1);
    expect(preview.invalid).toEqual([
      {
        line: 4,
        value: "someone@gmail.com",
        reason: "Not a UGA (@uga.edu) address",
      },
    ]);
    expect(preview.mapping).toEqual({
      email: "Email Address",
      name: "Full name",
    });
    expect(preview.headers).toEqual([
      "Timestamp",
      "Email Address",
      "Full name",
    ]);
    expect(preview.blocked).toBeNull();
  });

  it("re-reads with the columns the officer picks", async () => {
    const text = "Email,Alt email,Name\nab12345@uga.edu,zz99999@uga.edu,Ada\n";
    const f = fake();
    const auto = await previewOf(attendance(text), f);
    expect(auto.mapping.email).toBe("Email");

    const picked = await previewOf(
      attendance(text, { mapping: { email: "Alt email", name: "" } }),
      f,
    );
    expect(picked.mapping.email).toBe("Alt email");
    expect(picked.mapping.name).toBeNull();
    // Without a name column there is nothing to create the account with.
    expect(picked.invalid[0]?.reason).toMatch(/no name/);
    expect(picked.fingerprint).not.toBe(auto.fingerprint);
  });

  it("offers the column picker when no column holds addresses", async () => {
    const res = await previewImport(
      attendance("Name,Notes\nAda,hi\n"),
      fake().deps,
    );
    expect(res.kind).toBe("needs-mapping");
    if (res.kind === "needs-mapping") {
      expect(res.headers).toEqual(["Name", "Notes"]);
    }
  });

  it("refuses a meeting that has not started or was cancelled", async () => {
    const early = await previewImport(
      attendance(SHEET),
      fake({ now: new Date("2026-10-01T00:00:00Z") }).deps,
    );
    expect(early).toMatchObject({ kind: "error" });
    const off = await previewImport(
      attendance(SHEET),
      fake({ meeting: { ...MEETING, cancelledAt: new Date() } }).deps,
    );
    expect(off).toMatchObject({ kind: "error" });
    expect(JSON.stringify(off)).toMatch(/cancelled/);
  });

  it("takes sheet-name-label mappings that are not headers as 'detect'", async () => {
    const f = fake();
    const text = "First Name,Last Name,Email\nAda,Lovelace,ab12345@uga.edu\n";
    const first = await previewOf(attendance(text), f);
    expect(first.mapping.name).toBe("First Name + Last Name");
    const again = await previewOf(
      attendance(text, {
        mapping: Object.fromEntries(
          Object.entries(first.mapping).map(([k, v]) => [k, v ?? ""]),
        ),
      }),
      f,
    );
    expect(again.fingerprint).toBe(first.fingerprint);
  });
});

describe("attendance confirm", () => {
  it("add mode: creates accounts, records everyone, audits once, skips invalid rows", async () => {
    const f = fake({ accounts: [account("u1", "ab12345@uga.edu")] });
    const req = attendance(SHEET);
    const preview = await previewOf(req, f);
    const res = await confirmImport(
      req,
      { fingerprint: preview.fingerprint, skipInvalid: true },
      OFFICER,
      f.deps,
    );

    expect(res.kind).toBe("result");
    expect(f.created).toEqual(["cd67890@uga.edu"]);
    expect(f.attendance).toHaveLength(1);
    const { write, audit } = f.attendance[0]!;
    expect(write.replace).toBe(false);
    expect(write.userIds).toHaveLength(2);
    expect(write.recordedAt).toEqual(MEETING.startsAt);
    expect(write.profiles.map((p) => p.email)).toEqual(["cd67890@uga.edu"]);
    expect(audit).toMatchObject({
      actorUserId: OFFICER,
      action: "import.attendance",
      metadata: {
        mode: "add",
        meetingId: MEETING.id,
        invalidRows: 1,
        accountsCreated: 1,
      },
    });
    if (res.kind === "result") expect(res.result.status).toBe("partial");
  });

  it("requires the skipped-rows acknowledgement when rows are invalid", async () => {
    const f = fake();
    const req = attendance(SHEET);
    const preview = await previewOf(req, f);
    const res = await confirmImport(
      req,
      { fingerprint: preview.fingerprint, skipInvalid: false },
      OFFICER,
      f.deps,
    );
    expect(res).toMatchObject({ kind: "error" });
    expect(f.attendance).toEqual([]);
    expect(f.created).toEqual([]);
  });

  it("refreshes the preview instead of writing when the data changed", async () => {
    const req = attendance(SHEET);
    const before = fake({ accounts: [] });
    const preview = await previewOf(req, before);

    // Between preview and confirm, one of the people made an account.
    const after = fake({ accounts: [account("u1", "ab12345@uga.edu")] });
    const res = await confirmImport(
      req,
      { fingerprint: preview.fingerprint, skipInvalid: true },
      OFFICER,
      after.deps,
    );
    expect(res.kind).toBe("preview");
    if (res.kind === "preview") {
      expect(res.notice).toMatch(/changed/);
      expect(res.preview.fingerprint).not.toBe(preview.fingerprint);
    }
    expect(after.attendance).toEqual([]);
    expect(after.created).toEqual([]);
  });

  it("add mode carries on past a failed account and reports it", async () => {
    const f = fake({
      accounts: [account("u1", "ab12345@uga.edu")],
      failCreate: ["cd67890@uga.edu"],
    });
    const req = attendance(SHEET);
    const preview = await previewOf(req, f);
    const res = await confirmImport(
      req,
      { fingerprint: preview.fingerprint, skipInvalid: true },
      OFFICER,
      f.deps,
    );
    expect(f.attendance).toHaveLength(1);
    expect(f.attendance[0]!.write.userIds).toEqual(["u1"]);
    expect(f.attendance[0]!.audit.metadata).toMatchObject({
      outcome: "partial",
      accountFailures: 1,
    });
    expect(res).toMatchObject({
      kind: "result",
      result: {
        status: "partial",
        failures: [{ email: "cd67890@uga.edu", reason: "rate limited" }],
      },
    });
  });

  it("replace mode stops before removing anything when an account fails", async () => {
    const f = fake({
      accounts: [
        account("u1", "ab12345@uga.edu"),
        account("u9", "old@uga.edu"),
      ],
      checkIns: [{ userId: "u9", method: "import" }],
      failCreate: ["cd67890@uga.edu"],
    });
    const req = attendance(SHEET, { mode: "replace" });
    const preview = await previewOf(req, f);
    expect(
      preview.summary.some((s) => s.tone === "remove" && s.count === 1),
    ).toBe(true);
    const res = await confirmImport(
      req,
      { fingerprint: preview.fingerprint, skipInvalid: true },
      OFFICER,
      f.deps,
    );
    expect(f.attendance).toEqual([]);
    expect(f.audits).toHaveLength(1);
    expect(f.audits[0]!.metadata).toMatchObject({
      outcome: "stopped",
      mode: "replace",
    });
    expect(res).toMatchObject({
      kind: "result",
      result: { status: "stopped" },
    });
  });

  it("replace mode passes the whole file to the write and leaves self check-ins to it", async () => {
    const f = fake({
      accounts: [
        account("u1", "ab12345@uga.edu"),
        account("u2", "cd67890@uga.edu"),
      ],
      checkIns: [{ userId: "u1", method: "qr" }],
    });
    const req = attendance(SHEET, { mode: "replace" });
    const preview = await previewOf(req, f);
    await confirmImport(
      req,
      { fingerprint: preview.fingerprint, skipInvalid: true },
      OFFICER,
      f.deps,
    );
    const { write } = f.attendance[0]!;
    expect(write.replace).toBe(true);
    // u1 checked in themselves: still in the keep-list, so the removal spares them.
    expect(write.userIds.sort()).toEqual(["u1", "u2"]);
  });

  it("recovers a profile-less account from an interrupted run", async () => {
    const f = fake({
      accounts: [account("u1", "ab12345@uga.edu", { hasProfile: false })],
    });
    const req = attendance("Email,Name\nab12345@uga.edu,Ada\n");
    const preview = await previewOf(req, f);
    await confirmImport(
      req,
      { fingerprint: preview.fingerprint, skipInvalid: false },
      OFFICER,
      f.deps,
    );
    expect(f.created).toEqual([]);
    expect(f.attendance[0]!.write.profiles).toEqual([
      { userId: "u1", email: "ab12345@uga.edu", name: "Ada" },
    ]);
  });
});

describe("roster", () => {
  it("previews add mode without a drop line, and flags the non-UGA row", async () => {
    const f = fake({
      accounts: [
        account("u1", "ab12345@uga.edu"),
        account("u9", "gone@uga.edu", {
          involvementFirstName: "Old",
          involvementLastName: "Member",
        }),
      ],
    });
    const preview = await previewOf(roster(ROSTER), f);
    expect(preview.summary.some((s) => s.tone === "remove")).toBe(false);
    expect(preview.invalid).toEqual([
      {
        line: 4,
        value: "gh11111@example.com",
        reason: "Not a UGA (@uga.edu) address",
      },
    ]);
    expect(preview.blocked).toBeNull();
  });

  it("snapshot mode is blocked while rows are invalid", async () => {
    const f = fake();
    const preview = await previewOf(roster(ROSTER, { mode: "replace" }), f);
    expect(preview.blocked).toMatch(/Snapshot mode cannot run/);
    const res = await confirmImport(
      roster(ROSTER, { mode: "replace" }),
      { fingerprint: preview.fingerprint, skipInvalid: true },
      OFFICER,
      f.deps,
    );
    expect(res).toMatchObject({ kind: "error" });
    expect(f.roster).toEqual([]);
  });

  it("snapshot mode drops absent members when the file is clean", async () => {
    const clean = ROSTER.split("\n").slice(0, 3).join("\n");
    const f = fake({
      accounts: [
        account("u9", "gone@uga.edu", {
          involvementFirstName: "Old",
          involvementLastName: "Member",
        }),
      ],
    });
    const req = roster(clean, { mode: "replace" });
    const preview = await previewOf(req, f);
    expect(preview.summary.find((s) => s.tone === "remove")?.count).toBe(1);
    const res = await confirmImport(
      req,
      { fingerprint: preview.fingerprint, skipInvalid: false },
      OFFICER,
      f.deps,
    );
    expect(res.kind).toBe("result");
    expect(f.created.sort()).toEqual(["ab12345@uga.edu", "cd67890@uga.edu"]);
    expect(f.roster[0]!.write.snapshot).toBe(true);
    expect(f.roster[0]!.audit.action).toBe("import.roster");
  });

  it("snapshot mode stops before unverifying anyone when an account fails", async () => {
    const clean = ROSTER.split("\n").slice(0, 3).join("\n");
    const f = fake({
      accounts: [
        account("u9", "gone@uga.edu", {
          involvementFirstName: "Old",
          involvementLastName: "Member",
        }),
      ],
      failCreate: ["cd67890@uga.edu"],
    });
    const req = roster(clean, { mode: "replace" });
    const preview = await previewOf(req, f);
    const res = await confirmImport(
      req,
      { fingerprint: preview.fingerprint, skipInvalid: false },
      OFFICER,
      f.deps,
    );
    expect(f.roster).toEqual([]);
    expect(f.audits[0]!.metadata).toMatchObject({ outcome: "stopped" });
    expect(res).toMatchObject({
      kind: "result",
      result: { status: "stopped" },
    });
  });

  it("add mode carries on and reports the failed account", async () => {
    const f = fake({ failCreate: ["cd67890@uga.edu"] });
    const req = roster(ROSTER);
    const preview = await previewOf(req, f);
    const res = await confirmImport(
      req,
      { fingerprint: preview.fingerprint, skipInvalid: true },
      OFFICER,
      f.deps,
    );
    expect(f.roster[0]!.write.members.map((m) => m.email)).toEqual([
      "ab12345@uga.edu",
    ]);
    expect(res).toMatchObject({
      kind: "result",
      result: { status: "partial" },
    });
  });

  it("offers a column picker when the header is not recognized, then accepts the picks", async () => {
    const text = "A,B,C\nAda,Lovelace,ab12345@uga.edu\n";
    const f = fake();
    const first = await previewImport(roster(text), f.deps);
    expect(first).toMatchObject({
      kind: "needs-mapping",
      headers: ["A", "B", "C"],
    });
    const picked = await previewImport(
      roster(text, { mapping: { firstName: "A", lastName: "B", email: "C" } }),
      f.deps,
    );
    expect(picked.kind).toBe("preview");
  });

  it("rejects a roster for another organization", async () => {
    const text =
      "First Name,Last Name,Campus Email,Organization Name\nAda,Lovelace,ab12345@uga.edu,Other Club\n";
    const res = await previewImport(roster(text), fake().deps);
    expect(res.kind).toBe("error");
    expect(JSON.stringify(res)).toMatch(/not DevDogs/);
  });

  it("rejects an oversized row count", async () => {
    const rows = "x\n".repeat(20_001);
    const res = await previewImport(roster(rows), fake().deps);
    expect(res.kind).toBe("error");
    expect(JSON.stringify(res)).toMatch(/more than/);
  });
});
