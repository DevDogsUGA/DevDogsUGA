// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { ExportDeps } from "./types";
import { prepareExport } from "./run";

const MEETING = "6f0c1b0e-0000-4000-8000-000000000001";

const row = (id: string, name: string, email: string, uga = "") => ({
  user_id: id,
  preferred_name: name,
  email,
  github_login: null,
  meeting_slug: "2026-09-09",
  meeting_title: "Build Session",
  meeting_starts_at: new Date("2026-09-09T22:00:00Z"),
  checked_in_at: new Date("2026-09-09T22:05:00Z"),
  check_in_method: "import",
  has_workshop: false,
  uga_email: uga,
  first_name: name,
  last_name: "",
});

function fake(over: Partial<ExportDeps> = {}) {
  const events: string[] = [];
  const audits: { userId: string; kind: string; filters: unknown }[] = [];
  const finished: [string, number][] = [];
  const deps: ExportDeps = {
    audit: async (userId, kind, filters) => {
      events.push(`audit:${filters.format ?? "platform"}`);
      audits.push({ userId, kind, filters });
      return `a${audits.length}`;
    },
    rows: async (kind) => {
      events.push(`read:${kind}`);
      return kind === "responses"
        ? []
        : [
            row("u-1", "Ada", "ada@uga.edu", "ada@uga.edu"),
            row("u-2", "Grace", "grace@gmail.com"),
          ];
    },
    finish: async (id, n) => {
      finished.push([id, n]);
    },
    meetingSlug: async () => {
      events.push("meeting");
      return "2026-09-09";
    },
    ...over,
  };
  return { deps, events, audits, finished };
}

const base = {
  kind: "attendance",
  formats: ["platform"],
  from: null,
  to: null,
  meetingId: null,
  zip: false,
};

