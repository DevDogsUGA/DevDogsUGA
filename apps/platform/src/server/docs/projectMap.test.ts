// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  entryFor,
  mapErrors,
  parseProjectMap,
  sameEntry,
  serializeProjectMap,
  withProject,
  withoutProject,
  type MapEntry,
  type ProjectMap,
} from "./projectMap";

/** The workflow's own validation, loaded by file URL so tsc never resolves it. */
const SCRIPT = new URL(
  "../../../../../.github/scripts/docs-projects.mjs",
  import.meta.url,
);
const { validateMap: workflowValidate } = (await import(
  /* @vite-ignore */ SCRIPT.href
)) as { validateMap: (data: unknown) => string[] };

const entry: MapEntry = {
  githubRepoId: "123456789",
  ownerId: "987654321",
  ownerLogin: "DevDogsUGA",
};
const empty: ProjectMap = { comment: "notes", projects: {} };

describe("the committed map", () => {
  it("parses, and both validators accept it", () => {
    const text = readFileSync(
      new URL("../../../../../.github/docs-projects.json", import.meta.url),
      "utf-8",
    );
    expect(parseProjectMap(text).ok).toBe(true);
    expect(workflowValidate(JSON.parse(text))).toEqual([]);
  });

  it("is byte-for-byte what the platform would write for it", () => {
    const text = readFileSync(
      new URL("../../../../../.github/docs-projects.json", import.meta.url),
      "utf-8",
    );
    const parsed = parseProjectMap(text);
    expect(parsed.ok && serializeProjectMap(parsed.map)).toBe(text);
  });
});

describe("parseProjectMap", () => {
  it("reads entries, the comment and nothing else", () => {
    const parsed = parseProjectMap(
      JSON.stringify({
        $comment: "hi",
        version: 2,
        projects: { example: entry },
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      map: { comment: "hi", projects: { example: entry } },
    });
  });

  it("refuses what the workflow refuses", () => {
    const bad: unknown[] = [
      "not json {",
      { version: 1, projects: [] },
      { version: 2, projects: [] },
      { version: 2, projects: { Bad: entry } },
      { version: 2, projects: { platform: entry } },
      { version: 2, projects: { example: { ...entry, githubRepoId: "0" } } },
      { version: 2, projects: { example: { ...entry, ownerLogin: "a b" } } },
      { version: 2, projects: { example: { ...entry, branch: "main" } } },
      { version: 2, projects: { example: { ...entry, directory: "docs" } } },
      { version: 2, projects: { example: entry, other: entry } },
      { version: 2, projects: { example: 5 } },
      { version: 2, projects: {}, extra: 1 },
    ];
    for (const value of bad) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      const platform = parseProjectMap(text);
      expect(platform.ok, text).toBe(false);
      if (typeof value !== "string") {
        // The platform and the workflow agree on what is wrong.
        expect(workflowValidate(value).length, text).toBeGreaterThan(0);
        expect(mapErrors(value)).toEqual(workflowValidate(value));
      }
    }
  });
});

describe("editing and serializing", () => {
  it("adds, replaces and removes entries without touching the rest", () => {
    const other: MapEntry = {
      githubRepoId: "2",
      ownerId: "3",
      ownerLogin: "me",
    };
    let map = withProject(empty, "zeta", entry);
    map = withProject(map, "alpha", other);
    expect(Object.keys(map.projects)).toEqual(["zeta", "alpha"]);
    expect(entryFor(map, "alpha")).toEqual(other);
    expect(entryFor(map, "constructor")).toBeNull();
    map = withProject(map, "zeta", { ...entry, ownerLogin: "New" });
    expect(entryFor(map, "zeta")?.ownerLogin).toBe("New");
    map = withoutProject(map, "zeta");
    expect(Object.keys(map.projects)).toEqual(["alpha"]);
    expect(withoutProject(map, "nope")).toEqual(map);
  });

  it("serializes sorted by slug, formatted for prettier, ending in a newline", () => {
    const map = withProject(withProject(empty, "zeta", entry), "alpha", {
      ...entry,
      githubRepoId: "5",
    });
    const text = serializeProjectMap(map);
    expect(text).toBe(
      [
        "{",
        '  "$comment": "notes",',
        '  "version": 2,',
        '  "projects": {',
        '    "alpha": {',
        '      "githubRepoId": "5",',
        '      "ownerId": "987654321",',
        '      "ownerLogin": "DevDogsUGA"',
        "    },",
        '    "zeta": {',
        '      "githubRepoId": "123456789",',
        '      "ownerId": "987654321",',
        '      "ownerLogin": "DevDogsUGA"',
        "    }",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    expect(serializeProjectMap(empty)).toContain('"projects": {}');
  });

  it("round-trips, and what it writes the workflow accepts", () => {
    const map = withProject(empty, "example", entry);
    const text = serializeProjectMap(map);
    expect(parseProjectMap(text)).toEqual({ ok: true, map });
    expect(workflowValidate(JSON.parse(text))).toEqual([]);
  });

  it("omits the comment when the file had none", () => {
    expect(
      serializeProjectMap({ comment: undefined, projects: {} }),
    ).not.toContain("$comment");
  });

  it("compares entries by repository and owner, ignoring a login's case", () => {
    expect(sameEntry(entry, { ...entry, ownerLogin: "devdogsuga" })).toBe(true);
    expect(sameEntry(entry, { ...entry, ownerId: "1" })).toBe(false);
    expect(sameEntry(entry, { ...entry, githubRepoId: "1" })).toBe(false);
  });
});
