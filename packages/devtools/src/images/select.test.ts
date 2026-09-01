import { describe, expect, it } from "vitest";
import { staticGraphics, assertUniqueStems, type Graphic } from "./graphics.js";
import {
  commaList,
  formatsFor,
  matchGraphics,
  normalizeArgv,
  pair,
} from "./select.js";
import {
  namesEvents,
  wantsEvents,
  expandHome,
  parseImagesArgs,
} from "./commands.js";

const registry = staticGraphics();

describe("graphic patterns", () => {
  it("matches an exact name", () => {
    expect(
      matchGraphics(["page/home"], registry).matched.map((g) => g.name),
    ).toEqual(["page/home"]);
  });

  it("matches a whole group with a trailing star", () => {
    const { matched } = matchGraphics(["app/*"], registry);
    expect(matched.every((graphic) => graphic.group === "app")).toBe(true);
    expect(matched.length).toBeGreaterThan(1);
  });

  it("accepts a bare group as shorthand, because that is what people type", () => {
    expect(matchGraphics(["app"], registry).matched).toEqual(
      matchGraphics(["app/*"], registry).matched,
    );
  });

  it("matches everything for a lone star, and for a star over a star", () => {
    expect(matchGraphics(["*"], registry).matched).toHaveLength(
      registry.length,
    );
    expect(matchGraphics(["*/*"], registry).matched).toHaveLength(
      registry.length,
    );
  });

  it("reports a pattern that named nothing rather than silently rendering less", () => {
    expect(matchGraphics(["page/nope"], registry).unmatched).toEqual([
      "page/nope",
    ]);
  });

  it("does not repeat a graphic named twice over", () => {
    const { matched } = matchGraphics(["page/*", "page/home"], registry);
    expect(new Set(matched.map((g) => g.name)).size).toBe(matched.length);
  });
});

describe("the graphic x format matrix", () => {
  it("is sparse: savvycal belongs to the club lockup alone", () => {
    const supports = registry.filter((graphic) =>
      graphic.formats.includes("savvycal"),
    );
    expect(supports.map((graphic) => graphic.name)).toEqual(["brand/club"]);
  });

  /**
   * The rule the whole restructure was for: anything the club makes may end up
   * on the GDG on Campus platform, so everything has those two renditions.
   */
  it("gives every graphic both GDG renditions", () => {
    for (const graphic of registry) {
      expect(graphic.formats, graphic.name).toContain("gdgc-wide");
      expect(graphic.formats, graphic.name).toContain("gdgc-square");
    }
  });

  it("skips pairings that do not exist, and says which", () => {
    const club = registry.filter((graphic) => graphic.name === "brand/club");
    const { selections, unsupported } = pair(club, ["og", "icon-512"]);

    expect(selections.map((s) => s.format.name)).toEqual(["og"]);
    expect(unsupported).toEqual([
      { graphic: "brand/club", format: "icon-512" },
    ]);
  });

  it("offers only formats the chosen graphics support", () => {
    const names = formatsFor(
      registry.filter((graphic) => graphic.group === "page"),
    ).map((format) => format.name);

    expect(names).toContain("og");
    expect(names).not.toContain("icon-512");
  });

  /** A flat `--out` writes `<stem>-<format>.png`, so stems have to be unique. */
  it("keeps every leaf unique", () => {
    expect(() => assertUniqueStems(registry)).not.toThrow();
  });

  it("catches a duplicate leaf rather than overwriting one file with another", () => {
    const clash = [
      { name: "a/x", group: "a", stem: "x" },
      { name: "b/x", group: "b", stem: "x" },
    ] as Graphic[];

    expect(() => assertUniqueStems(clash)).toThrow(/share the leaf/);
  });
});

describe("no two graphics write to the same default path", () => {
  it("holds across every supported format", () => {
    const seen = new Map<string, string>();

    for (const graphic of registry) {
      for (const name of graphic.formats) {
        const { dir, file } = graphic.destination({ name } as never);
        // `destination` only reads `format.name` and `format.family` for the
        // pinned cases; a name-only stand-in is enough to enumerate paths.
        const path = `${dir}/${file}`;
        const clash = seen.get(path);
        expect(
          clash,
          `${graphic.name} ${name} collides with ${clash}`,
        ).toBeUndefined();
        seen.set(path, `${graphic.name} ${name}`);
      }
    }
  });
});

describe("argument parsing", () => {
  it("splits --flag=value so the shared positional parser still works", () => {
    expect(
      normalizeArgv(["images", "--format=og,gdgc-wide", "page/home"]),
    ).toEqual(["images", "--format", "og,gdgc-wide", "page/home"]);
  });

  it("leaves a bare flag and its spaced value alone", () => {
    expect(normalizeArgv(["--out", "~/images"])).toEqual(["--out", "~/images"]);
  });

  it("reads both spellings of --format the same way", () => {
    expect(parseImagesArgs(["--format=og,gdgc-wide"]).formats).toEqual([
      "og",
      "gdgc-wide",
    ]);
    expect(parseImagesArgs(["--format", "og,gdgc-wide"]).formats).toEqual([
      "og",
      "gdgc-wide",
    ]);
  });

  it("does not read a flag's value as a graphic name", () => {
    expect(parseImagesArgs(["--format", "og", "page/home"]).patterns).toEqual([
      "page/home",
    ]);
  });

  it("trims and drops blanks in a comma list", () => {
    expect(commaList(" og , , gdgc-wide ")).toEqual(["og", "gdgc-wide"]);
  });

  it("expands a leading ~ the shell would have expanded unquoted", () => {
    expect(expandHome("~/images")).toMatch(/^\/.*\/images$/);
    expect(expandHome("./images")).toBe("./images");
    // Not a home reference: a directory that merely starts with the character.
    expect(expandHome("~images")).toBe("~images");
  });
});

describe("when the database is needed", () => {
  it("is needed for a wildcard, because a wildcard means everything", () => {
    expect(wantsEvents(["*"])).toBe(true);
    expect(wantsEvents(["*/*"])).toBe(true);
  });

  it("is needed with no pattern at all, because the picker lists meetings", () => {
    expect(wantsEvents([])).toBe(true);
  });

  it("is not needed for graphics that come out of this repo", () => {
    expect(wantsEvents(["page/*", "app/dogdays"])).toBe(false);
  });

  /**
   * The distinction that decides whether an unreachable database is a warning
   * or a failure: sweeping events up is degradable, asking for them is not.
   */
  it("separates naming events from sweeping them up", () => {
    expect(namesEvents(["event/*"])).toBe(true);
    expect(namesEvents(["event/2026-09-08"])).toBe(true);
    expect(namesEvents(["*"])).toBe(false);
  });
});