describe("prepareExport", () => {
  it("writes every audit row before any data is read, Bevy survey answers included", async () => {
    const { deps, events, audits } = fake();
    const res = await prepareExport(
      { ...base, formats: ["platform", "bevy"], meetingId: MEETING },
      "officer-1",
      deps,
    );
    expect(res.kind).toBe("ready");
    const firstRead = events.findIndex(
      (e) => e.startsWith("read:") || e === "meeting",
    );
    expect(events.slice(0, firstRead)).toEqual([
      "audit:platform",
      "audit:bevy",
    ]);
    expect(events).toContain("read:responses");
    expect(audits.every((a) => a.userId === "officer-1")).toBe(true);
    expect(audits[1]!.filters).toEqual({ meetingId: MEETING, format: "bevy" });
  });

  it("reads nothing when the audit row cannot be written", async () => {
    const { deps, events } = fake({
      audit: async () => {
        events.push("audit:failed");
        throw new Error("db down");
      },
    });
    const res = await prepareExport(base, "officer-1", deps);
    expect(res.kind).toBe("error");
    expect(JSON.stringify(res)).toContain("nothing was read");
    expect(events).toEqual(["audit:failed"]);
  });

  it("stops before the second file's read if its audit row fails", async () => {
    let n = 0;
    const { deps, events } = fake({
      audit: async () => {
        if (++n === 2) throw new Error("db down");
        return "a1";
      },
    });
    const res = await prepareExport(
      { ...base, formats: ["platform", "involvement"], meetingId: MEETING },
      "officer-1",
      deps,
    );
    expect(res.kind).toBe("error");
    expect(events).toEqual([]);
  });

  it("counts rows, records them on the audit rows and reports who was left out", async () => {
    const { deps, finished } = fake();
    const res = await prepareExport(
      { ...base, formats: ["platform", "involvement"], meetingId: MEETING },
      "officer-1",
      deps,
    );
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(res.files.map((f) => [f.name, f.count])).toEqual([
      ["attendance-2026-09-09.csv", 2],
      ["attendance-2026-09-09-involvement.txt", 1],
    ]);
    expect(finished).toEqual([
      ["a1", 2],
      ["a2", 1],
    ]);
    expect(res.leftOutTotal).toBe(1);
    expect(res.leftOut[0]).toMatchObject({
      file: "Involvement Network list",
      name: "Grace",
      outcome: "not in file",
    });
    expect(res.report?.name).toBe("attendance-left-out.csv");
    expect(res.report?.text).toContain("Grace");
    expect(res.files[0]!.text?.startsWith("﻿")).toBe(true);
  });

  it("reports nobody left out when every row fits", async () => {
    const { deps } = fake();
    const res = await prepareExport(base, "officer-1", deps);
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(res.leftOutTotal).toBe(0);
    expect(res.report).toBeNull();
  });

  it("bundles the files and the report into one ZIP", async () => {
    const { deps } = fake();
    const res = await prepareExport(
      {
        ...base,
        formats: ["platform", "involvement"],
        meetingId: MEETING,
        zip: true,
      },
      "officer-1",
      deps,
    );
    if (res.kind !== "ready" || !res.zip) throw new Error("expected a zip");
    expect(res.zip.name).toBe("attendance-2026-09-09.zip");
    // The text travels once, inside the archive.
    expect(res.files.every((f) => f.text === null)).toBe(true);
    const archive = await JSZip.loadAsync(res.zip.base64, { base64: true });
    expect(Object.keys(archive.files).sort()).toEqual([
      "attendance-2026-09-09-involvement.txt",
      "attendance-2026-09-09.csv",
      "attendance-left-out.csv",
    ]);
    expect(
      await archive
        .file("attendance-2026-09-09-involvement.txt")!
        .async("string"),
    ).toBe("ada@uga.edu\r\n");
    const csv = await archive
      .file("attendance-2026-09-09.csv")!
      .async("string");
    expect(csv).toContain("Grace");
  });

  it("neutralises formulas in the CSV cells", async () => {
    const { deps } = fake({
      rows: async () => [
        row("u-1", "=cmd|'/c calc'!A1", "x@uga.edu", "x@uga.edu"),
      ],
    });
    const res = await prepareExport(base, "officer-1", deps);
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(res.files[0]!.text).toContain("\t=cmd");
    expect(res.files[0]!.text).not.toMatch(/,=cmd/);
  });

  it.each([
    ["stars are not exported here", { ...base, kind: "stars" }],
    ["an unknown format", { ...base, formats: ["xlsx"] }],
    ["a per-meeting format without a meeting", { ...base, formats: ["bevy"] }],
    [
      "a meeting on reflections",
      { ...base, kind: "reflections", meetingId: MEETING },
    ],
    ["an inverted range", { ...base, from: "2026-10-02", to: "2026-10-01" }],
    ["a bad date", { ...base, from: "tomorrow" }],
    ["no format", { ...base, formats: [] }],
  ])("refuses %s before auditing", async (_name, input) => {
    const { deps, events } = fake();
    const res = await prepareExport(input, "officer-1", deps);
    expect(res.kind).toBe("error");
    expect(events).toEqual([]);
  });

  it("passes Eastern-day bounds, the last day inclusive", async () => {
    const seen: unknown[] = [];
    const { deps } = fake({
      rows: async (_kind, filters) => {
        seen.push(filters);
        return [];
      },
    });
    await prepareExport(
      { ...base, from: "2026-09-09", to: "2026-09-09" },
      "officer-1",
      deps,
    );
    expect(seen[0]).toMatchObject({
      from: new Date("2026-09-09T04:00:00Z"),
      to: new Date("2026-09-10T04:00:00Z"),
    });
  });

  it("says so when the meeting does not exist, after auditing", async () => {
    const { deps, events } = fake({ meetingSlug: async () => null });
    const res = await prepareExport(
      { ...base, formats: ["involvement"], meetingId: MEETING },
      "officer-1",
      deps,
    );
    expect(res).toEqual({
      kind: "error",
      message: "That meeting was not found.",
    });
    expect(events).toEqual(["audit:involvement"]);
  });

  it("reports a failed read without leaking the cause", async () => {
    const { deps } = fake({
      rows: async () => {
        throw new Error("connection refused 10.0.0.5");
      },
    });
    const res = await prepareExport(base, "officer-1", deps);
    expect(res.kind).toBe("error");
    expect(JSON.stringify(res)).not.toContain("10.0.0.5");
  });

  it("passes a too-many-rows refusal through", async () => {
    const { deps } = fake({
      rows: async () => {
        throw new RangeError("That is more than 100,000 rows.");
      },
    });
    const res = await prepareExport(base, "officer-1", deps);
    expect(res).toEqual({
      kind: "error",
      message: "That is more than 100,000 rows.",
    });
  });
});
