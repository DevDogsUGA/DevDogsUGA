import { getAuthoredFiles } from "@devdogsuga/events";
import { describe, expect, it } from "vitest";
import {
  applyEdits,
  applyFields,
  changedFields,
  diffConfig,
  diffItem,
  effectiveEdits,
  findItem,
  type AuthoredConfig,
  type SavedEdit,
} from "./edits";

const official = () => getAuthoredFiles() as unknown as AuthoredConfig;

describe("changedFields", () => {
  it("keeps only the fields that differ", () => {
    const base = findItem(official(), "workshop", "nextjs")!;
    expect(
      changedFields("workshop", base, { ...base, title: "Next.js 16" }),
    ).toEqual({ title: "Next.js 16" });
  });

  it("stores a removed optional field as null", () => {
    const base = { id: "x", title: "X", topics: ["web"] };
    const { topics: _topics, ...without } = base;
    expect(changedFields("workshop", base, without)).toEqual({ topics: null });
  });

  it("stores everything for a new item", () => {
    expect(
      changedFields("workshop", undefined, { id: "x", title: "X" }),
    ).toEqual({
      id: "x",
      title: "X",
    });
  });

  it("is empty when nothing changed", () => {
    const base = findItem(official(), "venue", "dlw")!;
    expect(changedFields("venue", base, structuredClone(base))).toEqual({});
  });
});

describe("applyFields", () => {
  it("removes an unsettable key set to null, so a series can supply it again", () => {
    const base = { slug: "2026-10-05", title: "A", room: "110" };
    expect(applyFields("meeting", base, { room: null })).toEqual({
      slug: "2026-10-05",
      title: "A",
    });
  });

  it("keeps a nullable field as null", () => {
    const base = { slug: "2026-10-05", rsvpUrl: "https://example.com/a" };
    expect(applyFields("meeting", base, { rsvpUrl: null })).toMatchObject({
      rsvpUrl: null,
    });
  });

  it("keeps the official key order and appends new keys in schema order", () => {
    const out = applyFields(
      "meeting",
      { room: "1", startsAt: "a", slug: "s" },
      { title: "T", summary: "S" },
    );
    expect(Object.keys(out)).toEqual([
      "room",
      "startsAt",
      "slug",
      "title",
      "summary",
    ]);
  });
});

describe("applyEdits", () => {
  it("changes the named fields and leaves everything else official", () => {
    const edit: SavedEdit = {
      collection: "meeting",
      key: "2026-09-14",
      isNew: false,
      fields: { room: "200" },
    };
    const { files, orphans } = applyEdits(official(), [edit]);
    expect(orphans).toEqual([]);
    const meetings = files.meetings.meetings;
    expect(findItem(files, "meeting", "2026-09-14")).toMatchObject({
      room: "200",
      title: "Cold Start",
    });
    expect(meetings.length).toBe(official().meetings.meetings.length);
  });

  it("does not change the official object it was given", () => {
    const o = official();
    applyEdits(o, [
      {
        collection: "meeting",
        key: "2026-09-14",
        isNew: false,
        fields: { room: "9" },
      },
    ]);
    expect(findItem(o, "meeting", "2026-09-14")).toMatchObject({ room: "124" });
  });

  it("appends a new item", () => {
    const { files } = applyEdits(official(), [
      {
        collection: "workshop",
        key: "rust",
        isNew: true,
        fields: { title: "Rust", description: null, project: null, elHours: 1 },
      },
    ]);
    expect(findItem(files, "workshop", "rust")).toMatchObject({
      id: "rust",
      title: "Rust",
    });
  });

  it("sets aside an edit to an item the official config no longer has", () => {
    const { orphans } = applyEdits(official(), [
      { collection: "venue", key: "gone", isNew: false, fields: { name: "x" } },
    ]);
    expect(orphans.map((o) => o.reason)).toEqual(["gone"]);
  });

  it("sets aside a new item the official config has since gained", () => {
    const { orphans, files } = applyEdits(official(), [
      {
        collection: "venue",
        key: "dlw",
        isNew: true,
        fields: { name: "Mine" },
      },
    ]);
    expect(orphans.map((o) => o.reason)).toEqual(["exists"]);
    expect(findItem(files, "venue", "dlw")).not.toMatchObject({ name: "Mine" });
  });
});

describe("diffConfig", () => {
  it("is empty for identical configs", () => {
    expect(diffConfig(official(), official())).toEqual([]);
  });

  it("lists each changed field with before and after, with labels", () => {
    const { files } = applyEdits(official(), [
      {
        collection: "meeting",
        key: "2026-09-14",
        isNew: false,
        fields: { room: "200" },
      },
    ]);
    expect(diffConfig(official(), files)).toEqual([
      {
        collection: "meeting",
        key: "2026-09-14",
        kind: "changed",
        fields: [{ field: "room", label: "Room", before: "124", after: "200" }],
      },
    ]);
  });

  it("reports a new item as added, field by field", () => {
    const change = diffItem("workshop", "rust", undefined, {
      id: "rust",
      title: "Rust",
    });
    expect(change).toMatchObject({ kind: "added", key: "rust" });
    expect(change?.fields.map((f) => f.field)).toEqual(["title"]);
  });
});

describe("effectiveEdits", () => {
  it("drops fields that now equal the official value and edits left with nothing", () => {
    const edits: SavedEdit[] = [
      {
        collection: "meeting",
        key: "2026-09-14",
        isNew: false,
        fields: { room: "124", title: "Renamed" },
      },
      {
        collection: "venue",
        key: "dlw",
        isNew: false,
        fields: { kind: "campus" },
      },
      {
        collection: "venue",
        key: "missing",
        isNew: false,
        fields: { name: "x" },
      },
    ];
    expect(effectiveEdits(official(), edits)).toEqual([
      {
        collection: "meeting",
        key: "2026-09-14",
        isNew: false,
        fields: { title: "Renamed" },
      },
    ]);
  });
});
